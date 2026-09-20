// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  isSectionCollapsed,
  setSectionCollapsed,
  clearAllCollapsedSections,
} from "./section-collapse-memory";
import { setStorageNamespace } from "./local-storage-repository";

const KEY = "spert-scheduler:collapsed-sections:local";
const stored = () => localStorage.getItem(KEY);

beforeEach(() => {
  localStorage.clear();
  setStorageNamespace("local");
});

afterEach(() => {
  vi.restoreAllMocks();
  setStorageNamespace("local");
});

describe("section collapse memory", () => {
  it("remembers nothing until something is collapsed: every section starts expanded", () => {
    expect(isSectionCollapsed("p1", "grid")).toBe(false);
    expect(isSectionCollapsed("p1", "milestones")).toBe(false);
    expect(isSectionCollapsed("p1", "dependencies")).toBe(false);
    expect(stored()).toBeNull();
  });

  it("remembers a collapse per project and per section", () => {
    setSectionCollapsed("p1", "grid", true);
    setSectionCollapsed("p2", "milestones", true);
    expect(isSectionCollapsed("p1", "grid")).toBe(true);
    expect(isSectionCollapsed("p1", "milestones")).toBe(false);
    expect(isSectionCollapsed("p2", "milestones")).toBe(true);
    expect(isSectionCollapsed("p2", "grid")).toBe(false);
  });

  it("stores only COLLAPSED sections, and forgets one on expand", () => {
    setSectionCollapsed("p1", "grid", true);
    setSectionCollapsed("p1", "dependencies", true);
    expect(JSON.parse(stored()!)).toEqual({ p1: ["grid", "dependencies"] });

    setSectionCollapsed("p1", "grid", false);
    expect(JSON.parse(stored()!)).toEqual({ p1: ["dependencies"] });
  });

  it("drops a project with nothing collapsed, and the key once no project has anything", () => {
    setSectionCollapsed("p1", "grid", true);
    setSectionCollapsed("p2", "grid", true);
    setSectionCollapsed("p1", "grid", false);
    expect(JSON.parse(stored()!)).toEqual({ p2: ["grid"] });

    setSectionCollapsed("p2", "grid", false);
    expect(stored()).toBeNull();
  });

  it("collapsing twice stores the section once", () => {
    setSectionCollapsed("p1", "grid", true);
    setSectionCollapsed("p1", "grid", true);
    expect(JSON.parse(stored()!)).toEqual({ p1: ["grid"] });
  });

  it("keeps each signed-in user's memory apart, and clears only the active one", () => {
    setStorageNamespace("uid-A");
    setSectionCollapsed("p1", "grid", true);
    setStorageNamespace("uid-B");
    expect(isSectionCollapsed("p1", "grid")).toBe(false);
    setSectionCollapsed("p1", "milestones", true);

    clearAllCollapsedSections();
    expect(localStorage.getItem("spert-scheduler:collapsed-sections:uid-B")).toBeNull();
    setStorageNamespace("uid-A");
    expect(isSectionCollapsed("p1", "grid")).toBe(true);
  });

  it.each([
    ["corrupt JSON", "not-json{"],
    ["an array", '["grid"]'],
    ["a string", '"grid"'],
    ["null", "null"],
  ])("reads %s as nothing collapsed", (_label, raw) => {
    localStorage.setItem(KEY, raw);
    expect(isSectionCollapsed("p1", "grid")).toBe(false);
  });

  it("ignores entries it does not recognise, and keeps the ones it does", () => {
    localStorage.setItem(KEY, JSON.stringify({ p1: ["grid", "gantt", 7], p2: "grid", p3: [] }));
    expect(isSectionCollapsed("p1", "grid")).toBe(true);
    expect(isSectionCollapsed("p2", "grid")).toBe(false);

    setSectionCollapsed("p1", "milestones", true);
    expect(JSON.parse(stored()!)).toEqual({ p1: ["grid", "milestones"] });
  });
});

/**
 * ⚠️ PINNED HERE, AT THE MODULE, AND NOT THROUGH A CLICK. A toggle whose storage write throws fails
 * no test when it is driven through the page: the state is set before the write, so the section
 * still collapses, and the throw surfaces only as vitest's run-level "unhandled error" — exit 1 with
 * 0 failed tests (measured). Asserting `not.toThrow()` on the write itself is
 * what makes a missing catch a failing TEST.
 */
describe("section collapse memory — storage that refuses", () => {
  it("a write that throws does not throw (a full or refused store)", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("The quota has been exceeded.", "QuotaExceededError");
    });
    expect(() => setSectionCollapsed("p1", "grid", true)).not.toThrow();
    expect(isSectionCollapsed("p1", "grid")).toBe(false);
  });

  it("a removal that throws does not throw, on expand or on a clear", () => {
    setSectionCollapsed("p1", "grid", true);
    vi.spyOn(Storage.prototype, "removeItem").mockImplementation(() => {
      throw new DOMException("The operation is insecure.", "SecurityError");
    });
    expect(() => setSectionCollapsed("p1", "grid", false)).not.toThrow();
    expect(() => clearAllCollapsedSections()).not.toThrow();
  });

  it("a read that throws reads as expanded", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new DOMException("The operation is insecure.", "SecurityError");
    });
    expect(isSectionCollapsed("p1", "grid")).toBe(false);
    expect(() => setSectionCollapsed("p1", "grid", true)).not.toThrow();
  });
});
