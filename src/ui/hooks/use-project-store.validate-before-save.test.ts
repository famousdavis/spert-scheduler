// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

// CI-6 (v0.79.x security audit): persist() validates the project against
// ProjectSchema before writing. A mutation that would leave a value the schema
// rejects on the next load ("persist then fail to load", which in cloud mode
// makes the project vanish for every member) must not reach localStorage or the
// cloud; the user keeps the edit in memory with a toast warning.

import { describe, it, expect, beforeEach, vi } from "vitest";
import { useProjectStore } from "./use-project-store";
import { createProject } from "@app/api/project-service";
import { toast } from "./use-notification-store";

function storedName(id: string): string | undefined {
  const raw = localStorage.getItem(`spert:project:local:${id}`);
  return raw ? (JSON.parse(raw) as { name: string }).name : undefined;
}

describe("CI-6 — validate before persisting", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
    useProjectStore.getState().setProjects([]);
  });

  it("refuses a save that would fail ProjectSchema on load, and warns", async () => {
    const p = createProject("Good Name");
    useProjectStore.getState().setProjects([p]); // persisted, valid
    expect(storedName(p.id)).toBe("Good Name");

    const spy = vi.spyOn(toast, "error");
    const tooLong = "x".repeat(201); // NAME_MAX_LENGTH is 200

    useProjectStore.getState().renameProject(p.id, tooLong);

    // The edit stays in memory (the user sees it)...
    expect(
      useProjectStore.getState().projects.find((x) => x.id === p.id)!.name
    ).toBe(tooLong);
    // ...but the invalid value never reached localStorage.
    expect(storedName(p.id)).toBe("Good Name");

    await Promise.resolve(); // flush the queued toast
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("control: a valid rename persists normally (no warning)", async () => {
    const p = createProject("Good Name");
    useProjectStore.getState().setProjects([p]);
    const spy = vi.spyOn(toast, "error");

    useProjectStore.getState().renameProject(p.id, "Renamed");

    expect(storedName(p.id)).toBe("Renamed");
    await Promise.resolve();
    expect(spy).not.toHaveBeenCalled();
  });
});
