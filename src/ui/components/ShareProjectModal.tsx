// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0. See LICENSE file in the project root for full license text.

import * as Dialog from "@radix-ui/react-dialog";
import type { Project } from "@domain/models/types";
import { SharingSection } from "./SharingSection";

interface ShareProjectModalProps {
  project: Project | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Close (X) icon — mirrors StorageLoginModal's CloseIcon. Inlined to avoid
 * touching that file; extract to a shared icon component if a third caller
 * appears.
 */
function CloseIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M18 6 6 18M6 6l12 12" />
    </svg>
  );
}

/**
 * Dashboard-level sharing modal opened from a project tile's Share icon.
 * Wraps the existing `SharingSection` in its `embedded` mode (expanded, no card
 * chrome). The caller only opens this for cloud-mode owned projects, but
 * `SharingSection` also self-gates on cloud/auth.
 */
export function ShareProjectModal({ project, open, onOpenChange }: ShareProjectModalProps) {
  // Guard before building the tree: JSX below dereferences project.id/name, and
  // Radix evaluates children at parent render time even while closed. This app's
  // dialogs use no forceMount/exit animation, so an early null return is safe.
  if (!project) return null;

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/40 z-50" />
        <Dialog.Content className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-white dark:bg-gray-800 rounded-lg shadow-xl p-6 w-full max-w-xl max-h-[85vh] overflow-y-auto z-50">
          <div className="flex items-start justify-between gap-4">
            <Dialog.Title className="text-lg font-semibold text-gray-900 dark:text-gray-100">
              Share “{project.name}”
            </Dialog.Title>
            <Dialog.Close asChild>
              <button
                type="button"
                aria-label="Close"
                className="shrink-0 p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors"
              >
                <CloseIcon />
              </button>
            </Dialog.Close>
          </div>
          <Dialog.Description className="sr-only">
            Manage sharing settings for this project.
          </Dialog.Description>
          <div className="mt-4">
            <SharingSection projectId={project.id} embedded />
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
