// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import * as Dialog from "@radix-ui/react-dialog";
import { useRef } from "react";

interface UnsavedChangesDialogProps {
  open: boolean;
  /** Escape, overlay click and "Keep editing" all arrive here as `false`. */
  onOpenChange: (open: boolean) => void;
  onSave: () => void;
  onDiscard: () => void;
}

/**
 * Three-way prompt for dismissing an editor with unsaved, saveable changes:
 * Save / Discard / Keep editing.
 *
 * WARNING: this is a deliberate SIBLING of `ConfirmDialog`, not a third button on it and not a
 * `buttons: [...]` configuration. v0.67.3 shipped a Cancel button that could save, and the owner
 * reverted it (R48/R49); a two-button component that can grow a third outcome by configuration
 * puts that defect one prop away. Keeping the shapes apart is what makes "Cancel cannot save" a
 * property rather than a comment — `confirmDialog.ask()` returns `Promise<boolean>`, in which
 * "save" is unrepresentable, and `tsc` enforces that in the ship gate.
 *
 * Labels, order and default focus follow `KeepOrDiscardLocalModal`: three labelled outcomes with
 * the non-destructive one focused. Stacking and focus restore follow `ConfirmDialog` — see its
 * doc comment for why both classNames must stay whole static literals.
 */
export function UnsavedChangesDialog({
  open,
  onOpenChange,
  onSave,
  onDiscard,
}: UnsavedChangesDialogProps) {
  const keepRef = useRef<HTMLButtonElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/40 z-[60]" />
        <Dialog.Content
          className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-white dark:bg-gray-800 rounded-lg shadow-xl p-6 w-[calc(100vw-1rem)] max-w-md z-[60]"
          onOpenAutoFocus={(event) => {
            // Runs BEFORE FocusScope moves focus, so this is still the opener.
            openerRef.current = document.activeElement as HTMLElement | null;
            event.preventDefault();
            keepRef.current?.focus();
          }}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            openerRef.current?.focus();
          }}
        >
          <Dialog.Title className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            Unsaved changes
          </Dialog.Title>
          <Dialog.Description className="mt-2 text-sm text-gray-600 dark:text-gray-300">
            You have unsaved changes. Save them, discard them, or keep editing?
          </Dialog.Description>
          <div className="mt-6 flex justify-end gap-2">
            <button
              type="button"
              ref={keepRef}
              onClick={() => onOpenChange(false)}
              className="px-4 py-1.5 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors"
            >
              Keep editing
            </button>
            <button
              type="button"
              onClick={onDiscard}
              className="px-4 py-1.5 text-sm font-medium text-red-700 dark:text-red-400 border border-red-300 dark:border-red-800 hover:bg-red-50 dark:hover:bg-red-950/30 rounded transition-colors"
            >
              Discard
            </button>
            <button
              type="button"
              onClick={onSave}
              className="px-4 py-1.5 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded transition-colors"
            >
              Save
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
