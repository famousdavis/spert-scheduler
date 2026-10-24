// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { describe, it, expect, beforeEach } from "vitest";
import {
  getLastSeq,
  setLastSeq,
  clearLastSeq,
  safeParseConsent,
  storedSessionMatchesProject,
  opsTargetWrongProject,
} from "./ai-connectivity-utils";
import { AI_LAST_SEQ_PREFIX } from "@app/ai-connectivity-constants";

describe("ai-connectivity-utils", () => {
  beforeEach(() => localStorage.clear());

  describe("seq cursor", () => {
    it("getLastSeq returns 0 for an unset session", () => {
      expect(getLastSeq("s1")).toBe(0);
    });

    it("round-trips a seq via setLastSeq/getLastSeq", () => {
      setLastSeq("s1", 42);
      expect(getLastSeq("s1")).toBe(42);
    });

    it("NaN-guards a corrupt stored value to 0", () => {
      localStorage.setItem(`${AI_LAST_SEQ_PREFIX}s1`, "not-a-number");
      expect(getLastSeq("s1")).toBe(0);
    });

    it("clearLastSeq removes the cursor", () => {
      setLastSeq("s1", 5);
      clearLastSeq("s1");
      expect(getLastSeq("s1")).toBe(0);
    });

    it("cursors are namespaced per session id", () => {
      setLastSeq("s1", 3);
      setLastSeq("s2", 9);
      expect(getLastSeq("s1")).toBe(3);
      expect(getLastSeq("s2")).toBe(9);
    });
  });

  describe("safeParseConsent", () => {
    it("returns null for null or empty input", () => {
      expect(safeParseConsent(null)).toBeNull();
      expect(safeParseConsent("")).toBeNull();
    });

    it("returns null for malformed JSON", () => {
      expect(safeParseConsent("{not json")).toBeNull();
    });

    it("parses a valid consent object", () => {
      const raw = JSON.stringify({ version: 1, read: true, write: true });
      expect(safeParseConsent(raw)).toEqual({ version: 1, read: true, write: true });
    });
  });

  // AI-4 (v0.79.8 security self-audit): a session is bound to the project it was
  // opened for, so its queued edits can never drain into a different project.
  describe("storedSessionMatchesProject (resume guard)", () => {
    it("allows resume only when the stored openProductId is exactly this project", () => {
      expect(storedSessionMatchesProject("P1", "P1")).toBe(true);
    });

    it("blocks resume when the stored session was opened for a different project", () => {
      expect(storedSessionMatchesProject("P2", "P1")).toBe(false);
    });

    it("blocks resume when the stored session records no project (missing/legacy)", () => {
      expect(storedSessionMatchesProject(null, "P1")).toBe(false);
      expect(storedSessionMatchesProject(undefined, "P1")).toBe(false);
    });

    it("does not treat the empty string as a match for a real project id", () => {
      expect(storedSessionMatchesProject("", "P1")).toBe(false);
    });
  });

  describe("opsTargetWrongProject (drain guard)", () => {
    it("rejects a batch once the open project diverges from the bound project", () => {
      expect(opsTargetWrongProject("P1", "P2")).toBe(true);
    });

    it("applies a batch while the open project still matches the bound project", () => {
      expect(opsTargetWrongProject("P1", "P1")).toBe(false);
    });

    it("never rejects before a session has bound a project (null)", () => {
      expect(opsTargetWrongProject(null, "P1")).toBe(false);
    });
  });
});
