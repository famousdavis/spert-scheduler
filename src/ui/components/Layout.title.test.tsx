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
 *
 * v0.88.0 (FRAME26 stage 4) moved the title onto the frame: the words are ONE element, `.sf-title`, beside the two
 * favicons in the brand link; the ® is the frame's muted `.sf-mark` (12 px, raised 9 px, line-height 0); the title is
 * 24 px at every width; and the favicons are decorative (`alt=""`), so the link is named by its visible title alone
 * (contract §3, "Brand link", WCAG 2.5.3).
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
  return screen.getByRole("link", { name: "SPERT® Scheduler" });
}

describe("WI-175: the header's SPERT® Scheduler", () => {
  it("the link's accessible name: the words with their space, and nothing else (ruling 11; contract §3)", () => {
    // Both favicons are alt="", so the name is the visible title alone; the space survives because it is a text node
    // of the title, outside the gradient spans.
    const link = renderHeader();
    expect(link).toHaveAccessibleName("SPERT® Scheduler");
    expect(link).not.toHaveAttribute("aria-label");
    const icons = [...link.querySelectorAll("img")];
    expect(icons).toHaveLength(2);
    for (const icon of icons) expect(icon).toHaveAttribute("alt", "");
  });

  it("the words are ONE inline element in the link, so no text run is a flex item of its own (H1)", () => {
    const link = renderHeader();
    const strayText = [...link.childNodes].filter((n) => n.nodeType === Node.TEXT_NODE && n.textContent!.trim() !== "");
    expect(strayText).toEqual([]);
    const words = [...link.children].filter((el) => el.tagName !== "IMG");
    expect(words).toHaveLength(1);
    expect(words[0]).toHaveTextContent(/^SPERT® Scheduler$/);
    expect(words[0]).toHaveClass("sf-title");
  });

  it("the ® is the frame's mark: raised, small and muted in both themes (H1, H3's twin in the header)", () => {
    const reg = [...renderHeader().querySelectorAll("span")].find((s) => s.textContent === "®")!;
    expect(reg.getAttribute("class")).toBe("sf-mark");
  });

  it("the title is the frame's 24 px at every width: no size class of its own (H2)", () => {
    const link = renderHeader();
    expect(link.getAttribute("class")).toBe("sf-brand");
    const title = link.querySelector(".sf-title")!;
    expect(title.getAttribute("class")).toBe("sf-title");
  });

  it("every ® and ™ on About is the frame's mark, the glyph alone in a .sf-mark, the heading's included (H3; pass 3)", () => {
    // v0.90.0 (FRAME26 pass 3): the rebuilt About page has fourteen ® and two ™ in `main`, the h1's among them, and
    // every one is the frame's mark (contract §4): the glyph alone, the ™ with `--tm`. Until v0.89.0 there were two,
    // and the body heading's was a faint utility span. No ® or ™ stands in text outside a mark.
    renderHeader();
    const main = document.querySelector("main")!;
    const marks = [...main.querySelectorAll("span")].filter((s) => /[®™]/.test(s.textContent ?? "") && s.children.length === 0);
    expect(marks.map((m) => m.textContent).join("")).toBe("®".repeat(14) + "™™");
    for (const m of marks) {
      expect(m.getAttribute("class")).toBe(m.textContent === "™" ? "sf-mark sf-mark--tm" : "sf-mark");
    }
    expect(marks[0]!.closest("h1")).not.toBeNull();
    const walker = document.createTreeWalker(main, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      if (/[®™]/.test(n.textContent ?? "")) expect(n.parentElement!.classList.contains("sf-mark")).toBe(true);
    }
  });
});
