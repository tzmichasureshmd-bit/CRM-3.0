FROM node:20-alpine AS base

# Install dependencies only when needed
FROM base AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app

# postinstall (npm ci lifecycle) runs `node scripts/patch-whatsapp-embedded-signup.mjs`,
# so scripts/ MUST exist before installing or the build fails and the deploy
# silently reuses the previous image (production never updates).
COPY package.json package-lock.json ./
COPY scripts ./scripts
RUN npm ci --legacy-peer-deps

# Rebuild the source code only when needed
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Set environment variables for build.
# NEXT_PUBLIC_* values are inlined into the client bundle, so they MUST be
# present at build time or the embedded signup client fallback + site URL
# resolve to empty. Runtime server-side reads (META_APP_ID, META_APP_SECRET,
# META_EMBEDDED_SIGNUP_CONFIG_ID, META_VERIFY_TOKEN) come from the container
# env passed in docker-compose.yml.
ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY
ARG NEXT_PUBLIC_SITE_URL
ARG NEXT_PUBLIC_META_APP_ID
ARG NEXT_PUBLIC_META_EMBEDDED_SIGNUP_CONFIG_ID
ARG NEXT_PUBLIC_META_EMBEDDED_SIGNUP_REDIRECT_URI
ARG NEXT_PUBLIC_GIT_COMMIT
ARG NEXT_PUBLIC_APP_VERSION

ENV NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL
ENV NEXT_PUBLIC_SUPABASE_ANON_KEY=$NEXT_PUBLIC_SUPABASE_ANON_KEY
ENV NEXT_PUBLIC_SITE_URL=$NEXT_PUBLIC_SITE_URL
ENV NEXT_PUBLIC_META_APP_ID=$NEXT_PUBLIC_META_APP_ID
ENV NEXT_PUBLIC_META_EMBEDDED_SIGNUP_CONFIG_ID=$NEXT_PUBLIC_META_EMBEDDED_SIGNUP_CONFIG_ID
ENV NEXT_PUBLIC_META_EMBEDDED_SIGNUP_REDIRECT_URI=$NEXT_PUBLIC_META_EMBEDDED_SIGNUP_REDIRECT_URI
ENV NEXT_PUBLIC_GIT_COMMIT=$NEXT_PUBLIC_GIT_COMMIT
ENV NEXT_PUBLIC_APP_VERSION=$NEXT_PUBLIC_APP_VERSION
ENV NEXT_TELEMETRY_DISABLED=1

RUN npm run build

# Production image
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs

EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

CMD ["node", "server.js"]
