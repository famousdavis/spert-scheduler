// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0. See LICENSE file in the project root for full license text.

import { useRef, useEffect } from "react";
import * as Dialog from "@radix-ui/react-dialog";

interface SignOutConfirmModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** User confirmed — proceed with sign-out. */
  onConfirm: () => void;
}

/**
 * Confirmation modal shown before a user-initiated sign-out from cloud
 * storage (Path 1 in AuthProvider). Surfaces the v0.42.6 M4 local-cache
 * wipe to the user so an empty project list after sign-out is not
 * surprising. The wipe itself is unchanged — this modal only informs.
 *
 * Cancel is default-focused (the non-destructive choice), matching the
 * precedent set by KeepOrDiscardLocalModal.
 */
export function SignOutConfirmModal({
  open,
  onOpenChange,
  onConfirm,
}: SignOutConfirmModalProps) {
  const cancelButtonRef = useRef<HTMLButtonElement>(null);

  // Default focus on Cancel — the non-destructive choice.
  useEffect(() => {
    if (open) {
      const t = setTimeout(() => cancelButtonRef.current?.focus(), 0);
      return () => clearTimeout(t);
    }
  }, [open]);

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/40 z-50" />
        <Dialog.Content className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-white dark:bg-gray-800 rounded-lg shadow-xl p-6 w-full max-w-md z-50">
          <Dialog.Title className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            Sign out of cloud storage?
          </Dialog.Title>
          <Dialog.Description className="mt-2 text-sm text-gray-600 dark:text-gray-300">
            Your projects on this device will be removed when you sign out.
            They&apos;re safe in cloud storage and will reappear the next time
            you sign in.
          </Dialog.Description>

          <div className="mt-4 space-y-2 text-sm text-gray-600 dark:text-gray-400">
            <div>
              <span className="font-medium text-gray-900 dark:text-gray-100">
                What gets removed:
              </span>{" "}
              The locally-cached copy of your cloud projects in this browser
              profile. This prevents the next person who uses this device
              from reading your data.
            </div>
            <div>
              <span className="font-medium text-gray-900 dark:text-gray-100">
                What stays safe:
              </span>{" "}
              Everything in your cloud account. Sign in again on any device
              and all your projects come back.
            </div>
          </div>

          <div className="mt-6 flex justify-end gap-2">
            <button
              type="button"
              ref={cancelButtonRef}
              onClick={() => onOpenChange(false)}
              className="px-4 py-1.5 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={onConfirm}
              className="px-4 py-1.5 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded transition-colors"
            >
              Sign out
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
