// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";

// The holiday editor reaches the Nager API on mount; the page's headings are the subject
// here, so the editor renders nothing.
vi.mock("@ui/components/CalendarEditor", () => ({ CalendarEditor: () => null }));

import { CalendarPage } from "./CalendarPage";

/**
 * The nav item reads "Calendar"; until WI-16 the page's h1 read "Company Holidays"
 * (audit M23). The other three nav pages already title themselves by their nav label,
 * so the h1 becomes "Calendar" and "Company Holidays" becomes the first of two h2
 * sections. Falsified at 1c9b1db: both assertions fail.
 */
afterEach(cleanup);

describe("CalendarPage", () => {
  it("titles itself by its nav label", () => {
    render(<CalendarPage />);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(/^Calendar$/);
  });

  it("keeps Company Holidays as a section heading beneath it", () => {
    render(<CalendarPage />);
    expect(screen.getByRole("heading", { level: 2, name: "Company Holidays" })).toBeInTheDocument();
  });
});
