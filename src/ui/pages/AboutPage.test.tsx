// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { AboutPage } from "./AboutPage";

/**
 * About is reached the same way Changelog is (footer / nav), and Changelog carries a
 * "← Back to Projects" link that About did not. The link is asserted by role and
 * destination — never by class — so a restyle can neither satisfy nor break it.
 *
 * Falsified at 1c9b1db: this assertion fails (About had no link). The must-not-move
 * twin — Changelog keeps its own link — lives in ChangelogPage.test.tsx.
 */
afterEach(cleanup);

describe("AboutPage", () => {
  it("carries the same Back to Projects link the Changelog page has", () => {
    render(
      <MemoryRouter>
        <AboutPage />
      </MemoryRouter>
    );
    const link = screen.getByRole("link", { name: /back to projects/i });
    expect(link).toHaveAttribute("href", "/projects");
  });

  it("points cloud sign-in at the header chip, where it has lived since v0.36.3", () => {
    // Audit M23: the copy said cloud storage is enabled "in Settings"; the header's
    // Sign in has been the entry since the auth chip gained the storage modal.
    render(
      <MemoryRouter>
        <AboutPage />
      </MemoryRouter>
    );
    expect(
      screen.getByText(/enable cloud storage by clicking Sign in in the header/i)
    ).toBeInTheDocument();
  });

  /**
   * The License section describes the LICENSE file's additional terms. Until v0.67.7 it
   * cited "Section 7(b)" and named two of the six terms, implying that was all of them.
   * Two halves, each falsified separately at 5137d80: the new sentence is present, and
   * the narrow citation is gone — an assertion on the new text alone would pass with
   * both sentences on the page.
   */
  it("describes all six additional license terms under Section 7", () => {
    render(
      <MemoryRouter>
        <AboutPage />
      </MemoryRouter>
    );
    expect(
      screen.getByText(
        /Per Section 7 of the GPL v3, the LICENSE file includes non-permissive additional terms covering attribution and legal-notice preservation, trademark reservation, marking of modified versions, endorsement, and indemnification\./
      )
    ).toBeInTheDocument();
  });

  it("no longer cites Section 7(b) alone", () => {
    const { container } = render(
      <MemoryRouter>
        <AboutPage />
      </MemoryRouter>
    );
    expect(container.textContent).not.toContain("Section 7(b)");
  });
});
