// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { create } from "zustand";

export interface ConfirmOptions {
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
}

export type UnsavedChangesAnswer = "save" | "discard" | "keep";

export type PendingRequest =
  | { kind: "confirm"; options: ConfirmOptions; resolve: (ok: boolean) => void }
  | { kind: "unsaved-changes"; resolve: (answer: UnsavedChangesAnswer) => void };

interface ConfirmStore {
  pending: PendingRequest | null;
  enqueue: (request: PendingRequest) => void;
  settleConfirm: (ok: boolean) => void;
  settleUnsavedChanges: (answer: UnsavedChangesAnswer) => void;
  /**
   * Answer whatever is showing with its dismissal value and clear it. Used by a route
   * change (`router.tsx`) and by `enqueue` when a second question arrives.
   */
  dismissPending: () => void;
}

export const useConfirmStore = create<ConfirmStore>((set, get) => ({
  pending: null,

  enqueue: (request) => {
    // ⚠️ A second ask() while one is showing DISMISSES the first — it does not queue behind
    // it and it is not dropped. The hazard being closed is not "which dialog wins": a naive
    // `set({ pending: request })` would leave the displaced promise NEVER SETTLED, hanging
    // its `await` and its continuation forever. Superseding is safe by construction because
    // both dismissal values are the non-destructive branch (see `dismissPending`), so a
    // displaced question can never let a delete or a discard proceed.
    //
    // Deliberately the SAME code path as a route-change dismissal, so the two policies
    // cannot drift apart.
    get().dismissPending();
    set({ pending: request });
  },

  settleConfirm: (ok) => {
    // The kind guard also makes a double-settle a no-op: `ConfirmDialog` reports the close
    // through `onOpenChange` in the same click that already ran `onConfirm`.
    const { pending } = get();
    if (pending?.kind !== "confirm") return;
    set({ pending: null });
    pending.resolve(ok);
  },

  settleUnsavedChanges: (answer) => {
    const { pending } = get();
    if (pending?.kind !== "unsaved-changes") return;
    set({ pending: null });
    pending.resolve(answer);
  },

  dismissPending: () => {
    const { pending } = get();
    if (!pending) return;
    set({ pending: null });
    // Both dismissal values are the non-destructive answer: nothing is deleted, nothing is
    // discarded. That is what makes superseding and route-clearing safe to do silently.
    if (pending.kind === "confirm") pending.resolve(false);
    else pending.resolve("keep");
  },
}));

/**
 * Imperative entry points — `toast.success(...)` applied to confirmation: called mid-function,
 * rendered by one container mounted in `Layout`.
 *
 * ⚠️ `ask` returns `Promise<boolean>`, so `"save"` is UNREPRESENTABLE in its type. The three-way
 * is a separate function with a separate return type, which is why a two-way call site cannot
 * acquire a Save outcome by configuration. That is R49 as a property rather than a comment, and
 * it is enforced by `tsc` in the ship gate. Do not merge these into one call taking a button
 * array — that puts the reverted v0.67.3 defect one prop away.
 */
export const confirmDialog = {
  ask: (options: ConfirmOptions): Promise<boolean> =>
    new Promise((resolve) =>
      useConfirmStore.getState().enqueue({ kind: "confirm", options, resolve }),
    ),
  askUnsavedChanges: (): Promise<UnsavedChangesAnswer> =>
    new Promise((resolve) =>
      useConfirmStore.getState().enqueue({ kind: "unsaved-changes", resolve }),
    ),
};
