"""
CRM 3.0 — Background Scheduler Helpers
Pure functions used by the cron scheduler endpoints and tests.
"""

from datetime import datetime, timezone


def is_job_locked(lock_until: "str | None") -> bool:
    """Return True if the job has an active (non-expired) lock."""
    if lock_until is None:
        return False
    try:
        lock_dt = datetime.fromisoformat(lock_until.replace("Z", "+00:00"))
        return lock_dt > datetime.now(timezone.utc)
    except (ValueError, AttributeError):
        return False


def is_permanently_failed(attempts: int, max_attempts: int) -> bool:
    """Return True when a job has exhausted all retry attempts."""
    return attempts >= max_attempts


def verify_cron_secret(provided: str, expected: str) -> bool:
    """Constant-time comparison for cron secret verification."""
    import hmac
    return hmac.compare_digest(provided, expected)


def compute_retry_run_at(attempt: int) -> str:
    """Return ISO timestamp for next retry using exponential backoff."""
    from datetime import timedelta
    backoff_minutes = 2 ** attempt
    return (datetime.now(timezone.utc) + timedelta(minutes=backoff_minutes)).isoformat()
