// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

// AI-2 (v0.79.x security audit): on a shared browser, whoever paired an AI earlier must not leave
// the session behind for the next person. These pin the key-clearing primitive itself; the
// StorageProvider wiring (sign-out + change of user) is covered in the provider integration tests.

import { describe, it, expect, beforeEach } from "vitest";
import {
  clearAiConnectivityKeys,
  AI_SESSION_ID_KEY,
  AI_CONSENT_KEY,
  AI_LAST_SEQ_PREFIX,
} from "./ai-connectivity-constants";

describe("clearAiConnectivityKeys (AI-2)", () => {
  beforeEach(() => localStorage.clear());

  it("removes the session id, the stored consent, and every per-session op cursor — and nothing else", () => {
    localStorage.setItem(AI_SESSION_ID_KEY, "sess-123");
    localStorage.setItem(AI_CONSENT_KEY, JSON.stringify({ version: 1, read: true, write: true }));
    localStorage.setItem(AI_LAST_SEQ_PREFIX + "sess-123", "7");
    localStorage.setItem(AI_LAST_SEQ_PREFIX + "sess-456", "3"); // a second session's cursor
    localStorage.setItem("spert:storage-mode", "cloud"); // an unrelated key must survive

    clearAiConnectivityKeys();

    expect(localStorage.getItem(AI_SESSION_ID_KEY)).toBeNull();
    expect(localStorage.getItem(AI_CONSENT_KEY)).toBeNull();
    expect(localStorage.getItem(AI_LAST_SEQ_PREFIX + "sess-123")).toBeNull();
    expect(localStorage.getItem(AI_LAST_SEQ_PREFIX + "sess-456")).toBeNull();
    expect(localStorage.getItem("spert:storage-mode")).toBe("cloud");
  });

  it("is a no-op, and does not throw, when no AI keys are present", () => {
    expect(() => clearAiConnectivityKeys()).not.toThrow();
  });
});
