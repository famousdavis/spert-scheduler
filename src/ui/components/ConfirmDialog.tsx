// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import * as Dialog from "@radix-ui/react-dialog";
import { useRef, type ReactNode } from "react";

interface ConfirmDialogProps {
  /** Trigger mode (uncontrolled): element rendered as `Dialog.Trigger asChild`. */
  trigger?: ReactNode;
  /** Controlled mode: the parent owns `open`. Leave undefined in trigger mode. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  title: string;
  description: string;
  /** Fired in the same click that closes the dialog. Synchronous. */
  onConfirm: () => void;
  /** Fired exactly once when the dialog closes WITHOUT confirming (Cancel, Escape, overlay). */
  onCancel?: () => void;
  /** Defaults to "Confirm". */
  confirmLabel?: string;
  /** Defaults to "Cancel". */
  cancelLabel?: string;
  /** When true, the confirm button uses red destructive styling. */
  destructive?: boolean;
}

/**
 * Generic Radix-based confirmation dialog, in two modes.
 *
 * **Trigger mode** (`trigger` given, `open` omitted) is the original contract, used by
 * `ProjectTile` and `SharingSection`. **Controlled mode** (`open`/`onOpenChange`) is what
 * `ConfirmHost` drives; the component's doc comment promised it long before it existed.
 *
 * Three behaviours are load-bearing, and each is pinned in `ConfirmDialog.test.tsx`:
 *
 * 1. **`z-[60]` on both layers.** A confirmation opened from inside a `z-50` dialog stacked at
 *    the same level — live today in `SharingSection`'s revoke inside `ShareProjectModal`.
 *    Follows the `DependencyEditModal` precedent. WARNING: both classNames are WHOLE STATIC
 *    LITERALS on purpose. `dialog-stacking.test.ts` can only see a static double-quoted
 *    `className` (it failed open on a dynamic one until v0.67.8), and Tailwind 4's JIT scanner
 *    may emit no CSS at all for a class assembled in a template expression. Both rules point
 *    the same way: never interpolate these two.
 *
 * 2. **Default focus lands on Cancel**, the non-destructive choice (`SignOutConfirmModal`
 *    precedent), via `onOpenAutoFocus` — no effect involved. ⚠️ NOT a behaviour change
 *    for this component's own consumers: Cancel is the first tabbable, so Radix's autofocus
 *    already landed there (measured against the pre-v0.67.8 file). It BECOMES one at the nine
 *    native `confirm()` sites as they migrate, where the browser focused OK and Enter
 *    confirmed.
 *
 * 3. **The component restores focus itself.** A controlled, trigger-less Radix dialog returns
 *    focus NOWHERE: `DialogContentModal`'s `onCloseAutoFocus` calls `preventDefault()` — which
 *    also suppresses `FocusScope`'s own `previouslyFocusedElement` restore — and then focuses
 *    `triggerRef`, which is null when there is no `Dialog.Trigger`. Read at source in
 *    `@radix-ui/react-dialog` and `@radix-ui/react-focus-scope`. Because our handler runs first
 *    and `composeEventHandlers` skips Radix's once we `preventDefault()`, this component is the
 *    SOLE restorer — not one of two racing.
 *
 * WARNING: if the opener was destroyed by the confirmed action, `focus()` on the detached node
 * is a no-op and focus lands on `<body>`. That is a SECOND, independent cause which this fix
 * does not close — the call site names its own destination, as test P7 demonstrates.
 *
 * ⚠️ EIGHT of the nine migration sites destroy their own opener — this said FIVE until v0.67.11,
 * and the error ran in the dangerous direction: it tells a migrator that four sites need no focus
 * destination when only ONE does not. Evidence class is stated per row and is NOT to be levelled
 * up by relabelling:
 *
 *   - sites 1–4 (row ✕, bulk delete, scenario delete, corrupted project) — destroyed.
 *     MEASURED in Chromium, WI-6b.
 *   - site 5 (preferences reset) — SURVIVES. The only one, which is why `handleReset` is the only
 *     migrated site with no focus tail. MEASURED in Chromium, WI-6b.
 *   - site 6 (bulk apply) — destroyed on BOTH answers: `onApply` runs either way, and the grid's
 *     `handleBulkApply` ends in an unconditional `clearSelection()` that unmounts the toolbar
 *     holding the opener. REASONED at source, WI-6c. ⚠️ The property that made the five aborts
 *     tractable — "dismissing leaves you where you were" — does not hold here at all.
 *   - sites 7–9 (`ActivityEditModal` ×3) — destroyed; all terminate in `onClose()`, and
 *     `ProjectPage` renders the modal under `{editingActivityId && …}`. REASONED at source, WI-6d.
 */
export function ConfirmDialog({
  trigger,
  open,
  onOpenChange,
  title,
  description,
  onConfirm,
  onCancel,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  destructive = false,
}: ConfirmDialogProps) {
  const confirmedRef = useRef(false);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);

  // WARNING: `Dialog.Close` wraps BOTH buttons and fires `onOpenChange(false)` for both, so the
  // close event alone cannot tell a confirmation from a dismissal. The ref does. Radix composes
  // the child's `onClick` BEFORE its own close handler (`react-dialog`:
  // `composeEventHandlers(props.onClick, () => onOpenChange(false))`), so the flag is set in time.
  const handleOpenChange = (next: boolean) => {
    if (!next) {
      if (!confirmedRef.current) onCancel?.();
      confirmedRef.current = false;
    }
    onOpenChange?.(next);
  };

  return (
    <Dialog.Root open={open} onOpenChange={handleOpenChange}>
      {trigger !== undefined && <Dialog.Trigger asChild>{trigger}</Dialog.Trigger>}
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/40 z-[60]" />
        <Dialog.Content
          className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-white dark:bg-gray-800 rounded-lg shadow-xl p-6 w-[calc(100vw-1rem)] max-w-sm z-[60]"
          onOpenAutoFocus={(event) => {
            // Runs BEFORE FocusScope moves focus, so this is still the opener.
            openerRef.current = document.activeElement as HTMLElement | null;
            event.preventDefault();
            cancelRef.current?.focus();
          }}
          onCloseAutoFocus={(event) => {
            // WARNING: trigger mode is left to Radix ON PURPOSE. Its `triggerRef` is strictly
            // more reliable than a captured `activeElement` — clicking a <button> does not focus
            // it on Safari, so the capture can be <body> and restoring to it would LOSE the
            // trigger that Radix would have found. Returning without preventDefault lets
            // `composeEventHandlers` run Radix's own restore, exactly as before this release.
            // The override exists only for the trigger-less case, where that ref is null.
            if (trigger !== undefined) return;
            event.preventDefault();
            openerRef.current?.focus();
          }}
        >
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
                ref={cancelRef}
                className="px-4 py-2 text-sm text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-50 dark:hover:bg-gray-700"
              >
                {cancelLabel}
              </button>
            </Dialog.Close>
            <Dialog.Close asChild>
              <button
                type="button"
                onClick={() => {
                  confirmedRef.current = true;
                  onConfirm();
                }}
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
