"""
CRM 3.0 — Realtime Subscription Helpers
Pure functions for building account-scoped realtime channel configs.
"""


def build_realtime_filter(table: str, account_id: str) -> str:
    """Return a Postgres replication filter string scoped to the account."""
    return f"account_id=eq.{account_id}"


def build_channel_name(prefix: str, account_id: str) -> str:
    """Return a channel name that includes the account_id to prevent cross-tenant subscriptions."""
    return f"crm3-{prefix}-{account_id}"
