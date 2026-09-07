// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

/**
 * "Reset to defaults", migrated off `window.confirm()` in WI-6b (v0.67.9).
 *
 * ⚠️ THIS IS THE ONE ABORT SITE WHOSE OPENER SURVIVES. Resetting preferences does not
 * unmount this section, so the Reset button is still in the document when the dialog
 * closes and `ConfirmDialog`'s own captured-`activeElement` restore is enough. The other
 * four sites destroy their opener and each names a destination; this one deliberately does
 * NOT, and that absence is what these tests check. **A focus tail added here would pass
 * these tests while hiding whether the component's restore works at all.**
 *
 * ⚠️ `.focus()` BEFORE the click is not a cheat, it is the fixture's premise. jsdom does
 * not focus an element on click; Chromium does. Without it `document.activeElement` at open
 * time is `<body>`, the restore faithfully returns focus to `<body>`, and the test would be
 * measuring jsdom rather than the component. (Safari does not focus buttons on click
 * either — recorded, not testable here.) The first assertion pins the premise so it cannot
 * silently stop holding.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup, within } from "@testing-library/react";
import { DEFAULT_USER_PREFERENCES } from "@domain/models/types";
import { usePreferencesStore } from "@ui/hooks/use-preferences-store";
import { useConfirmStore } from "@ui/hooks/use-confirm-store";
import { PreferencesSection } from "./PreferencesSection";
import { ConfirmHost } from "./ConfirmHost";

beforeEach(() => {
  localStorage.clear();
  useConfirmStore.setState({ pending: null });
  usePreferencesStore.setState({
    preferences: { ...DEFAULT_USER_PREFERENCES, defaultTrialCount: 7777 },
  });
});
afterEach(cleanup);

function renderSection() {
  render(
    <>
      <PreferencesSection />
      <ConfirmHost />
    </>,
  );
  const reset = screen.getByRole("button", { name: "Reset to defaults" });
  reset.focus(); // what a Chromium click does and jsdom does not
  return reset;
}

const trialCount = () => usePreferencesStore.getState().preferences.defaultTrialCount;

describe("site 5 — Reset to defaults — PREDICTION: the opener survives, so no destination is owed", () => {
  it("asks first, and dismissing leaves every preference untouched", async () => {
    const reset = renderSection();
    expect(document.activeElement).toBe(reset); // the fixture's premise, pinned

    fireEvent.click(reset);
    const dialog = await screen.findByRole("dialog");
    expect(
      within(dialog).getByText("Reset all preferences to defaults?"),
    ).toBeTruthy();
    expect(trialCount()).toBe(7777);

    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(trialCount()).toBe(7777);
  });

  it("confirming resets, and focus returns to the Reset button itself — not <body>", async () => {
    const reset = renderSection();

    fireEvent.click(reset);
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Reset" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());

    expect(trialCount()).toBe(DEFAULT_USER_PREFERENCES.defaultTrialCount);
    // No rAF settle here on purpose: nothing at this site schedules one. This is
    // `ConfirmDialog`'s `onCloseAutoFocus` restore, and only that.
    await waitFor(() => expect(document.activeElement).toBe(reset));
  });
});
