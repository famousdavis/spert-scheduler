// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

// WI-130 through the store: two tabs, each its own copy of the app's modules — its own store, its own list in memory —
// over this browser's one storage, as two browser tabs are. A "reload" is a third copy that loads from storage. The
// browser reproduction this follows (main, 2026-10-23): tab A lists Alpha and Bravo, tab B makes Charlie, tab A drags
// Bravo before Alpha — and every tab then listed Bravo and Alpha only, Charlie's data still stored.

import { describe, it, expect, beforeEach, vi } from "vitest";
import type { Project } from "@domain/models/types";
import { SCHEMA_VERSION } from "@domain/models/types";
import { createProject } from "@app/api/project-service";

type ProjectStore = (typeof import("./use-project-store"))["useProjectStore"];

interface Tab {
  readonly store: ProjectStore;
  names(): string[];
}

/** A new tab: fresh modules, so its own store and repository, over the one `localStorage`. */
async function openTab(namespace = "local"): Promise<Tab> {
  vi.resetModules();
  const storage = await import("@infrastructure/persistence/local-storage-repository");
  storage.setStorageNamespace(namespace);
  const { useProjectStore } = await import("./use-project-store");
  return {
    store: useProjectStore,
    names: () => useProjectStore.getState().projects.map((p) => p.name),
  };
}

const keyOf = (namespace: string, id: string) => `spert:project:${namespace}:${id}`;

function storedIndex(namespace = "local"): unknown {
  const raw = localStorage.getItem(`spert:project-index:${namespace}`);
  return raw === null ? null : JSON.parse(raw);
}

beforeEach(() => {
  localStorage.clear();
});

describe("WI-130 — a Dashboard drag in one tab, another tab's project, this browser's one storage", () => {
  it("T1 tab A's drag, its list older than tab B's new project, keeps that project: a reload lists all three", async () => {
    const tabA = await openTab();
    tabA.store.getState().loadProjects();
    const alpha = tabA.store.getState().addProject("Alpha", null);
    const bravo = tabA.store.getState().addProject("Bravo", null);

    const tabB = await openTab();
    tabB.store.getState().loadProjects();
    expect(tabB.names()).toEqual(["Alpha", "Bravo"]);
    const charlie = tabB.store.getState().addProject("Charlie", null);
    expect(storedIndex()).toEqual([alpha.id, bravo.id, charlie.id]);
    expect(tabA.names()).toEqual(["Alpha", "Bravo"]);

    tabA.store.getState().reorderProjects(1, 0);
    expect(tabA.names()).toEqual(["Bravo", "Alpha"]);
    expect(storedIndex()).toEqual([bravo.id, alpha.id, charlie.id]);

    const reloaded = await openTab();
    reloaded.store.getState().loadProjects();
    expect(reloaded.names()).toEqual(["Bravo", "Alpha", "Charlie"]);
    expect(reloaded.store.getState().loadErrors).toEqual([]);
  });

  it("T2 a list a drag before WI-130 left damaged is repaired at the next load, and stored so", async () => {
    const maker = await openTab();
    maker.store.getState().loadProjects();
    const alpha = maker.store.getState().addProject("Alpha", null);
    const bravo = maker.store.getState().addProject("Bravo", null);
    const charlie = maker.store.getState().addProject("Charlie", null);
    // What main's drag left in the browser (READINGS, part 1): the index names two of the three stored projects.
    localStorage.setItem("spert:project-index:local", JSON.stringify([bravo.id, alpha.id]));
    expect(localStorage.getItem(keyOf("local", charlie.id))).not.toBeNull();

    const tab = await openTab();
    tab.store.getState().loadProjects();

    expect(tab.names()).toEqual(["Bravo", "Alpha", "Charlie"]);
    expect(tab.store.getState().loadErrors).toEqual([]);
    expect(storedIndex()).toEqual([bravo.id, alpha.id, charlie.id]);
  });

  it("T3 a newer version's project keeps its notice and is never listed as a project, through this tab's drag and a reload", async () => {
    const maker = await openTab();
    maker.store.getState().loadProjects();
    const alpha = maker.store.getState().addProject("Alpha", null);
    const bravo = maker.store.getState().addProject("Bravo", null);
    const zulu: Project = { ...createProject("Zulu", "2026-11-02"), id: "zulu", schemaVersion: SCHEMA_VERSION + 1 };
    localStorage.setItem(keyOf("local", "zulu"), JSON.stringify(zulu));
    localStorage.setItem("spert:project-index:local", JSON.stringify([alpha.id, "zulu", bravo.id]));

    const tab = await openTab();
    tab.store.getState().loadProjects();
    expect(tab.names()).toEqual(["Alpha", "Bravo"]);
    expect(tab.store.getState().loadErrors.map((e) => [e.projectId, e.type])).toEqual([["zulu", "future_version"]]);

    tab.store.getState().reorderProjects(1, 0);
    expect(storedIndex()).toEqual([bravo.id, "zulu", alpha.id]);

    const reloaded = await openTab();
    reloaded.store.getState().loadProjects();
    expect(reloaded.names()).toEqual(["Bravo", "Alpha"]);
    expect(reloaded.store.getState().loadErrors.map((e) => [e.projectId, e.type])).toEqual([["zulu", "future_version"]]);
  });

  it("T4 SD-3: the cloud's answer replaces this browser's copy of the signed-in user's list, and a project it no longer names is swept from the device, not merely unlisted", async () => {
    const tab = await openTab("uid-A");
    const one = createProject("Cloud One", "2026-11-02");
    const two = createProject("Cloud Two", "2026-11-02");
    tab.store.getState().setProjects([one, two]);
    expect(storedIndex("uid-A")).toEqual([one.id, two.id]);

    // The next answer no longer names Cloud Two — deleted on another device, or no longer shared.
    tab.store.getState().setProjects([one]);
    expect(storedIndex("uid-A")).toEqual([one.id]);
    // SD-3: was `.not.toBeNull()` — the stale mirror copy lingered. replaceIndex now sweeps it.
    expect(localStorage.getItem(keyOf("uid-A", two.id))).toBeNull();

    tab.store.getState().loadProjects();
    expect(tab.names()).toEqual(["Cloud One"]);
  });

  it("T5 a drag in a signed-in user's storage keeps another tab's new project in this browser's copy of the list", async () => {
    const tabA = await openTab("uid-A");
    tabA.store.getState().loadProjects();
    const one = tabA.store.getState().addProject("One", "uid-A");
    const two = tabA.store.getState().addProject("Two", "uid-A");

    const tabB = await openTab("uid-A");
    tabB.store.getState().loadProjects();
    const three = tabB.store.getState().addProject("Three", "uid-A");

    tabA.store.getState().reorderProjects(1, 0);
    expect(storedIndex("uid-A")).toEqual([two.id, one.id, three.id]);
  });
});
