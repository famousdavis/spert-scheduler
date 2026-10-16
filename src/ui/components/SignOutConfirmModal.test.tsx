// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

/**
 * Smoke tests for SignOutConfirmModal (v0.47.2).
 *
 * The modal interrupts user-initiated sign-out to inform the user that the
 * v0.42.6 M4 local-cache wipe is about to run. These tests lock the five
 * behaviors the modal must guarantee:
 *
 * TC-A — modal renders title + body when open
 * TC-B — Cancel fires onOpenChange(false) and does NOT fire onConfirm
 * TC-C — Sign out fires onConfirm
 * TC-D — Cancel is default-focused (non-destructive choice)
 * TC-E — it says what stays in this browser: the projects and settings it keeps
 *        for use without signing in, back as soon as the sign-out is done (WI-113)
 */

import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { SignOutConfirmModal } from "./SignOutConfirmModal";

describe("SignOutConfirmModal", () => {
  it("TC-A: renders the title and body when open", () => {
    render(
      <SignOutConfirmModal
        open
        onOpenChange={vi.fn()}
        onConfirm={vi.fn()}
      />,
    );
    expect(screen.getByText("Sign out of cloud storage?")).toBeInTheDocument();
    expect(
      screen.getByText(/Your projects on this device will be removed/i),
    ).toBeInTheDocument();
    expect(screen.getByText(/What gets removed:/i)).toBeInTheDocument();
    expect(screen.getByText(/What stays safe:/i)).toBeInTheDocument();
  });

  it("TC-B: Cancel fires onOpenChange(false) without onConfirm", () => {
    const onOpenChange = vi.fn();
    const onConfirm = vi.fn();
    render(
      <SignOutConfirmModal
        open
        onOpenChange={onOpenChange}
        onConfirm={onConfirm}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("TC-C: Sign out fires onConfirm", () => {
    const onOpenChange = vi.fn();
    const onConfirm = vi.fn();
    render(
      <SignOutConfirmModal
        open
        onOpenChange={onOpenChange}
        onConfirm={onConfirm}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Sign out" }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("TC-D: Cancel is default-focused (non-destructive choice)", async () => {
    render(
      <SignOutConfirmModal
        open
        onOpenChange={vi.fn()}
        onConfirm={vi.fn()}
      />,
    );
    // Focus is scheduled via setTimeout(..., 0) inside a useEffect — wait
    // for the microtask to flush so the focus has actually landed.
    await waitFor(() => {
      expect(document.activeElement).toBe(
        screen.getByRole("button", { name: "Cancel" }),
      );
    });
  });

  it("TC-E: says what stays here — this browser's own projects and settings, back as soon as the sign-out is done", () => {
    render(
      <SignOutConfirmModal
        open
        onOpenChange={vi.fn()}
        onConfirm={vi.fn()}
      />,
    );
    const stays = screen.getByText("What stays here:");
    const row = stays.parentElement;
    expect(row?.textContent?.replaceAll(/\s+/g, " ").trim()).toBe(
      "What stays here: Any projects and settings this browser keeps for use without signing in. They come back as soon as you have signed out.",
    );
    // The row after "What stays safe:", in the same markup.
    const safe = screen.getByText("What stays safe:");
    expect(safe.parentElement?.nextElementSibling).toBe(row);
    expect(stays.tagName).toBe(safe.tagName);
    expect(stays.className).toBe(safe.className);
    expect(row?.tagName).toBe(safe.parentElement?.tagName);
    expect(row?.className).toBe(safe.parentElement?.className);
  });
});
