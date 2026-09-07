// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

/** `use-confirm-store` behaviour pins (WI-6a, v0.67.8). */
import { describe, it, expect, beforeEach } from "vitest";
import { confirmDialog, useConfirmStore } from "./use-confirm-store";

// WARNING: the store is a module-level singleton, so a question left unanswered by one test is
// still showing in the next. Raw `setState` on purpose — resetting via `dismissPending()` would
// make this reset depend on one of the behaviours it is supposed to isolate.
beforeEach(() => useConfirmStore.setState({ pending: null }));

describe("the beforeEach reset is load-bearing, and can prove it", () => {
  // WARNING: these two are a PAIR and run in declaration order. The first deliberately leaks a
  // pending question; the second asserts the next test starts clean. Delete the `beforeEach`
  // above and the second one FAILS. A shared reset that cannot demonstrate it can fail is not a
  // guard — it is a stub that happens to be present.
  it("first: leaves a pending question behind, because nothing settles it", () => {
    const leaked = confirmDialog.ask({ title: "leaked", description: "d" });
    expect(leaked).toBeInstanceOf(Promise);
    expect(useConfirmStore.getState().pending).not.toBeNull();
  });

  it("second: starts with no pending question — which only holds because the reset ran", () => {
    expect(useConfirmStore.getState().pending).toBeNull();
  });
});

describe("a second ask() while one is showing — PREDICTION: the first RESOLVES false, it does not hang", () => {
  it("supersedes the first question and settles it with its non-destructive value", async () => {
    const first = confirmDialog.ask({ title: "first", description: "d" });
    const second = confirmDialog.ask({ title: "second", description: "d" });

    // The point of the policy. A naive `set({ pending })` would leave `first` unsettled
    // forever, hanging its await and its continuation with it.
    await expect(first).resolves.toBe(false);

    const pending = useConfirmStore.getState().pending;
    expect(pending?.kind).toBe("confirm");
    expect(pending?.kind === "confirm" && pending.options.title).toBe("second");

    useConfirmStore.getState().settleConfirm(true);
    await expect(second).resolves.toBe(true);
  });

  it("supersedes a three-way with 'keep' — also the non-destructive branch", async () => {
    const first = confirmDialog.askUnsavedChanges();
    const second = confirmDialog.ask({ title: "second", description: "d" });
    await expect(first).resolves.toBe("keep");
    useConfirmStore.getState().settleConfirm(true);
    await expect(second).resolves.toBe(true);
  });
});

describe("dismissPending — the one mechanism behind both a route change and an unmount", () => {
  it("settles a confirm with false", async () => {
    const p = confirmDialog.ask({ title: "t", description: "d" });
    useConfirmStore.getState().dismissPending();
    await expect(p).resolves.toBe(false);
    expect(useConfirmStore.getState().pending).toBeNull();
  });

  it("settles a three-way with 'keep', never 'discard' and never 'save'", async () => {
    const p = confirmDialog.askUnsavedChanges();
    useConfirmStore.getState().dismissPending();
    await expect(p).resolves.toBe("keep");
    expect(useConfirmStore.getState().pending).toBeNull();
  });

  it("is a no-op when nothing is showing", () => {
    expect(() => useConfirmStore.getState().dismissPending()).not.toThrow();
    expect(useConfirmStore.getState().pending).toBeNull();
  });
});

describe("settling twice is a no-op — ConfirmDialog reports the close in the same click that confirmed", () => {
  it("the second settle cannot re-resolve or resurrect a question", async () => {
    const p = confirmDialog.ask({ title: "t", description: "d" });
    useConfirmStore.getState().settleConfirm(true);
    useConfirmStore.getState().settleConfirm(false); // what the trailing onOpenChange would do
    await expect(p).resolves.toBe(true);
    expect(useConfirmStore.getState().pending).toBeNull();
  });
});

describe("R49 as a TYPE rather than a comment", () => {
  it("ask() cannot yield a save — enforced by tsc in the ship gate, not by review", () => {
    type AskResult = Awaited<ReturnType<typeof confirmDialog.ask>>;
    // WARNING: if anyone widens `ask` to admit a third outcome, this directive becomes unused
    // and `tsc -b` FAILS with "Unused '@ts-expect-error' directive" — which is the whole point.
    // A Cancel button that can save is the reverted v0.67.3 defect (R48/R49).
    // @ts-expect-error "save" is unrepresentable in Promise<boolean>
    const _noSave: AskResult = "save";
    expect(typeof _noSave).toBe("string");
  });
});
