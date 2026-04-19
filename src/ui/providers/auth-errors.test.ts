// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0. See LICENSE file in the project root for full license text.

import { describe, it, expect } from "vitest";
import { classifyPopupError, SIGN_IN_POPUP_BLOCKED } from "./auth-errors";

describe("classifyPopupError", () => {
  it("returns 'ignore' when the user closes the popup", () => {
    expect(classifyPopupError({ code: "auth/popup-closed-by-user" })).toBe(
      "ignore"
    );
  });

  it("returns 'ignore' when a second popup request is cancelled", () => {
    expect(classifyPopupError({ code: "auth/cancelled-popup-request" })).toBe(
      "ignore"
    );
  });

  it("returns 'redirect' when the popup is blocked by the browser", () => {
    expect(classifyPopupError({ code: "auth/popup-blocked" })).toBe("redirect");
  });

  it("returns 'rethrow' for unknown Firebase error codes", () => {
    expect(classifyPopupError({ code: "auth/network-request-failed" })).toBe(
      "rethrow"
    );
    expect(classifyPopupError({ code: "auth/internal-error" })).toBe("rethrow");
  });

  it("returns 'rethrow' for errors without a code", () => {
    expect(classifyPopupError(new Error("boom"))).toBe("rethrow");
    expect(classifyPopupError({})).toBe("rethrow");
    expect(classifyPopupError(null)).toBe("rethrow");
    expect(classifyPopupError(undefined)).toBe("rethrow");
  });
});

describe("SIGN_IN_POPUP_BLOCKED constant", () => {
  it("is a stable string for caller toast-matching", () => {
    expect(SIGN_IN_POPUP_BLOCKED).toBe("sign-in-popup-blocked");
  });
});
