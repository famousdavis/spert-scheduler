// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { describe, it, expect, beforeEach } from "vitest";
import { useProjectStore } from "./use-project-store";
import { createProject } from "@app/api/project-service";

/**
 * v0.89.0 (FRAME26 clean-up L; contract §7): the store names each sample it adds against EVERY project it holds,
 * archived ones included, and adds it at the end of the list, as a new project is added. Until v0.89.0 a second sample
 * was "Cloud ERP Solution (Sample) (Copy)".
 */
const BASE = "Sample: Cloud ERP Solution";
const store = () => useProjectStore.getState();
const names = () => store().projects.map((p) => p.name);

beforeEach(() => {
  localStorage.clear();
  useProjectStore.setState({ projects: [], loadError: false, loadErrors: [] });
});

describe("loadSampleProject names the sample", () => {
  it("a first sample is the base, a second (2), a third (3), each added at the end", async () => {
    const own = createProject("Heart of Gold", "2026-11-09");
    useProjectStore.setState({ projects: [own] });
    expect((await store().loadSampleProject(null))!.name).toBe(BASE);
    expect((await store().loadSampleProject(null))!.name).toBe(`${BASE} (2)`);
    expect((await store().loadSampleProject(null))!.name).toBe(`${BASE} (3)`);
    expect(names()).toEqual(["Heart of Gold", BASE, `${BASE} (2)`, `${BASE} (3)`]);
  }, 30_000);

  it("an archived project holding the base takes it: the new sample is (2)", async () => {
    const archived = { ...createProject(BASE, "2026-11-09"), archived: true };
    useProjectStore.setState({ projects: [archived] });
    expect((await store().loadSampleProject(null))!.name).toBe(`${BASE} (2)`);
  }, 30_000);

  it("a sample deleted frees its name again", async () => {
    const first = (await store().loadSampleProject(null))!;
    await store().loadSampleProject(null);
    store().deleteProject(first.id);
    expect((await store().loadSampleProject(null))!.name).toBe(BASE);
  }, 30_000);
});
