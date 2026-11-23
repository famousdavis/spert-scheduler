// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

/**
 * FRAME26 stage 4 (v0.88.0): the four app-wide notices are the frame's `.sf-notice` (contract §3, "Notices slot"). Each
 * takes its variant's ground, border and text colours, its radius and padding from the stylesheet, so none carries a
 * utility for those; and each dismiss button is the frame's 28 px outlined `.sf-notice-dismiss`, which no other button
 * in a notice is: the invitation's ×, its sign-in buttons and AiTeardown's "Try again" keep their own look.
 */

import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

const { getPendingMock } = vi.hoisted(() => ({ getPendingMock: vi.fn<() => string | null>() }));
vi.mock("@app/ai-session-teardown", () => ({
  getPendingAiTeardownSessionId: getPendingMock,
  retryPendingAiTeardown: vi.fn(() => Promise.resolve(false)),
  clearPendingAiTeardown: vi.fn(),
  AI_TEARDOWN_CHANGED_EVENT: "spert:scheduler-ai-teardown-changed",
}));
vi.mock("@ui/providers/AuthProvider", () => ({ useAuth: () => ({ user: null, firebaseAvailable: true }) }));
vi.mock("@ui/providers/StorageProvider", () => ({ useStorage: () => ({ mode: "local", storageReady: true }) }));
vi.mock("@ui/hooks/useSignInWithTosGate", () => ({
  useSignInWithTosGate: () => ({
    consentOpen: false, handleGoogleClick: vi.fn(), handleMicrosoftClick: vi.fn(), handleCancel: vi.fn(), handleAccept: vi.fn(),
  }),
}));

import { FirstRunBanner } from "./FirstRunBanner";
import { LocalStorageWarningBanner } from "./LocalStorageWarningBanner";
import { AiTeardownBanner } from "./AiTeardownBanner";
import { InvitationBanner } from "./InvitationBanner";

beforeEach(() => {
  localStorage.clear();
  getPendingMock.mockReset();
});
afterEach(cleanup);

/** A class the frame's notice sets, so a utility for it would be dead weight or, unlayered, lose anyway. */
const FRAME_OWNED = /^(?:dark:)?(?:bg-|border|rounded|p-|px-|py-|pt-|pb-|m-|mb-|mt-|mx-|max-w-|text-(?:blue|amber|green)-)/;

function noticeOf(text: RegExp): HTMLElement {
  const el = screen.getByText(text).closest(".sf-notice");
  if (!el) throw new Error("no .sf-notice around " + text);
  return el as HTMLElement;
}
const ownClasses = (el: HTMLElement) => (el.getAttribute("class") ?? "").split(/\s+/).filter(Boolean);

describe("FRAME26: the app-wide notices on the frame", () => {
  it("FirstRunBanner: info, 'Got it' is the frame's dismiss, the links inherit", () => {
    render(<FirstRunBanner />);
    const n = noticeOf(/free to use/);
    expect(n).toHaveClass("sf-notice", "sf-notice--info", "no-print");
    expect(ownClasses(n).filter((c) => FRAME_OWNED.test(c))).toEqual([]);
    expect(screen.getByRole("button", { name: "Got it" }).getAttribute("class")).toBe("sf-notice-dismiss");
    for (const a of n.querySelectorAll("a")) expect(a).not.toHaveAttribute("class");
  });

  it("LocalStorageWarningBanner: caution, 'Got it' is the frame's dismiss", () => {
    render(<LocalStorageWarningBanner />);
    const n = noticeOf(/exists only in this browser/);
    expect(n).toHaveClass("sf-notice", "sf-notice--caution", "no-print");
    expect(ownClasses(n).filter((c) => FRAME_OWNED.test(c))).toEqual([]);
    expect(screen.getByRole("button", { name: "Got it" }).getAttribute("class")).toBe("sf-notice-dismiss");
  });

  it("AiTeardownBanner: caution, still an alert; 'Dismiss' is the frame's dismiss, 'Try again' keeps its own look", async () => {
    getPendingMock.mockReturnValue("sid-1");
    render(<AiTeardownBanner />);
    await screen.findByText(/may still be connected/);
    const n = noticeOf(/may still be connected/);
    expect(n).toHaveClass("sf-notice", "sf-notice--caution", "no-print");
    expect(n).toHaveAttribute("role", "alert");
    expect(ownClasses(n).filter((c) => FRAME_OWNED.test(c))).toEqual([]);
    expect(screen.getByRole("button", { name: "Dismiss" }).getAttribute("class")).toBe("sf-notice-dismiss");
    expect(screen.getByRole("button", { name: /Try again|Trying/ })).not.toHaveClass("sf-notice-dismiss");
  });

  it("InvitationBanner before sign-in: info, full width; × and the sign-in buttons keep their own look", () => {
    render(<InvitationBanner state="pre_auth" claimedNames={[]} dismiss={vi.fn()} />);
    const n = noticeOf(/invited to a SPERT® Scheduler project/);
    expect(n).toHaveClass("sf-notice", "sf-notice--info", "relative", "no-print");
    expect(n).toHaveAttribute("role", "status");
    expect(ownClasses(n).filter((c) => FRAME_OWNED.test(c))).toEqual([]);
    const buttons = [...n.querySelectorAll("button")];
    expect(buttons.length).toBeGreaterThanOrEqual(3); // ×, Google, Microsoft
    for (const b of buttons) expect(b).not.toHaveClass("sf-notice-dismiss");
    expect(screen.getByRole("button", { name: "Dismiss invitation banner" })).toBeInTheDocument();
  });

  it("InvitationBanner once claimed: success", () => {
    render(<InvitationBanner state="claimed" claimedNames={["Heart of Gold"]} dismiss={vi.fn()} />);
    const n = noticeOf(/You now have access to/);
    expect(n).toHaveClass("sf-notice", "sf-notice--success");
    expect(n).not.toHaveClass("sf-notice--info");
    expect(ownClasses(n).filter((c) => FRAME_OWNED.test(c))).toEqual([]);
  });
});
