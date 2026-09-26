// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, act } from "@testing-library/react";
import { ToastContainer } from "./ToastContainer";
import { useNotificationStore } from "@ui/hooks/use-notification-store";

/**
 * A toast on screen when the user prints must not print.
 *
 * ⚠️ jsdom has no print media, so these tests pin the MECHANISM, not the outcome. The
 * outcome was measured on real PDFs: before this, a toast raised just before printing
 * appeared at the bottom right of every page of the report, in both themes, with the
 * browser's Background graphics on or off.
 *
 * Two halves, and the second is the one a later edit would break without noticing.
 * `no-print` hides the container only because it is portaled into <body>. The print
 * stylesheet's ancestor rules (`#root > *`, `#root > * > main > *`) are ID selectors with
 * !important, and they outrank `.no-print`'s `display: none` for anything they match —
 * which is how the no-print banners inside <main> still take up space in print.
 */

let root: HTMLDivElement;

beforeEach(() => {
  // index.html's mount point, so a portal target under #root is caught by assertion
  // rather than by a crash.
  root = document.createElement("div");
  root.id = "root";
  document.body.appendChild(root);
  act(() => {
    // duration 0: no auto-dismiss timer to outlive the test.
    useNotificationStore
      .getState()
      .addNotification({ type: "success", message: "Seed copied to clipboard", duration: 0 });
  });
});

afterEach(() => {
  cleanup();
  useNotificationStore.setState({ notifications: [] });
  root.remove();
});

describe("ToastContainer — a notification on screen does not print", () => {
  it("the toast container carries the no-print class", () => {
    render(<ToastContainer />);
    expect(screen.getByText("Seed copied to clipboard")).toBeInTheDocument();
    expect(screen.getByLabelText("Notifications")).toHaveClass("no-print");
  });

  it("the toast container is a child of <body>, outside #root, where no print rule outranks no-print", () => {
    render(<ToastContainer />);
    const container = screen.getByLabelText("Notifications");
    expect(container.parentElement).toBe(document.body);
    expect(root.contains(container)).toBe(false);
  });
});
