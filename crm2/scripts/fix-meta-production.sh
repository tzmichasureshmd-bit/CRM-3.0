#!/usr/bin/env bash
# =============================================================================
# fix-meta-production.sh
#
# Fixes "Meta isn't configured on this server yet" on the production VPS.
#
# What it does:
#   1. Finds the project directory (first arg, or scans common locations).
#   2. Ensures META_* env vars exist in the host `.env` next to
#      docker-compose.yml (they are passed into the container at runtime).
#   3. Rebuilds + restarts the container WITHOUT --no-cache if unchanged.
#   4. Verifies the env reached the container and the live site is fresh.
#
# Usage (run on the server, e.g. as root or a sudo user):
#   bash fix-meta-production.sh            # auto-detects the project dir
#   bash fix-meta-production.sh /opt/wacrm # or pass the path explicitly
#
# Requires: bash, docker, docker compose plugin, and your META_* values.
# =============================================================================
set -euo pipefail

# ---------------------------------------------------------------------------
# 1. Locate the project directory
# ---------------------------------------------------------------------------
PROJECT_DIR="${1:-}"
if [[ -z "$PROJECT_DIR" ]]; then
  CANDIDATES=(/opt/wacrm /opt/tzmicha /root/wacrm /root/tzmicha /home/*/wacrm /home/*/tzmicha /var/www/*/tzmicha* /var/www/wacrm /srv/tzmicha /srv/wacrm "$HOME/wacrm" "$HOME/tzmicha" "$HOME/Tzmicha" "$HOME/Tzmicha_CRM-main" "$HOME/tzmicha-crm" "$HOME/Tzmicha_CRM")
  for c in "${CANDIDATES[@]}"; do
    if [[ -f "$c/docker-compose.yml" || -f "$c/docker-compose.yaml" ]]; then
      PROJECT_DIR="$c"
      break
    fi
  done
fi
if [[ -z "$PROJECT_DIR" ]] || [[ ! -f "$PROJECT_DIR/docker-compose.yml" && ! -f "$PROJECT_DIR/docker-compose.yaml" ]]; then
  echo "ERROR: could not find docker-compose.yml. Pass the path explicitly:" >&2
  echo "  bash fix-meta-production.sh /path/to/project" >&2
  exit 1
fi
cd "$PROJECT_DIR"
echo "== Project dir: $PROJECT_DIR"

# ---------------------------------------------------------------------------
# 2. Ensure META_* env vars in the host .env
# ---------------------------------------------------------------------------
ENV_FILE=".env"
ENV_MISSING=0
add_or_update() {
  local key="$1"
  local value="$2"
  if [[ -z "$value" ]]; then
    ENV_MISSING=1
    echo "  NOTE: $key is empty in the host .env — edit '$ENV_FILE' and set it, then re-run."
    return
  fi
  if grep -q "^${key}=" "$ENV_FILE" 2>/dev/null; then
    sed -i "s|^${key}=.*|${key}=${value}|" "$ENV_FILE"
    echo "  updated ${key}"
  else
    printf '\n%s=%s\n' "$key" "$value" >> "$ENV_FILE"
    echo "  appended ${key}"
  fi
}

if [[ ! -f "$ENV_FILE" ]]; then touch "$ENV_FILE"; fi
if [[ ! -s "$ENV_FILE" ]]; then
  echo "WARNING: $ENV_FILE is empty — the app may be configured elsewhere." >&2
fi

META_APP_ID="$(grep -E "^META_APP_ID=" "$ENV_FILE" 2>/dev/null | head -1 | cut -d= -f2- || true)"
META_APP_SECRET="$(grep -E "^META_APP_SECRET=" "$ENV_FILE" 2>/dev/null | head -1 | cut -d= -f2- || true)"
META_EMBEDDED_SIGNUP_CONFIG_ID="$(grep -E "^META_EMBEDDED_SIGNUP_CONFIG_ID=" "$ENV_FILE" 2>/dev/null | head -1 | cut -d= -f2- || true)"
META_VERIFY_TOKEN="$(grep -E "^META_VERIFY_TOKEN=" "$ENV_FILE" 2>/dev/null | head -1 | cut -d= -f2- || true)"
SITE_URL="$(grep -E "^NEXT_PUBLIC_SITE_URL=" "$ENV_FILE" 2>/dev/null | head -1 | cut -d= -f2- || true)"

add_or_update "META_APP_ID" "$META_APP_ID"
add_or_update "META_APP_SECRET" "$META_APP_SECRET"
add_or_update "META_EMBEDDED_SIGNUP_CONFIG_ID" "$META_EMBEDDED_SIGNUP_CONFIG_ID"
add_or_update "META_VERIFY_TOKEN" "$META_VERIFY_TOKEN"
add_or_update "NEXT_PUBLIC_SITE_URL" "${SITE_URL:-https://crm.tzmicha.com}"

if [[ "$ENV_MISSING" -eq 1 ]]; then
  echo ""
  echo "======================================================================"
  echo "  ACTION REQUIRED: open '$ENV_FILE' on the server and fill in these"
  echo "  values, then re-run this script:"
  echo "    META_APP_ID="
  echo "    META_APP_SECRET="
  echo "    META_EMBEDDED_SIGNUP_CONFIG_ID="
  echo "    META_VERIFY_TOKEN="
  echo "======================================================================"
  exit 1
fi

# ---------------------------------------------------------------------------
# 3. Rebuild + restart the container
# ---------------------------------------------------------------------------
echo "== Rebuilding and restarting the container (this takes a few minutes)..."
# Use build (no cache) to guarantee the fresh code + headers reach the image.
docker compose build --no-cache
docker compose up -d
docker compose ps

# ---------------------------------------------------------------------------
# 4. Verify env reached the container
# ---------------------------------------------------------------------------
SERVICE="$(docker compose config --services | head -1)"
echo "== Verifying env inside container [$SERVICE]..."
docker compose exec -T "$SERVICE" printenv META_APP_ID META_APP_SECRET \
  META_EMBEDDED_SIGNUP_CONFIG_ID NEXT_PUBLIC_SITE_URL || true

echo ""
echo "== Verify the live site is serving the NEW build (cache header should be 'private, no-store'):"
trap 'echo "   (curl to the site failed — check network/reverse proxy)"' EXIT
curl -sI https://crm.tzmicha.com/ | grep -i "cache-control" || true

trap - EXIT
echo ""
echo "DONE. Now open https://crm.tzmicha.com/social-media and click"
echo "'Connect Facebook Account'. If Meta's login dialog opens, it works."