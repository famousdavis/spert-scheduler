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

  /**
   * Beta-PERT (v0.72.0). Every other tool's "Beta-PERT" is the fixed PERT formula, and this one
   * is not, so the page carries the owner's approved definition word for word — and no longer
   * says Confidence always works through the Ratio Scale Modifier, which is not how it sets
   * Beta-PERT's spread.
   */
  it("defines Beta-PERT in the approved words, and no longer ties Confidence to the RSM alone", () => {
    const { container } = render(
      <MemoryRouter>
        <AboutPage />
      </MemoryRouter>
    );
    const text = (container.textContent ?? "").replace(/\s+/g, " ");
    expect(text).toContain(
      "Beta-PERT stays between Min and Max and peaks exactly at Most Likely. Its spread follows the Confidence level on the Statistical PERT® Beta Edition scale (Medium: SD = range ÷ 6), so its middle value moves as Confidence changes. It is not the fixed PERT formula (O + 4M + P) ÷ 6."
    );
    expect(text).toContain("Choose from T-Normal, LogNormal, Beta-PERT, Triangular, or Uniform");
    expect(text).not.toContain("maps to a statistical standard deviation via the SPERT Ratio Scale Modifier");
    expect(text).not.toContain("(with automatic suggestions)");
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
