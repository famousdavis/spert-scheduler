// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

// CI-5 (v0.79.x security audit): a cloud load mirrors every project to localStorage, but one
// oversized or over-quota shared document must not throw out of `setProjects` and abort the whole
// load — that surfaced as a "load failed" with an empty Dashboard. These drive the real store's
// cloud-entry action in a signed-in (UID) namespace, where the orphan sweep (SD-3) also applies.

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { useProjectStore } from "./use-project-store";
import { setStorageNamespace } from "@infrastructure/persistence/local-storage-repository";
import { createProject } from "@app/api/project-service";

const NS = "uid-R";
const dataKey = (id: string) => `spert:project:${NS}:${id}`;

beforeEach(() => {
  localStorage.clear();
  setStorageNamespace(NS);
  useProjectStore.getState().setProjects([]);
});

afterEach(() => {
  vi.restoreAllMocks();
  setStorageNamespace("local");
});

describe("CI-5 — a failing local-cache write never aborts the cloud load", () => {
  it("setProjects does not throw when every mirror write hits quota, and keeps all projects in memory", () => {
    const p1 = createProject("P1", "2026-11-02");
    const p2 = createProject("P2", "2026-11-02");
    const realSet = Storage.prototype.setItem;
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(function (this: Storage, key: string, value: string) {
      // Fail only the project DATA writes; the index write (spert:project-index:…) still succeeds.
      if (key.startsWith(`spert:project:${NS}:`)) throw new DOMException("full", "QuotaExceededError");
      realSet.call(this, key, value);
    });

    expect(() => useProjectStore.getState().setProjects([p1, p2])).not.toThrow();
    expect(useProjectStore.getState().projects.map((p) => p.name)).toEqual(["P1", "P2"]);
  });

  it("setProjects skips an oversized document's cache but still shows it, and caches the normal ones", () => {
    const normal = createProject("Normal", "2026-11-02");
    const big = { ...createProject("Big", "2026-11-02"), name: "x".repeat(2_000_001) };

    expect(() => useProjectStore.getState().setProjects([normal, big])).not.toThrow();

    const inStore = useProjectStore.getState().projects;
    expect(inStore.map((p) => p.id).sort()).toEqual([normal.id, big.id].sort());
    expect(localStorage.getItem(dataKey(normal.id))).not.toBeNull();
    expect(localStorage.getItem(dataKey(big.id))).toBeNull();
  });
});
