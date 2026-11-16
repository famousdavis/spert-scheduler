// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

/**
 * WI-175 (v0.87.0): the header's SPERT® Scheduler.
 *
 * Until v0.87.0 the words sat directly in the link, which is a flex container, so each text run was a flex item of
 * its own: the space before "Scheduler" was trimmed (it read "SPERT®Scheduler") and the ® could not be raised, since
 * `vertical-align` does not apply to a flex item. H1 puts the words in ONE inline element. jsdom has no layout, so
 * the space and the raised ® themselves were measured in Chrome; here, the structure that gives them, and the
 * link's accessible name (ruling 11).
 */

import { describe, it, expect, afterEach, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";

vi.mock("@ui/hooks/use-cloud-sync", () => ({ useCloudSync: () => {} }));
vi.mock("@ui/hooks/useInvitationLanding", () => ({
  useInvitationLanding: () => ({ state: "idle", claimedNames: [], dismiss: () => {} }),
}));
vi.mock("@ui/providers/AuthProvider", () => ({
  useAuth: () => ({ user: null, loading: false }),
}));
vi.mock("@ui/providers/StorageProvider", () => ({
  useStorage: () => ({ mode: "local", storageReady: true }),
}));
// The header's right-hand cluster and the banners are not the subject here.
vi.mock("./AuthButton", () => ({ AuthButton: () => null }));
vi.mock("./StorageLoginModal", () => ({ StorageLoginModal: () => null }));
vi.mock("./LocalStorageWarningBanner", () => ({ LocalStorageWarningBanner: () => null }));
vi.mock("./FirstRunBanner", () => ({ FirstRunBanner: () => null }));
vi.mock("./AiTeardownBanner", () => ({ AiTeardownBanner: () => null }));

import { Layout } from "./Layout";
import { AboutPage } from "@ui/pages/AboutPage";

afterEach(cleanup);

function renderHeader() {
  render(
    <MemoryRouter initialEntries={["/about"]}>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/about" element={<AboutPage />} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
  return screen.getByRole("link", { name: /^SPERT® Scheduler icon/ });
}

describe("WI-175: the header's SPERT® Scheduler", () => {
  it("the link's accessible name: the logo's alt, then the words with their space (ruling 11)", () => {
    // Measured in jsdom; Chrome 154 reads "SPERT® Scheduler icon SPERT® Scheduler" for the same markup.
    expect(renderHeader()).toHaveAccessibleName("SPERT® Scheduler iconSPERT® Scheduler");
  });

  it("the words are ONE inline element in the link, so no text run is a flex item of its own (H1)", () => {
    const link = renderHeader();
    const strayText = [...link.childNodes].filter((n) => n.nodeType === Node.TEXT_NODE && n.textContent!.trim() !== "");
    expect(strayText).toEqual([]);
    const words = [...link.children].filter((el) => el.tagName !== "IMG");
    expect(words).toHaveLength(1);
    expect(words[0]).toHaveTextContent(/^SPERT® Scheduler$/);
  });

  it("the ® is raised, small and faint in both themes (H1, H3's twin in the header)", () => {
    const reg = [...renderHeader().querySelectorAll("span")].find((s) => s.textContent === "®")!;
    expect(reg).toHaveClass("align-super", "text-xs", "text-gray-300", "dark:text-gray-600");
  });

  it("the title is 18 px below 1,024 px wide and 24 px from it, the About title's size (H2)", () => {
    expect(renderHeader()).toHaveClass("text-lg", "lg:text-2xl");
  });

  it("the About page's two ® are faint in dark mode too, as the header's is (H3)", () => {
    renderHeader();
    const marks = [...document.querySelectorAll("main span")].filter((s) => s.textContent === "®");
    expect(marks).toHaveLength(2);
    for (const mark of marks) expect(mark).toHaveClass("text-gray-300", "dark:text-gray-600");
  });
});
