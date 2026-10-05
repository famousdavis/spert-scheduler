// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

/**
 * The Sensitivity panel's figures and its left-out line (v0.76.2).
 *
 * Each row shows its activity's own distribution, and an activity the panel cannot analyse —
 * estimates out of order, or a LogNormal whose estimates give it no mean — is left out of the
 * ranking and counted in one line under the description.
 */

import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import type { Activity } from "@domain/models/types";
import { SensitivityPanel } from "./SensitivityPanel";

/** A real Activity, annotated rather than cast. */
function activity(patch: Partial<Activity> & { id: string; name: string }): Activity {
  return {
    min: 2,
    mostLikely: 5,
    max: 10,
    confidenceLevel: "mediumConfidence",
    distributionType: "normal",
    status: "planned",
    ...patch,
  };
}

const VALID_A = activity({ id: "a", name: "Design" });
const VALID_B = activity({ id: "b", name: "Build", min: 4, mostLikely: 8, max: 16 });

describe("SensitivityPanel", () => {
  it("says nothing about left-out activities when every one can be analysed", () => {
    render(<SensitivityPanel activities={[VALID_A, VALID_B]} />);
    expect(screen.queryByText(/left out/)).toBeNull();
  });

  it("counts one left-out activity in the singular, and does not list it", () => {
    const broken = activity({ id: "x", name: "Broken", distributionType: "triangular", min: 30, mostLikely: 15, max: 10 });
    render(<SensitivityPanel activities={[VALID_A, VALID_B, broken]} />);
    expect(screen.getByText("1 activity is left out until its estimates are fixed.")).toBeTruthy();
    expect(screen.queryByText("Broken")).toBeNull();
  });

  it("counts two left-out activities in the plural", () => {
    const first = activity({ id: "x", name: "First", distributionType: "triangular", min: 30, mostLikely: 15, max: 10 });
    const second = activity({ id: "y", name: "Second", distributionType: "betaPert", min: 10, mostLikely: 25, max: 20 });
    render(<SensitivityPanel activities={[VALID_A, first, second]} />);
    expect(screen.getByText("2 activities are left out until their estimates are fixed.")).toBeTruthy();
  });

  it("shows a Triangular activity's own mean and SD", () => {
    const triangular = activity({ id: "t", name: "Triangular", distributionType: "triangular", min: 10, mostLikely: 15, max: 30 });
    render(<SensitivityPanel activities={[VALID_A, triangular]} />);
    // Its own: mean 55/3 = 18.33, SD √(325/18) = 4.25. A T-Normal's would be 16.7 and 4.0.
    expect(screen.getByText("μ=18.3d")).toBeTruthy();
    expect(screen.getByText("σ=4.2d")).toBeTruthy();
  });

  it("still renders beside a LogNormal too small to have a mean, and counts it as left out", () => {
    const tiny = activity({ id: "z", name: "Tiny", distributionType: "logNormal", min: 0, mostLikely: 0, max: 5e-324 });
    render(<SensitivityPanel activities={[VALID_A, VALID_B, tiny]} />);
    expect(screen.getByText("1 activity is left out until its estimates are fixed.")).toBeTruthy();
    expect(screen.queryByText("Tiny")).toBeNull();
  });
});
