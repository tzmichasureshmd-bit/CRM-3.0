import { afterEach, describe, expect, it, vi } from "vitest";

import { assertSuperAdminProfile } from "./super-admin-policy";

// Reads process.env.SUPER_ADMIN_EMAILS at call time, so it can be varied
// per test without module reloading.
afterEach(() => {
  vi.unstubAllEnvs();
});

function withAllowlist(value: string) {
  vi.stubEnv("SUPER_ADMIN_EMAILS", value);
}

describe("assertSuperAdminProfile", () => {
  it("rejects a missing profile", () => {
    expect(assertSuperAdminProfile(null).authorized).toBe(false);
    expect(assertSuperAdminProfile(undefined).authorized).toBe(false);
  });

  it("rejects a normal user", () => {
    const v = assertSuperAdminProfile({ platform_role: "user", email: "a@b.co" });
    expect(v.authorized).toBe(false);
    expect(v.code).toBe("not-super-admin");
  });

  // This is the escalation path that was removed: `role` is not a
  // platform column, no migration writes it, and the is_super_admin()
  // SQL helper ignores it. Honouring it would hand the whole console to
  // any row that happened to carry the legacy value.
  it("does not accept the legacy `role` column as a substitute", () => {
    // The extra `role` key is not on the parameter type — that is the
    // point: even if a row carries the stale value it is ignored.
    const v = assertSuperAdminProfile({
      platform_role: "user",
      role: "super_admin",
      email: "a@b.co",
    } as never);
    expect(v.authorized).toBe(false);
  });

  it("allows platform_role=super_admin when no allowlist is configured", () => {
    // Regression guard: /admin previously redirected EVERYONE to
    // /dashboard when SUPER_ADMIN_EMAILS was unset, which is the state
    // of a default self-hosted deployment.
    withAllowlist("");
    expect(
      assertSuperAdminProfile({ platform_role: "super_admin", email: "a@b.co" })
        .authorized,
    ).toBe(true);
  });

  it("enforces the allowlist once it is configured", () => {
    withAllowlist("boss@tzmicha.com, second@tzmicha.com");

    expect(
      assertSuperAdminProfile({
        platform_role: "super_admin",
        email: "boss@tzmicha.com",
      }).authorized,
    ).toBe(true);

    const denied = assertSuperAdminProfile({
      platform_role: "super_admin",
      email: "someone-else@tzmicha.com",
    });
    expect(denied.authorized).toBe(false);
    expect(denied.code).toBe("not-allowlisted");
  });

  it("matches the allowlist case-insensitively and ignores spacing", () => {
    withAllowlist(" boss@Tzmicha.com , second@tzmicha.com ");
    expect(
      assertSuperAdminProfile({
        platform_role: "super_admin",
        email: "BOSS@tzmicha.com",
      }).authorized,
    ).toBe(true);
  });

  it("denies a super admin with no email when an allowlist is set", () => {
    withAllowlist("boss@tzmicha.com");
    expect(
      assertSuperAdminProfile({ platform_role: "super_admin", email: null })
        .authorized,
    ).toBe(false);
  });
});
