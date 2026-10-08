// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

/**
 * WI-108 — the Clone Scenario window proposes a name no scenario has: "<source> (Copy)", then
 * "(Copy 2)" … — the rule a project's own clone follows (`nextCloneName`). The user can still type
 * any name, a taken one included. Each expected name is a literal.
 *
 * The window reads the names once, when it mounts; the PAGE mounts it only while it is open, and
 * `ProjectPage.test.tsx` opens it twice to pin that.
 */

import { describe, it, expect, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { CloneScenarioDialog } from "./CloneScenarioDialog";

function open(existingNames: string[], onClone = vi.fn()) {
  render(
    <CloneScenarioDialog
      open={true}
      onOpenChange={vi.fn()}
      sourceName="Baseline"
      existingNames={existingNames}
      onClone={onClone}
    />
  );
  return { onClone, input: screen.getByLabelText("New Name") as HTMLInputElement };
}

describe("CloneScenarioDialog — the proposed name (WI-108)", () => {
  it("proposes 'Baseline (Copy)' when no scenario has that name", () => {
    expect(open(["Baseline", "Downside"]).input.value).toBe("Baseline (Copy)");
  });

  it("proposes 'Baseline (Copy 2)' once 'Baseline (Copy)' is taken", () => {
    expect(open(["Baseline", "Baseline (Copy)"]).input.value).toBe("Baseline (Copy 2)");
  });

  it("proposes 'Baseline (Copy 3)' when '(Copy)' and '(Copy 2)' are both taken", () => {
    expect(open(["Baseline", "Baseline (Copy)", "Baseline (Copy 2)"]).input.value).toBe("Baseline (Copy 3)");
  });

  it("the user can still type any name — a taken one too — and Clone sends it as typed", () => {
    const { onClone, input } = open(["Baseline", "Baseline (Copy)"]);
    fireEvent.change(input, { target: { value: "Baseline (Copy)" } });
    fireEvent.click(screen.getByRole("button", { name: "Clone" }));
    expect(onClone).toHaveBeenCalledWith("Baseline (Copy)", false);
  });
});
