// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { confidenceApplies } from "@domain/helpers/confidence-applies";
import { DISTRIBUTION_TYPES } from "@domain/models/types";
import { ActivityEditModal } from "./ActivityEditModal";
import { useProjectStore } from "@ui/hooks/use-project-store";
import type { Project } from "@domain/models/types";

/**
 * Confidence applies only to the two distributions defined by a mean and an SD.
 *
 * ⚠️ **The rule was written out FOUR times before v0.67.0** — `UnifiedActivityRow` twice
 * (once as a negation), `schedule-export-service` as `usesConfidence`, and
 * `print-sections` — and **that divergence was the defect**. The activity-edit modal was
 * the only surface that never got it, because there was no single place to get it from.
 * Adding a fifth copy would have fixed the symptom and left the cause.
 *
 * These tests cover the predicate itself and the surface that was missing it. The grid's
 * behaviour is unchanged and already covered.
 */

describe("confidenceApplies", () => {
  it("is true for the two distributions that take a standard deviation", () => {
    expect(confidenceApplies("normal")).toBe(true);
    expect(confidenceApplies("logNormal")).toBe(true);
  });

  it("is false for the two defined by min/most-likely/max alone", () => {
    expect(confidenceApplies("triangular")).toBe(false);
    expect(confidenceApplies("uniform")).toBe(false);
  });

  it("answers for every distribution type the app supports", () => {
    // ⚠️ Non-vacuity: a new distribution added to DISTRIBUTION_TYPES without a decision
    // here would default to `false` silently. This asserts the set is exactly the four
    // reasoned about, so adding a fifth fails until someone chooses.
    expect([...DISTRIBUTION_TYPES].sort()).toEqual(
      ["logNormal", "normal", "triangular", "uniform"],
    );
  });
});

// ---------------------------------------------------------------------------
// The surface that was missing the rule
// ---------------------------------------------------------------------------

const baseProject = (): Project =>
  ({
    id: "p1",
    name: "P1",
    createdAt: "2026-01-01",
    updatedAt: "2026-01-01",
    schemaVersion: 23,
    scenarios: [
      {
        id: "s1",
        name: "Baseline",
        startDate: "2026-04-06",
        activities: [
          {
            id: "a1",
            name: "Discovery",
            min: 3,
            mostLikely: 5,
            max: 10,
            confidenceLevel: "mediumConfidence",
            distributionType: "normal",
            status: "planned",
          },
        ],
        dependencies: [],
        milestones: [],
        settings: {
          defaultConfidenceLevel: "mediumConfidence",
          defaultDistributionType: "normal",
          trialCount: 10000,
          rngSeed: "s",
          probabilityTarget: 0.5,
          projectProbabilityTarget: 0.95,
        },
      },
    ],
  }) as unknown as Project;

/**
 * ⚠️ The Estimates section is `defaultOpen={false}`, so its selects are not in the DOM
 * until it is expanded. Without this the queries return null and every assertion below
 * throws rather than testing anything.
 */
const openModal = () => {
  render(
    <ActivityEditModal
      activityId="a1"
      scenarioId="s1"
      projectId="p1"
      onClose={vi.fn()}
      schedule={undefined}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: /Estimates/ }));
};

const confidenceSelect = () =>
  document.querySelector('select[name="confidenceLevel"]') as HTMLSelectElement;
const distributionSelect = () =>
  document.querySelector('select[name="distributionType"]') as HTMLSelectElement;

beforeEach(() => {
  useProjectStore.setState({ projects: [baseProject()] });
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("ActivityEditModal — Confidence greys out when it does not apply", () => {
  it("the Estimates section really opens, so the assertions below are not vacuous", () => {
    openModal();
    expect(confidenceSelect()).not.toBeNull();
    expect(distributionSelect()).not.toBeNull();
  });

  it("is enabled for a T-Normal activity", () => {
    openModal();
    expect(confidenceSelect().disabled).toBe(false);
    expect(confidenceSelect().title).toBe("");
  });

  it.each(["triangular", "uniform"] as const)(
    "greys out immediately when the distribution is switched to %s — before any save",
    (dist) => {
      openModal();
      expect(confidenceSelect().disabled).toBe(false);

      fireEvent.change(distributionSelect(), { target: { value: dist } });

      // ⚠️ Driven off LOCAL state. Reading the saved activity instead would leave the
      // control live until Save, which is the behaviour this fixes.
      expect(confidenceSelect().disabled).toBe(true);
      expect(confidenceSelect().title).toContain("only applies to");
    },
  );

  it("comes back when the distribution is switched back", () => {
    openModal();
    fireEvent.change(distributionSelect(), { target: { value: "uniform" } });
    expect(confidenceSelect().disabled).toBe(true);

    fireEvent.change(distributionSelect(), { target: { value: "logNormal" } });
    expect(confidenceSelect().disabled).toBe(false);
  });

  it("does not discard the stored confidence level when it stops applying", () => {
    // Greying out a control says the value is inert, not that it should be thrown away.
    // Switching back must find it as it was — the grid has always behaved this way.
    openModal();
    const before = confidenceSelect().value;

    fireEvent.change(distributionSelect(), { target: { value: "triangular" } });
    fireEvent.change(distributionSelect(), { target: { value: "normal" } });

    expect(confidenceSelect().value).toBe(before);
  });

  it("uses the same explanation the grid's control uses", () => {
    openModal();
    fireEvent.change(distributionSelect(), { target: { value: "uniform" } });
    // Single source: ConfidenceLevelSelect and this native select must not drift apart.
    expect(confidenceSelect().title).toBe(
      "Confidence only applies to T-Normal and LogNormal distributions",
    );
  });
});
