// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0. See LICENSE file in the project root for full license text.

import { describe, it, expect } from "vitest";
import {
  parseBulkEmails,
  mapInvitationError,
  isValidInviteRole,
} from "./invitation-utils";

describe("isValidInviteRole (v0.42.6 M1)", () => {
  it("accepts the two permitted roles", () => {
    expect(isValidInviteRole("editor")).toBe(true);
    expect(isValidInviteRole("viewer")).toBe(true);
  });

  it("rejects 'owner' (privilege escalation attempt)", () => {
    expect(isValidInviteRole("owner")).toBe(false);
  });

  it("rejects empty string, null, undefined, and other falsy values", () => {
    expect(isValidInviteRole("")).toBe(false);
    expect(isValidInviteRole(null)).toBe(false);
    expect(isValidInviteRole(undefined)).toBe(false);
    expect(isValidInviteRole(0)).toBe(false);
    expect(isValidInviteRole(false)).toBe(false);
  });

  it("rejects arbitrary strings, numbers, objects", () => {
    expect(isValidInviteRole("admin")).toBe(false);
    expect(isValidInviteRole("EDITOR")).toBe(false); // case-sensitive
    expect(isValidInviteRole("editor ")).toBe(false); // no whitespace tolerance
    expect(isValidInviteRole(42)).toBe(false);
    expect(isValidInviteRole({ role: "editor" })).toBe(false);
    expect(isValidInviteRole(["editor"])).toBe(false);
  });
});

describe("parseBulkEmails", () => {
  it("splits on whitespace, commas, semicolons, and newlines", () => {
    const raw = "a@b.co, c@d.co; e@f.co\ng@h.co  i@j.co";
    const { valid, invalid } = parseBulkEmails(raw);
    expect(valid).toEqual([
      "a@b.co",
      "c@d.co",
      "e@f.co",
      "g@h.co",
      "i@j.co",
    ]);
    expect(invalid).toEqual([]);
  });

  it("places malformed tokens in the invalid array (not valid)", () => {
    const { valid, invalid } = parseBulkEmails("a@b.co, notanemail, c@d.co");
    expect(valid).toEqual(["a@b.co", "c@d.co"]);
    expect(invalid).toEqual(["notanemail"]);
  });

  it("returns empty valid + populated invalid when no tokens parse", () => {
    const { valid, invalid } = parseBulkEmails("foo bar baz, not-an-email");
    expect(valid).toEqual([]);
    expect(invalid).toEqual(["foo", "bar", "baz", "not-an-email"]);
  });

  it("returns both populated for a mixed batch", () => {
    const { valid, invalid } = parseBulkEmails("good@x.co; bad@; other@y.co");
    expect(valid).toEqual(["good@x.co", "other@y.co"]);
    expect(invalid).toEqual(["bad@"]);
  });

  it("deduplicates case-insensitively", () => {
    const { valid } = parseBulkEmails("A@B.co, a@b.co, A@B.CO");
    expect(valid).toEqual(["a@b.co"]);
  });

  it("lowercases all tokens", () => {
    const { valid } = parseBulkEmails("ALICE@EXAMPLE.COM");
    expect(valid).toEqual(["alice@example.com"]);
  });
});

describe("mapInvitationError", () => {
  function err(code: string): unknown {
    return { code };
  }

  it("resource-exhausted × send → daily cap copy", () => {
    expect(mapInvitationError(err("functions/resource-exhausted"), "send"))
      .toMatch(/daily/i);
  });

  it("resource-exhausted × resend → per-invite cap copy", () => {
    expect(mapInvitationError(err("functions/resource-exhausted"), "resend"))
      .toMatch(/resend/i);
  });

  it("unauthenticated → sign-in copy", () => {
    expect(mapInvitationError(err("functions/unauthenticated"), "send"))
      .toMatch(/sign in/i);
  });

  it("permission-denied → owner-only copy", () => {
    expect(mapInvitationError(err("functions/permission-denied"), "revoke"))
      .toMatch(/owner/i);
  });

  it("unknown / generic error → generic copy", () => {
    expect(mapInvitationError(new Error("oops"), "send"))
      .toMatch(/something went wrong/i);
    expect(mapInvitationError(undefined, "resend"))
      .toMatch(/something went wrong/i);
  });
});
