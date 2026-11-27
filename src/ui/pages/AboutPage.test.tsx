// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

// Adding a guide to public/? Also add it, with a one-line description, to spertsuite.com's
// src/data/help.ts (spert-landing-page). The landing page's daily "Guide list matches the app
// repos" check stays red until you do, and frame-check's About screen compares this page's
// Guides with that list. The PDF guide house rules say the same.

import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { APP_VERSION } from "@app/constants";
import { AboutPage } from "./AboutPage";
import { AppFooter } from "@ui/components/AppFooter";

/**
 * The About page (FRAME26 pass 3, v0.90.0): contract §3 About page and §7 About, with William's words of 2026-11-27.
 * The shared words are compared as frame-check compares them: the screen-reader text (`.sf-sr`) left out, runs of
 * whitespace as one space, typographic quotes and apostrophes as straight ones.
 */
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const TITLE = "SPERT® Scheduler";
const REPO = "https://github.com/famousdavis/spert-scheduler";

function renderAbout() {
  const { container } = render(
    <MemoryRouter>
      <AboutPage />
    </MemoryRouter>
  );
  return { container, about: container.querySelector<HTMLElement>('[data-sf="about"]')! };
}

/** An element's words as a reader sees them: no `.sf-sr`, whitespace collapsed, quotes straightened. */
function words(el: Element | null | undefined): string {
  if (!el) return "(absent)";
  const copy = el.cloneNode(true) as Element;
  copy.querySelectorAll(".sf-sr").forEach((s) => s.remove());
  return (copy.textContent ?? "").replace(/\s+/g, " ").replace(/[‘’]/g, "'").replace(/[“”]/g, '"').trim();
}

const sections = (about: HTMLElement) => [...about.children] as HTMLElement[];
const section = (about: HTMLElement, h2: string) => sections(about).find((s) => words(s.querySelector("h2")) === h2)!;
const paras = (s: HTMLElement) => [...s.querySelectorAll(":scope > p")];

describe("AboutPage (FRAME26 pass 3)", () => {
  it("nothing stands between the heading row and the page: no back link, no subtitle (D3)", () => {
    // Until v0.89.0 a "← Back to Projects" link and "Probabilistic project scheduling tool" sat under the title.
    const { container, about } = renderAbout();
    expect(container.querySelector('[data-sf="headrow"]')!.nextElementSibling).toBe(about);
    expect(about).toHaveClass("sf-about");
    expect(screen.queryByRole("link", { name: /back to projects/i })).toBeNull();
    expect(container.textContent).not.toContain("Probabilistic project scheduling tool");
  });

  it("its sections in §7's order, each a <section> opening with its h2; How it works an ol of 6; one explainer", () => {
    const { about } = renderAbout();
    expect(sections(about).map((s) => s.tagName)).toEqual(Array(7).fill("SECTION"));
    expect(sections(about).map((s) => s.firstElementChild!.tagName)).toEqual(Array(7).fill("H2"));
    expect(sections(about).map((s) => words(s.querySelector("h2")))).toEqual([
      `What is ${TITLE}?`,
      "How it works",
      "Beta-PERT and Parkinson's Law",
      "Connect AI",
      "Guides",
      "Your data and storage",
      "Version and license",
    ]);
    const how = section(about, "How it works");
    expect(how.querySelector("ul")).toBeNull();
    expect(how.querySelectorAll("ol > li")).toHaveLength(6);
    expect(words(how.querySelector("ol > li"))).toBe(
      "Enter three-point estimates (optimistic, most likely, pessimistic) for each activity"
    );
    expect(paras(section(about, "Beta-PERT and Parkinson's Law")).map(words)[1]).toBe(
      "Parkinson's Law modeling (configurable): when enabled, simulated activity durations are never less than the scheduled duration, because work expands to fill the time allotted."
    );
  });

  /**
   * Beta-PERT (v0.72.0). Every other tool's "Beta-PERT" is the fixed PERT formula, and this one is not, so the page
   * carries the owner's approved definition word for word, and no longer says Confidence always works through the Ratio
   * Scale Modifier. v0.90.0: the definition is the first paragraph of its own explainer, no longer a How it works step.
   */
  it("defines Beta-PERT in the approved words, and no longer ties Confidence to the RSM alone", () => {
    const { container, about } = renderAbout();
    const text = (container.textContent ?? "").replace(/\s+/g, " ");
    expect(words(paras(section(about, "Beta-PERT and Parkinson's Law"))[0])).toBe(
      "Beta-PERT stays between Min and Max and peaks exactly at Most Likely. Its spread follows the Confidence level on the Statistical PERT® Beta Edition scale (Medium: SD = range ÷ 6), so its middle value moves as Confidence changes. It is not the fixed PERT formula (O + 4M + P) ÷ 6."
    );
    expect(text).toContain("Choose from T-Normal, LogNormal, Beta-PERT, Triangular, or Uniform");
    expect(text).not.toContain("maps to a statistical standard deviation via the SPERT Ratio Scale Modifier");
    expect(text).not.toContain("(with automatic suggestions)");
  });

  it("Connect AI: Scheduler's own line, then §7's shared paragraph with its three links, each in a new tab", () => {
    const { about } = renderAbout();
    const ai = section(about, "Connect AI");
    expect(paras(ai).map(words)).toEqual([
      "Pair a compatible AI assistant with your project to read and edit your schedule in real time.",
      `To connect, follow the steps for your assistant on the Help Center's Connect AI setup page ↗. The Connect AI User Guide ↗ explains what your assistant can do in ${TITLE}. What it reads or changes passes through the SPERT® Suite relay, whichever storage you use; the AI Privacy Notice ↗ says what is kept and for how long.`,
    ]);
    const links = [...ai.querySelectorAll("a")];
    expect(links.map((a) => [a.getAttribute("href"), a.target, a.rel])).toEqual([
      ["https://spertsuite.com/help/connect-ai", "_blank", "noopener noreferrer"],
      ["/SPERTScheduler_Connect_AI_Guide.pdf", "_blank", "noopener noreferrer"],
      ["https://spertsuite.com/ai-privacy", "_blank", "noopener noreferrer"],
    ]);
    for (const a of links) expect(a.querySelector(".sf-sr")).toHaveTextContent("(opens in a new tab)");
  });

  /**
   * The five guides, verbatim and in order, from the Help Center's list (help.ts, landing v2.15.2), the list frame-check
   * reads from GitHub. Until v0.90.0 the page showed three, with blurbs of its own; the P6 guide now follows the import
   * guide, as help.ts orders it, not the Connect AI guide.
   */
  it("Guides: one row per help.ts guide, in order, each with Open PDF ↗ to its file in a new tab, then More help", () => {
    const { about } = renderAbout();
    const g = section(about, "Guides");
    const list = within(g).getByRole("list");
    expect(list).toHaveClass("sf-guides");
    expect(list).toHaveAttribute("data-sf", "guides");
    const rows = [...list.children] as HTMLElement[];
    expect(rows.map((r) => [r.tagName, r.className])).toEqual(Array(5).fill(["LI", "sf-guide"]));
    expect(rows.map((r) => [words(r.querySelector("h3.sf-guide-title")), words(r.querySelector("p.sf-guide-text"))])).toEqual([
      ["Quick Reference Guide", "What Scheduler is and how it uses three-point estimates and Monte Carlo simulation to show how likely you are to finish by a date."],
      ["Import Activities from Spreadsheet", "How to bring an activity list from Excel or Google Sheets into Scheduler, and how each row is checked."],
      ["Import from P6 or MS Project", "How to move a Primavera P6 or Microsoft Project schedule into Scheduler by way of Excel."],
      ["Connect AI User Guide", "How to pair an AI assistant with your project so it can build and edit your schedule with you."],
      ["When Scheduling Constraints Override the Critical Path", "A short primer on why a date constraint can drive your finish date while the highlighted critical path shows something else."],
    ]);
    const files = [
      "SPERTScheduler_Quick_Reference_Guide.pdf",
      "SPERTScheduler_Import_Quick_Reference_Guide.pdf",
      "SPERTScheduler_P6_MSProject_Import_Guide.pdf",
      "SPERTScheduler_Connect_AI_Guide.pdf",
      "CPM_Constraints_Critical_Path_Explainer.pdf",
    ];
    rows.forEach((r, i) => {
      const open = r.querySelector("a.sf-guide-open")!;
      const title = words(r.querySelector("h3"));
      expect(open).toHaveAttribute("href", `/${files[i]}`);
      expect(open).toHaveAttribute("target", "_blank");
      expect(open).toHaveAttribute("rel", "noopener noreferrer");
      expect(words(open)).toBe("Open PDF ↗");
      expect(open.querySelector('[aria-hidden="true"]')).toHaveTextContent("↗");
      expect(open.querySelector(".sf-sr")!.textContent).toBe(`: ${title} (opens in a new tab)`);
      expect(open).toHaveAccessibleName(`Open PDF: ${title} (opens in a new tab)`);
    });
    const more = paras(g);
    expect(more.map(words)).toEqual(["More help in the Help Center ↗"]);
    const a = more[0]!.querySelector("a")!;
    expect([a.getAttribute("href"), a.target, a.rel]).toEqual(["https://spertsuite.com/help/scheduler", "_blank", "noopener noreferrer"]);
  });

  it("Your data and storage: §7's two paragraphs (Connect AI's variant), and no longer 'nothing leaves your device'", () => {
    // Until v0.90.0: "nothing leaves your device" (Read Mode sends the open project through the relay) and "no
    // third-party data collection" (the Calendar page asks Nager.Date for holidays). Rev-ABOUT P1, P11.
    const { container, about } = renderAbout();
    expect(paras(section(about, "Your data and storage")).map(words)).toEqual([
      `Unless you sign in and choose cloud storage, ${TITLE} keeps your projects in this browser, on this device, and sends them to no server except through Connect AI, while an assistant is connected. Clearing this site's data deletes them, so export a backup from time to time.`,
      "If you sign in, with Google or with a Microsoft work or school account, and choose cloud storage, your projects are saved to your account in Google Firebase, over encrypted (HTTPS) connections. You can then open them on any device and share them with other people.",
    ]);
    const text = container.textContent ?? "";
    expect(text).not.toMatch(/nothing leaves your device/i);
    expect(text).not.toMatch(/third-party data collection/i);
  });

  it("Version and license: §7's five paragraphs, What's new to the changelog, source and LICENSE in a new tab", () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 10, 27));
    const { about } = renderAbout();
    const legal = sections(about).at(-1)!;
    expect(legal.tagName).toBe("SECTION");
    expect(legal).toHaveClass("sf-about-legal");
    expect(legal).toHaveAttribute("data-sf", "about-legal");
    expect(paras(legal).map(words)).toEqual([
      `Version ${APP_VERSION} · What's new`,
      "Created by William W. Davis, MSPM, PMP · Source code on GitHub ↗",
      `© 2026 William W. Davis, MSPM, PMP. ${TITLE} is free software: you may use, change and share it under the GNU General Public License, version 3, with the additional terms its LICENSE ↗ adds under Section 7 of that license: attribution and legal notices, trademarks, the marking of modified versions, endorsement, and indemnification.`,
      "SPERT®, Statistical PERT® and Estimation Made Easy® are registered trademarks of famousdavis, LLC. GanttApp™ and MyScrumBudget™ are trademarks of famousdavis, LLC.",
      'THERE IS NO WARRANTY FOR THE PROGRAM, TO THE EXTENT PERMITTED BY APPLICABLE LAW. EXCEPT WHEN OTHERWISE STATED IN WRITING THE COPYRIGHT HOLDERS AND/OR OTHER PARTIES PROVIDE THE PROGRAM "AS IS" WITHOUT WARRANTY OF ANY KIND, EITHER EXPRESSED OR IMPLIED, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE. THE ENTIRE RISK AS TO THE QUALITY AND PERFORMANCE OF THE PROGRAM IS WITH YOU. SHOULD THE PROGRAM PROVE DEFECTIVE, YOU ASSUME THE COST OF ALL NECESSARY SERVICING, REPAIR OR CORRECTION.',
    ]);
    // "AS IS" in straight quotes, as LICENSE prints it (the rule in all seven apps, 2026-11-27).
    expect(paras(legal)[4]!.textContent).toContain('"AS IS"');
    // What's new opens the changelog as the footer's Version does: the same route, in the same tab.
    const whatsNew = within(paras(legal)[0] as HTMLElement).getByRole("link", { name: /What.s new/ });
    expect(whatsNew).toHaveAttribute("href", "/changelog");
    expect(whatsNew).not.toHaveAttribute("target");
    const links = [...legal.querySelectorAll("a[target]")].map((a) => [a.getAttribute("href"), a.getAttribute("target"), a.getAttribute("rel")]);
    expect(links).toEqual([
      [REPO, "_blank", "noopener noreferrer"],
      [`${REPO}/blob/main/LICENSE`, "_blank", "noopener noreferrer"],
    ]);
  });

  it("the LICENSE sentence names every group of Section 7 terms, and no longer cites Section 7(b) alone", () => {
    // Until v0.67.7 the page cited "Section 7(b)" and named two of the six terms, implying that was all of them.
    const { container } = renderAbout();
    const text = (container.textContent ?? "").replace(/\s+/g, " ");
    expect(text).toContain(
      "adds under Section 7 of that license: attribution and legal notices, trademarks, the marking of modified versions, endorsement, and indemnification."
    );
    expect(text).not.toContain("Section 7(b)");
  });

  it("every ® and ™ on the page is the frame's mark, the glyph alone in a .sf-mark (™ with --tm)", () => {
    const { about } = renderAbout();
    const walker = document.createTreeWalker(about, NodeFilter.SHOW_TEXT);
    const found: string[] = [];
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const t = n.textContent ?? "";
      if (!/[®™]/.test(t)) continue;
      const span = n.parentElement!;
      expect(t).toMatch(/^[®™]$/);
      expect(span.childNodes).toHaveLength(1);
      expect(span.getAttribute("class")).toBe(t === "™" ? "sf-mark sf-mark--tm" : "sf-mark");
      found.push(t);
    }
    expect(found.join("")).toBe("®".repeat(13) + "™™");
  });

  it("no utility or dark: class inside the page: stylesheet v4 draws all of it", () => {
    // The frame's classes only. The stylesheet is unlayered, so a leftover utility either loses (dead code) or fights it.
    const { about } = renderAbout();
    const frame = /^(sf-[a-z-]+)$/;
    const classes = new Set([...about.querySelectorAll("[class]")].flatMap((e) => [...e.classList]));
    expect([...classes].filter((c) => !frame.test(c))).toEqual([]);
  });
});

describe("the © year (Y1, v0.90.0)", () => {
  it("is the current year in the footer and on the About page, from one source", () => {
    // The footer printed a fixed 2026 until v0.90.0. With the clock at 2031, both lines say 2031.
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2031, 0, 15));
    const { container } = render(
      <MemoryRouter>
        <AboutPage />
        <AppFooter onOpenShortcuts={() => {}} />
      </MemoryRouter>
    );
    const footer = container.querySelector("footer")!;
    expect(footer.textContent).toMatch(/© 2031 William W\. Davis/);
    expect(footer.textContent).not.toContain("2026");
    const legal = container.querySelector('[data-sf="about-legal"]')!;
    expect(legal.textContent).toMatch(/© 2031 William W\. Davis/);
  });
});
