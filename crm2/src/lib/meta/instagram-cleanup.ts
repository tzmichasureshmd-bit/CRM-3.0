/**
 * Pure helpers for the Meta OAuth callback stale-connection cleanup.
 *
 * Extracted here so they can be unit-tested without Next.js server
 * dependencies (next/headers, next/server crash in a Node test env).
 */

export interface IgCleanupRow {
  id: string;
  account_id: string;
  page_id: string;
  platform: string;
  status: string;
  instagram_account_id: string | null;
}

/**
 * Determine the instagram_account_id to use for a fresh connection.
 *
 * Returns the id string when it is safe to create a new Instagram row,
 * or null when no row should be written. Enforces the invariant:
 * instagram_account_id is NEVER null/empty in an active Instagram row.
 */
export function resolveInstagramAccountId(opts: {
  instagramPermissionsGranted: boolean;
  pageInstagramId: string | null | undefined;
}): string | null {
  const { instagramPermissionsGranted, pageInstagramId } = opts;
  if (!instagramPermissionsGranted) return null;
  if (!pageInstagramId || pageInstagramId.trim() === "") return null;
  return pageInstagramId;
}

export interface IgCleanupResult {
  /** All existing Instagram rows that were identified for removal. */
  existingCount: number;
  /**
   * Rows that must be deleted from the database.
   * Always equals all existing Instagram rows for the account+page —
   * the delete is unconditional regardless of whether a fresh row will
   * be created.
   */
  rowsToDelete: IgCleanupRow[];
  /** Whether a fresh Instagram connection should be inserted. */
  shouldCreateFresh: boolean;
  /** The instagram_account_id for the new row, or null. */
  freshIgId: string | null;
}

/**
 * Compute the full cleanup+replace plan for Instagram connections on a
 * single Facebook Page reconnect.
 *
 * CONTRACT:
 *   - rowsToDelete is ALWAYS populated with all existing Instagram rows,
 *     regardless of freshIgId. The old row is removed even when no new
 *     row will be created (e.g. no IG account linked, or IG permissions
 *     not granted).
 *   - shouldCreateFresh is true ONLY when freshIgId is non-null.
 *   - It is structurally impossible for shouldCreateFresh=true and
 *     freshIgId=null to coexist.
 *
 * This function is pure (no I/O) so it can be tested exhaustively.
 * The caller is responsible for executing the deletes and insert.
 */
export function planIgCleanup(
  existingRows: IgCleanupRow[],
  freshIgId: string | null,
): IgCleanupResult {
  const igRows = existingRows.filter((r) => r.platform === "instagram");
  return {
    existingCount: igRows.length,
    rowsToDelete: igRows,          // unconditional — always delete all
    shouldCreateFresh: freshIgId !== null,
    freshIgId,
  };
}

/**
 * Validate that a row about to be inserted as an Instagram connection
 * satisfies the invariant. Throws if the invariant would be violated.
 *
 * This is a last-line-of-defence check called immediately before the
 * Supabase insert so a programming error can never silently persist a
 * broken row.
 */
export function assertValidInstagramRow(row: {
  platform: string;
  instagram_account_id: string | null | undefined;
}): void {
  if (row.platform !== "instagram") return;
  if (
    row.instagram_account_id === null ||
    row.instagram_account_id === undefined ||
    row.instagram_account_id.trim() === ""
  ) {
    throw new Error(
      "Invariant violation: instagram_account_id must not be null/empty on an instagram connection row",
    );
  }
}
