// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { useConfirmStore } from "@ui/hooks/use-confirm-store";
import { ConfirmDialog } from "./ConfirmDialog";
import { UnsavedChangesDialog } from "./UnsavedChangesDialog";

/**
 * The single mounted dialog pair behind `confirmDialog.ask(...)` — mounted once in `Layout`
 * beside `ToastContainer`, which is the house pattern this follows: an imperative call from
 * anywhere, rendered by one container at the root.
 *
 * Both shapes render unconditionally; `open` selects which is visible. Settling clears the
 * store, which closes the dialog, which is why neither needs its own close plumbing.
 */
export function ConfirmHost() {
  const pending = useConfirmStore((s) => s.pending);
  const settleConfirm = useConfirmStore((s) => s.settleConfirm);
  const settleUnsavedChanges = useConfirmStore((s) => s.settleUnsavedChanges);
  const options = pending?.kind === "confirm" ? pending.options : null;

  return (
    <>
      <ConfirmDialog
        open={options !== null}
        title={options?.title ?? ""}
        description={options?.description ?? ""}
        confirmLabel={options?.confirmLabel}
        cancelLabel={options?.cancelLabel}
        destructive={options?.destructive}
        onConfirm={() => settleConfirm(true)}
        onCancel={() => settleConfirm(false)}
      />
      <UnsavedChangesDialog
        open={pending?.kind === "unsaved-changes"}
        onOpenChange={(next) => {
          if (!next) settleUnsavedChanges("keep");
        }}
        onSave={() => settleUnsavedChanges("save")}
        onDiscard={() => settleUnsavedChanges("discard")}
      />
    </>
  );
}
