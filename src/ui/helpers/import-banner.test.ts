// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

// These exist because importDoneBanner used to live inside ImportSection.tsx, where
// the only way to reach it was to render the component. It is the text the user reads
// after an import — the one place the outcome counts become a claim — so it is worth
// asserting directly.

import { describe, it, expect } from "vitest";
import { importDoneBanner } from "./import-banner";
import type { ImportOutcome } from "@app/api/export-import-service";

function outcome(over: Partial<ImportOutcome> = {}): ImportOutcome {
  return { added: 0, replaced: 0, copied: 0, skipped: 0, driftSkipped: [], errors: [], ...over };
}
const drift = (name: string) => ({ projectName: name, reason: "changed after preview" });
const failure = (name: string) => ({ projectName: name, reason: "Storage error" });

describe("importDoneBanner", () => {
  describe("everything auto-skipped as drift", () => {
    it("names drift as the cause rather than reporting a bare zero", () => {
      const b = importDoneBanner(outcome({ driftSkipped: [drift("A"), drift("B")] }), 2, "local", 0);
      expect(b.text).toContain("All 2 projects were skipped");
      expect(b.text).toContain("changed while the preview was open");
      expect(b.hasErrors).toBe(false);
    });

    it("reads as singular for one project", () => {
      const b = importDoneBanner(outcome({ driftSkipped: [drift("Only")] }), 1, "local", 0);
      expect(b.text).toContain("All 1 project was skipped");
      expect(b.text).not.toContain("projects were");
    });

    it("does NOT claim drift when the user also chose to skip something", () => {
      // A deliberate skip alongside a drift-skip is a different story, and the
      // all-drift wording would misattribute the user's own choice.
      const b = importDoneBanner(outcome({ skipped: 1, driftSkipped: [drift("A")] }), 2, "local", 0);
      expect(b.text).not.toContain("changed while the preview was open");
      expect(b.text).toContain("all 2 skipped");
    });
  });

  it("reports a plain all-skipped import", () => {
    const b = importDoneBanner(outcome({ skipped: 3 }), 3, "local", 0);
    expect(b.text).toBe("No projects were imported — all 3 skipped.");
    expect(b.hasErrors).toBe(false);
  });

  it("itemises only the non-zero counts, in display order", () => {
    const b = importDoneBanner(outcome({ added: 2, replaced: 1, copied: 3, skipped: 4 }), 10, "local", 0);
    expect(b.text).toBe("Import complete: 2 added, 1 replaced, 3 copied as new, 4 skipped.");
    expect(b.text).not.toContain("0 ");
  });

  it("heads the summary with failure when a storage write failed, and counts it", () => {
    const b = importDoneBanner(outcome({ added: 1, errors: [failure("Bad")] }), 2, "local", 0);
    expect(b.text).toBe("Import finished with errors: 1 added, 1 failed (storage).");
    expect(b.hasErrors).toBe(true);
  });

  it("treats a pure storage failure as an error, not as an all-skipped import", () => {
    const b = importDoneBanner(outcome({ errors: [failure("Bad")] }), 1, "local", 0);
    expect(b.hasErrors).toBe(true);
    expect(b.text).toContain("Import finished with errors");
    expect(b.text).not.toContain("No projects were imported");
  });

  describe("cloudSyncActive", () => {
    it("is true only when something actually landed AND the mode is cloud", () => {
      expect(importDoneBanner(outcome({ added: 1 }), 1, "cloud", 0).cloudSyncActive).toBe(true);
      expect(importDoneBanner(outcome({ added: 1 }), 1, "local", 0).cloudSyncActive).toBe(false);
    });

    it("is false in cloud mode when nothing landed — a skipped import syncs nothing", () => {
      expect(importDoneBanner(outcome({ skipped: 2 }), 2, "cloud", 0).cloudSyncActive).toBe(false);
      expect(importDoneBanner(outcome({ driftSkipped: [drift("A")] }), 1, "cloud", 0).cloudSyncActive).toBe(false);
      expect(importDoneBanner(outcome({ errors: [failure("A")] }), 1, "cloud", 0).cloudSyncActive).toBe(false);
    });
  });
});

describe("importDoneBanner — dependency problems (v0.63.0)", () => {
  it("appends a note when imported projects carry broken dependency graphs", () => {
    const b = importDoneBanner(outcome({ added: 2 }), 2, "local", 1);
    expect(b.text).toContain("Import complete: 2 added.");
    expect(b.text).toContain("1 imported project has dependency problems");
  });

  it("pluralises the note", () => {
    const b = importDoneBanner(outcome({ added: 3 }), 3, "local", 2);
    expect(b.text).toContain("2 imported projects have dependency problems");
    expect(b.text).toContain("open them");
  });

  it("says nothing when there are no problems", () => {
    expect(importDoneBanner(outcome({ added: 1 }), 1, "local", 0).text).not.toContain(
      "dependency problems"
    );
  });

  it("stays silent when nothing landed — there is no imported project to open", () => {
    // A count can survive from the preview while every affected project was skipped;
    // claiming "1 imported project has dependency problems" would then be false.
    const b = importDoneBanner(outcome({ skipped: 2 }), 2, "local", 1);
    expect(b.text).not.toContain("dependency problems");
  });

  it("does not turn a clean import into an error", () => {
    expect(importDoneBanner(outcome({ added: 1 }), 1, "local", 1).hasErrors).toBe(false);
  });
});
