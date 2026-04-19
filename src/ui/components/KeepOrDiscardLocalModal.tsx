// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0. See LICENSE file in the project root for full license text.

import { useRef, useEffect } from "react";
import * as Dialog from "@radix-ui/react-dialog";

interface KeepOrDiscardLocalModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Keep the local copy of cloud data and switch to local mode. */
  onKeep: () => void;
  /** Wipe local data and switch to local mode. */
  onDiscard: () => void;
}

export function KeepOrDiscardLocalModal({
  open,
  onOpenChange,
  onKeep,
  onDiscard,
}: KeepOrDiscardLocalModalProps) {
  const keepButtonRef = useRef<HTMLButtonElement>(null);

  // Default focus on Keep — the non-destructive choice
  useEffect(() => {
    if (open) {
      const t = setTimeout(() => keepButtonRef.current?.focus(), 0);
      return () => clearTimeout(t);
    }
  }, [open]);

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/40 z-50" />
        <Dialog.Content className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-white dark:bg-gray-800 rounded-lg shadow-xl p-6 w-full max-w-md z-50">
          <Dialog.Title className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            Switch to Local Storage
          </Dialog.Title>
          <Dialog.Description className="mt-2 text-sm text-gray-600 dark:text-gray-300">
            Your projects are mirrored in this browser while in Cloud mode.
            Do you want to keep a local copy of your cloud data, or discard
            it?
          </Dialog.Description>

          <div className="mt-4 space-y-2 text-sm text-gray-600 dark:text-gray-400">
            <div>
              <span className="font-medium text-gray-900 dark:text-gray-100">
                Keep local copy:
              </span>{" "}
              Your cloud data stays in this browser for offline use. Future
              edits stay local until you re-enable Cloud Storage.
            </div>
            <div>
              <span className="font-medium text-gray-900 dark:text-gray-100">
                Discard:
              </span>{" "}
              Your cloud data is removed from this browser. Your cloud
              account is untouched — you can re-enable Cloud Storage
              anytime to restore.
            </div>
          </div>

          <div className="mt-6 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="px-4 py-1.5 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors"
            >
              Cancel
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
              ref={keepButtonRef}
              onClick={onKeep}
              className="px-4 py-1.5 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded transition-colors"
            >
              Keep local copy
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
