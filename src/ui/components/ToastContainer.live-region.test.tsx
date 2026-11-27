// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup, act } from "@testing-library/react";
import { ToastContainer } from "./ToastContainer";
import { useNotificationStore } from "@ui/hooks/use-notification-store";

/**
 * H2 (FRAME26, v0.90.0): one live region, present and empty from load, and each message inserted into it.
 *
 * Until v0.90.0 the container was rendered only while a toast existed, so the first message arrived inside a region
 * created already holding it, which screen readers may announce twice or not at all; and each toast was a region of its
 * own besides (`role="alert"` with `aria-live="polite"`). Now the container is always there, `role="status"` (polite)
 * with `aria-atomic="false"`, so each inserted toast is spoken alone, and a toast has no role of its own. Measured on
 * production before the change: no region in <body> at load (About-SCH-AHP Step 1, `regionsAtLoad: []`).
 */
afterEach(() => {
  cleanup();
  useNotificationStore.setState({ notifications: [] });
});

describe("ToastContainer — one live region, present before the first message (H2)", () => {
  it("the Notifications region exists, empty, before any toast", () => {
    render(<ToastContainer />);
    const region = screen.getByRole("status", { name: "Notifications" });
    expect(region).toBeEmptyDOMElement();
    expect(region).toHaveAttribute("aria-atomic", "false");
    expect(region.parentElement).toBe(document.body);
  });

  it("a toast is inserted into that same region, with no role or aria-live of its own, and its icon hidden", () => {
    render(<ToastContainer />);
    const region = screen.getByRole("status", { name: "Notifications" });
    act(() => {
      useNotificationStore.getState().addNotification({ type: "success", message: "Seed copied to clipboard", duration: 0 });
    });
    // The same node: the region was not re-created to hold the message.
    expect(screen.getByRole("status", { name: "Notifications" })).toBe(region);
    expect(region.children).toHaveLength(1);
    const toast = region.firstElementChild!;
    expect(toast).toHaveTextContent("Seed copied to clipboard");
    expect(toast).not.toHaveAttribute("role");
    expect(toast).not.toHaveAttribute("aria-live");
    expect(region.querySelectorAll("[role], [aria-live]")).toHaveLength(0);
    expect(screen.queryAllByRole("alert")).toHaveLength(0);
    expect(toast.querySelector('[aria-hidden="true"]')).toHaveTextContent("✓");
  });

  it("the region stays, empty, after the last toast is dismissed", () => {
    render(<ToastContainer />);
    act(() => {
      useNotificationStore.getState().addNotification({ type: "error", message: "Nope", duration: 0 });
    });
    act(() => {
      useNotificationStore.setState({ notifications: [] });
    });
    expect(screen.getByRole("status", { name: "Notifications" })).toBeEmptyDOMElement();
  });
});
