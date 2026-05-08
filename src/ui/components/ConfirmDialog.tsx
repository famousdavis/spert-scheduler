// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0. See LICENSE file in the project root for full license text.

import * as Dialog from "@radix-ui/react-dialog";
import type { ReactNode } from "react";

interface ConfirmDialogProps {
  /** Element rendered as `Dialog.Trigger asChild` — typically a button. */
  trigger: ReactNode;
  title: string;
  description: string;
  /** Fired in the same click that closes the dialog. Synchronous. */
  onConfirm: () => void;
  /** Defaults to "Confirm". */
  confirmLabel?: string;
  /** When true, the confirm button uses red destructive styling. */
  destructive?: boolean;
}

/**
 * Generic Radix-based confirmation dialog. Matches `KeepOrDiscardLocalModal`
 * style conventions. The confirm button wraps `Dialog.Close` so the dialog
 * auto-closes after `onConfirm` fires — fine for fire-and-forget actions
 * (e.g. revoke an invite). For async-error-recovery use cases that need to
 * keep the dialog open on failure, control `Dialog.Root.open` from the parent
 * instead.
 */
export function ConfirmDialog({
  trigger,
  title,
  description,
  onConfirm,
  confirmLabel = "Confirm",
  destructive = false,
}: ConfirmDialogProps) {
  return (
    <Dialog.Root>
      <Dialog.Trigger asChild>{trigger}</Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/40 z-50" />
        <Dialog.Content className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-white dark:bg-gray-800 rounded-lg shadow-xl p-6 w-[calc(100vw-1rem)] max-w-sm z-50">
          <Dialog.Title className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            {title}
          </Dialog.Title>
          <Dialog.Description className="mt-2 text-sm text-gray-600 dark:text-gray-300">
            {description}
          </Dialog.Description>
          <div className="mt-6 flex justify-end gap-3">
            <Dialog.Close asChild>
              <button
                type="button"
                className="px-4 py-2 text-sm text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-50 dark:hover:bg-gray-700"
              >
                Cancel
              </button>
            </Dialog.Close>
            <Dialog.Close asChild>
              <button
                type="button"
                onClick={onConfirm}
                className={`px-4 py-2 text-sm text-white rounded-md ${
                  destructive
                    ? "bg-red-600 hover:bg-red-700"
                    : "bg-blue-600 hover:bg-blue-700"
                }`}
              >
                {confirmLabel}
              </button>
            </Dialog.Close>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
