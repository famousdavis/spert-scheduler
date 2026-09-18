// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import {
  confidenceApplies,
  confidenceInertReason,
  distributionIsInert,
} from "@domain/helpers/confidence-applies";
import { DISTRIBUTION_TYPES } from "@domain/models/types";
import { ActivityEditModal } from "./ActivityEditModal";
import { useProjectStore } from "@ui/hooks/use-project-store";
import type { Activity, Project } from "@domain/models/types";

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

describe("confidenceInertReason — why Confidence cannot apply (owner ruling, 2026-09-17)", () => {
  it("is null where the level sets a real spread", () => {
    expect(confidenceInertReason("normal", 3, 10)).toBeNull();
    expect(confidenceInertReason("logNormal", 3, 10)).toBeNull();
  });

  it("names the distribution for Triangular and Uniform, whatever the numbers", () => {
    expect(confidenceInertReason("triangular", 3, 10)).toBe("distribution");
    expect(confidenceInertReason("uniform", 5, 5, 2)).toBe("distribution");
  });

  it("names a zero range for T-Normal and LogNormal when Min equals Max", () => {
    expect(confidenceInertReason("normal", 5, 5)).toBe("zeroRange");
    expect(confidenceInertReason("logNormal", 0, 0)).toBe("zeroRange");
  });

  it("names the override when the standard deviation was set directly, ahead of a zero range", () => {
    // Only a unit test reaches this: an sdOverride arrives by import or cloud, never the UI.
    expect(confidenceInertReason("normal", 3, 10, 2)).toBe("sdOverride");
    expect(confidenceInertReason("normal", 5, 5, 2)).toBe("sdOverride");
  });

  it("never reads two blank drafts as a zero range", () => {
    // The dialog holds "" while a field is empty; "" === "" must not put a dash on a
    // half-filled form. Positive control: two equal NUMBERS do.
    expect(confidenceInertReason("normal", "", "")).toBeNull();
    expect(confidenceInertReason("normal", "", 10)).toBeNull();
    expect(confidenceInertReason("normal", 7, 7)).toBe("zeroRange");
  });
});

describe("distributionIsInert — no uncertainty, so the distribution cannot change the duration", () => {
  it("is true for a point estimate under every distribution", () => {
    for (const d of DISTRIBUTION_TYPES) expect(distributionIsInert(5, 5, 5, d)).toBe(true);
  });

  it("is false once there is any range", () => {
    expect(distributionIsInert(5, 5, 6, "triangular")).toBe(false);
    expect(distributionIsInert(3, 5, 10, "normal")).toBe(false);
  });

  it("is false for 0/0/0 on LogNormal, which cannot be built at all — but true for 0/0/0 elsewhere", () => {
    expect(distributionIsInert(0, 0, 0, "logNormal")).toBe(false);
    expect(distributionIsInert(0, 0, 0, "normal")).toBe(true);
  });

  it("is false where an sdOverride gives the point estimate real spread", () => {
    expect(distributionIsInert(5, 5, 5, "normal", 2)).toBe(false);
    expect(distributionIsInert(5, 5, 5, "logNormal", 2)).toBe(false);
  });

  it("never reads blank drafts as equal", () => {
    expect(distributionIsInert("", "", "", "triangular")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// The surface that was missing the rule
// ---------------------------------------------------------------------------

const baseProject = (activity: Partial<Activity> = {}): Project =>
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
            ...activity,
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
const confidenceDash = () => document.querySelector("output");
const distributionSelect = () =>
  document.querySelector('select[name="distributionType"]') as HTMLSelectElement;

beforeEach(() => {
  useProjectStore.setState({ projects: [baseProject()] });
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("ActivityEditModal — Confidence shows a dash where it does not apply", () => {
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
    "shows the dash immediately when the distribution is switched to %s — before any save",
    (dist) => {
      // Rewritten deliberately in v0.68.1: this used to assert a DISABLED select, which still
      // showed a level. The level is now replaced by a dash.
      openModal();
      expect(confidenceSelect()).not.toBeNull();
      expect(confidenceDash()).toBeNull();

      fireEvent.change(distributionSelect(), { target: { value: dist } });

      // ⚠️ Driven off LOCAL state. Reading the saved activity instead would leave the
      // control live until Save, which is the behaviour this fixes.
      expect(confidenceSelect()).toBeNull();
      expect(confidenceDash()!.textContent).toBe("—");
      expect(confidenceDash()!.title).toContain("only applies to");
    },
  );

  it("comes back when the distribution is switched back", () => {
    openModal();
    fireEvent.change(distributionSelect(), { target: { value: "uniform" } });
    expect(confidenceSelect()).toBeNull();

    fireEvent.change(distributionSelect(), { target: { value: "logNormal" } });
    expect(confidenceSelect().disabled).toBe(false);
    expect(confidenceDash()).toBeNull();
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
    // Single source: ConfidenceLevelSelect and this dash must not drift apart.
    expect(confidenceDash()!.title).toBe(
      "Confidence only applies to T-Normal and LogNormal distributions",
    );
  });

  it("keeps the Confidence label attached: on a Triangular activity it names the dash", () => {
    // A <span> would leave the label pointing at nothing — it is not a labelable element.
    useProjectStore.setState({ projects: [baseProject({ distributionType: "triangular" })] });
    openModal();
    const labelled = screen.getByLabelText("Confidence");
    expect(labelled.tagName).toBe("OUTPUT");
    expect(labelled.textContent).toBe("—");
    // An <output> is implicitly a polite live region; the dash must not be announced every
    // time the distribution changes.
    expect(labelled.getAttribute("aria-live")).toBe("off");
  });

  it("shows the dash, with its own reason, for a zero-range T-Normal activity", () => {
    useProjectStore.setState({ projects: [baseProject({ min: 5, mostLikely: 5, max: 5 })] });
    openModal();
    expect(confidenceSelect()).toBeNull();
    expect(confidenceDash()!.title).toBe(
      "Min and Max are equal, so the spread is zero at every confidence level.",
    );
  });

  it("does not read blank Min and Max drafts as a zero range", () => {
    // T-Normal on purpose: on a Triangular activity the dash would be right anyway, and this
    // would then pass for the wrong reason.
    openModal();
    const minInput = document.querySelector('input[name="estimateMin"]') as HTMLInputElement;
    const maxInput = document.querySelector('input[name="estimateMax"]') as HTMLInputElement;
    fireEvent.change(minInput, { target: { value: "" } });
    fireEvent.change(maxInput, { target: { value: "" } });
    expect(confidenceSelect()).not.toBeNull();
    expect(confidenceDash()).toBeNull();

    // Positive control, same test: two equal NUMBERS do put the dash there.
    fireEvent.change(minInput, { target: { value: "5" } });
    fireEvent.change(maxInput, { target: { value: "5" } });
    expect(confidenceSelect()).toBeNull();
    expect(confidenceDash()!.textContent).toBe("—");
  });
});
