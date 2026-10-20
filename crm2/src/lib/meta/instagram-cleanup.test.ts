import { describe, it, expect } from "vitest";
import {
  resolveInstagramAccountId,
  planIgCleanup,
  assertValidInstagramRow,
  type IgCleanupRow,
} from "./instagram-cleanup";

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------

const ACC = "account-1";
const PAGE = "page-1";

function igRow(overrides: Partial<IgCleanupRow> = {}): IgCleanupRow {
  return {
    id: "row-ig",
    account_id: ACC,
    page_id: PAGE,
    platform: "instagram",
    status: "active",
    instagram_account_id: "ig-old-999",
    ...overrides,
  };
}

function fbRow(overrides: Partial<IgCleanupRow> = {}): IgCleanupRow {
  return {
    id: "row-fb",
    account_id: ACC,
    page_id: PAGE,
    platform: "facebook",
    status: "active",
    instagram_account_id: null,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// REQUIRED CASE 1
//
// Existing: instagram row, status=active, instagram_account_id=NULL
// Fresh OAuth: no Instagram account (freshIgId=null)
//
// Expected:
//   - old row is identified for deletion (rowsToDelete.length === 1)
//   - no new row should be created (shouldCreateFresh === false)
// ---------------------------------------------------------------------------

describe("CASE 1 — stale NULL instagram row + fresh OAuth has no IG account", () => {
  const staleNullRow = igRow({ instagram_account_id: null });
  const result = planIgCleanup([staleNullRow, fbRow()], null);

  it("identifies the stale row for deletion", () => {
    expect(result.rowsToDelete).toHaveLength(1);
    expect(result.rowsToDelete[0].id).toBe("row-ig");
  });

  it("does not create a fresh Instagram connection", () => {
    expect(result.shouldCreateFresh).toBe(false);
    expect(result.freshIgId).toBeNull();
  });

  it("existingCount reflects the stale row", () => {
    expect(result.existingCount).toBe(1);
  });

  it("never marks the Facebook row for deletion", () => {
    expect(result.rowsToDelete.every((r) => r.platform === "instagram")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// REQUIRED CASE 2
//
// Existing: old Instagram row (any instagram_account_id)
// Fresh OAuth: instagram_account_id = VALID_ID
//
// Expected:
//   - old row is identified for deletion
//   - exactly one fresh valid connection should be created
//   - freshIgId is the new valid id
// ---------------------------------------------------------------------------

describe("CASE 2 — old instagram row + fresh OAuth has valid IG account", () => {
  const oldRow = igRow({ instagram_account_id: "old-ig-999" });
  const result = planIgCleanup([oldRow, fbRow()], "new-ig-123");

  it("identifies the old row for deletion", () => {
    expect(result.rowsToDelete).toHaveLength(1);
    expect(result.rowsToDelete[0].instagram_account_id).toBe("old-ig-999");
  });

  it("creates a fresh connection with the new valid id", () => {
    expect(result.shouldCreateFresh).toBe(true);
    expect(result.freshIgId).toBe("new-ig-123");
  });

  it("freshIgId is never null when shouldCreateFresh is true", () => {
    if (result.shouldCreateFresh) {
      expect(result.freshIgId).not.toBeNull();
    }
  });
});

// ---------------------------------------------------------------------------
// planIgCleanup — additional edge cases
// ---------------------------------------------------------------------------

describe("planIgCleanup — edge cases", () => {
  it("deletes stale row even when fresh OAuth has no IG account (no IG linked)", () => {
    // This is the core invariant: delete is unconditional.
    const stale = igRow({ instagram_account_id: null });
    const r = planIgCleanup([stale], null);
    expect(r.rowsToDelete).toHaveLength(1);
    expect(r.shouldCreateFresh).toBe(false);
  });

  it("deletes stale row even when fresh OAuth has no IG account (permissions missing)", () => {
    const stale = igRow({ instagram_account_id: "some-id" });
    // freshIgId=null because permissions were not granted
    const r = planIgCleanup([stale], null);
    expect(r.rowsToDelete).toHaveLength(1);
    expect(r.shouldCreateFresh).toBe(false);
  });

  it("no existing rows + no fresh IG → nothing to delete, nothing to create", () => {
    const r = planIgCleanup([fbRow()], null);
    expect(r.rowsToDelete).toHaveLength(0);
    expect(r.existingCount).toBe(0);
    expect(r.shouldCreateFresh).toBe(false);
  });

  it("no existing rows + valid fresh IG → nothing to delete, create fresh", () => {
    const r = planIgCleanup([fbRow()], "brand-new-ig");
    expect(r.rowsToDelete).toHaveLength(0);
    expect(r.shouldCreateFresh).toBe(true);
    expect(r.freshIgId).toBe("brand-new-ig");
  });

  it("never includes facebook rows in rowsToDelete", () => {
    const r = planIgCleanup([fbRow(), igRow()], "ig-id");
    expect(r.rowsToDelete.every((row) => row.platform === "instagram")).toBe(true);
  });

  it("shouldCreateFresh and freshIgId are always consistent", () => {
    const cases: Array<[IgCleanupRow[], string | null]> = [
      [[], null],
      [[], "ig-1"],
      [[igRow({ instagram_account_id: null })], null],
      [[igRow()], "ig-2"],
    ];
    for (const [rows, freshId] of cases) {
      const r = planIgCleanup(rows, freshId);
      expect(r.shouldCreateFresh).toBe(r.freshIgId !== null);
    }
  });
});

// ---------------------------------------------------------------------------
// resolveInstagramAccountId
// ---------------------------------------------------------------------------

describe("resolveInstagramAccountId", () => {
  it("returns null when Instagram permissions were not granted", () => {
    expect(
      resolveInstagramAccountId({ instagramPermissionsGranted: false, pageInstagramId: "ig-123" }),
    ).toBeNull();
  });

  it("returns null when pageInstagramId is null", () => {
    expect(
      resolveInstagramAccountId({ instagramPermissionsGranted: true, pageInstagramId: null }),
    ).toBeNull();
  });

  it("returns null when pageInstagramId is undefined", () => {
    expect(
      resolveInstagramAccountId({ instagramPermissionsGranted: true, pageInstagramId: undefined }),
    ).toBeNull();
  });

  it("returns null when pageInstagramId is empty string", () => {
    expect(
      resolveInstagramAccountId({ instagramPermissionsGranted: true, pageInstagramId: "" }),
    ).toBeNull();
  });

  it("returns null when pageInstagramId is whitespace only", () => {
    expect(
      resolveInstagramAccountId({ instagramPermissionsGranted: true, pageInstagramId: "   " }),
    ).toBeNull();
  });

  it("returns the id when permissions are granted and id is valid", () => {
    expect(
      resolveInstagramAccountId({ instagramPermissionsGranted: true, pageInstagramId: "ig-456" }),
    ).toBe("ig-456");
  });
});

// ---------------------------------------------------------------------------
// assertValidInstagramRow — invariant enforcement
// ---------------------------------------------------------------------------

describe("assertValidInstagramRow", () => {
  it("does not throw for a valid instagram row", () => {
    expect(() =>
      assertValidInstagramRow({ platform: "instagram", instagram_account_id: "ig-123" }),
    ).not.toThrow();
  });

  it("throws when instagram_account_id is null", () => {
    expect(() =>
      assertValidInstagramRow({ platform: "instagram", instagram_account_id: null }),
    ).toThrow(/invariant violation/i);
  });

  it("throws when instagram_account_id is undefined", () => {
    expect(() =>
      assertValidInstagramRow({ platform: "instagram", instagram_account_id: undefined }),
    ).toThrow(/invariant violation/i);
  });

  it("throws when instagram_account_id is empty string", () => {
    expect(() =>
      assertValidInstagramRow({ platform: "instagram", instagram_account_id: "" }),
    ).toThrow(/invariant violation/i);
  });

  it("does not throw for a facebook row even with null instagram_account_id", () => {
    expect(() =>
      assertValidInstagramRow({ platform: "facebook", instagram_account_id: null }),
    ).not.toThrow();
  });
});
