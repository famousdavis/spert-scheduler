// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0. See LICENSE file in the project root for full license text.

/**
 * Smoke tests for SignOutConfirmModal (v0.47.2).
 *
 * The modal interrupts user-initiated sign-out to inform the user that the
 * v0.42.6 M4 local-cache wipe is about to run. These tests lock the four
 * behaviors the modal must guarantee:
 *
 * TC-A — modal renders title + body when open
 * TC-B — Cancel fires onOpenChange(false) and does NOT fire onConfirm
 * TC-C — Sign out fires onConfirm
 * TC-D — Cancel is default-focused (non-destructive choice)
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
});
