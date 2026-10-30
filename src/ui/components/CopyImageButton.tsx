// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { useState, useCallback, useRef, type RefObject } from "react";
import { toast } from "@ui/hooks/use-notification-store";
import { copyChartAsPng } from "@ui/helpers/export-chart";

/**
 * Browser supports clipboard.write() with image data.
 * Firefox exposes ClipboardItem and clipboard.write in the API surface but
 * they silently fail for image/png without a hidden about:config flag
 * (dom.events.asyncClipboard.clipboardItem). UA detection is the only
 * reliable way to distinguish "API exists" from "API actually works."
 */
const IS_FIREFOX = /Firefox\//i.test(navigator.userAgent);
const CLIPBOARD_IMAGE_SUPPORTED =
  !IS_FIREFOX &&
  typeof ClipboardItem !== "undefined" &&
  typeof navigator.clipboard?.write === "function";

type CopyStatus = "idle" | "copying" | "success" | "error";

/**
 * What the button's status says to a screen reader (WI-143). The icons carry no words, so without
 * it a copy that worked was silent. A failure says nothing here: the error toast announces it.
 */
const STATUS_TEXT: Record<CopyStatus, string> = {
  idle: "",
  copying: "Copying image to clipboard…",
  success: "Image copied to clipboard",
  error: "",
};

/** The longest the copy waits for a frame: a hidden tab runs no `requestAnimationFrame` (WI-143). */
const PAINT_WAIT_LIMIT_MS = 100;

/**
 * Resolve once the browser has painted what was just rendered: after the next frame, or after
 * {@link PAINT_WAIT_LIMIT_MS} if no frame comes (WI-143).
 *
 * html2canvas copies the page synchronously inside its call, and nothing paints until that is done,
 * so a busy state set in the same task first showed when the copy was mostly over — over a second
 * later on the sample project, longer on a bigger one. The `setTimeout` after the frame callback
 * runs once that frame's rendering is done.
 */
function afterNextPaint(): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, PAINT_WAIT_LIMIT_MS);
    requestAnimationFrame(() => setTimeout(resolve, 0));
  });
}

function resolveButtonClass(supported: boolean, status: CopyStatus): string {
  if (!supported) return "opacity-30 cursor-not-allowed";
  if (status === "copying") return "cursor-wait opacity-100";
  if (status === "idle") return "opacity-50 hover:opacity-100 cursor-pointer";
  return "opacity-100";
}

interface CopyImageButtonProps {
  targetRef: RefObject<HTMLElement | null>;
  title?: string;
  /** Capture the target's whole scroll width — see `CopyChartOptions.captureFullWidth`. */
  captureFullWidth?: boolean;
  /** Capture the target in its light theme — see `CopyChartOptions.captureLight` (WI-26). */
  captureLight?: () => () => void;
  /** Let html2canvas copy the whole page — see `CopyChartOptions.copyWholePage` (WI-143). */
  copyWholePage?: boolean;
}

export function CopyImageButton({
  targetRef,
  title = "Copy as image",
  captureFullWidth = false,
  captureLight,
  copyWholePage = false,
}: CopyImageButtonProps) {
  const [status, setStatus] = useState<CopyStatus>("idle");
  // While a copy runs the button is `aria-disabled`, not `disabled`: a disabled button loses focus
  // (measured in Chrome: it fell to the page's <body> and never came back), so a keyboard or
  // screen-reader user lost their place. A click during a copy therefore reaches this handler, and
  // is ignored here (WI-143).
  const busy = useRef(false);
  const resetTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const handleCopy = useCallback(async () => {
    const target = targetRef.current;
    if (!CLIPBOARD_IMAGE_SUPPORTED || !target || busy.current) return;
    busy.current = true;
    clearTimeout(resetTimer.current); // an earlier copy's tick must not end this copy's spinner

    setStatus("copying");
    // Let the busy state paint before html2canvas starts (WI-143). The wait is BEFORE the copy, not
    // inside it: the Gantt's light theme and html2canvas still share one task (WI-26).
    await afterNextPaint();
    try {
      await copyChartAsPng(target, { captureFullWidth, captureLight, copyWholePage });
      setStatus("success");
    } catch (err) {
      // Log the underlying cause so future copy failures can be diagnosed from
      // the browser console (the toast alone hides the html2canvas/clipboard error).
      console.error("CopyImageButton: copy failed", err);
      toast.error("Failed to copy image to clipboard");
      setStatus("error");
    } finally {
      busy.current = false;
      resetTimer.current = setTimeout(() => setStatus("idle"), 2000);
    }
  }, [targetRef, captureFullWidth, captureLight, copyWholePage]);

  const unsupportedTitle =
    "Copy image is not supported in this browser — try Chrome, Edge, or Safari";

  // The icon strokes `currentColor`, and nothing above the button sets a colour, so without
  // one of its own the icon inherited the page's default black — invisible on the dark
  // header bars (WI-103). The button therefore names its colour in both themes.
  const button = (
    <button
      className={`copy-image-button bg-transparent border-0 p-1 shrink-0 text-black dark:text-white transition-opacity duration-200 ${resolveButtonClass(CLIPBOARD_IMAGE_SUPPORTED, status)}`}
      onClick={handleCopy}
      disabled={!CLIPBOARD_IMAGE_SUPPORTED}
      aria-disabled={status === "copying" ? true : undefined}
      title={CLIPBOARD_IMAGE_SUPPORTED ? title : unsupportedTitle}
      aria-label={CLIPBOARD_IMAGE_SUPPORTED ? title : unsupportedTitle}
    >
      {status === "copying" && (
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="animate-spin"
        >
          <circle cx="12" cy="12" r="10" strokeOpacity="0.25" />
          <path d="M12 2a10 10 0 0 1 10 10" />
        </svg>
      )}
      {status === "success" && (
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="#059669"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <polyline points="20 6 9 17 4 12" />
        </svg>
      )}
      {status === "error" && (
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="#ef4444"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      )}
      {status === "idle" && (
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
        </svg>
      )}
    </button>
  );

  // The status follows the button, always mounted so a screen reader hears each change, and
  // outside it: a button's content is presentational, so a status inside it would go unheard. It
  // is absolutely positioned (`sr-only`), so it takes no place in its parent's layout, and it is
  // kept out of any picture (WI-143).
  return (
    <>
      {button}
      <span role="status" aria-live="polite" className="sr-only" data-capture-skip="">{STATUS_TEXT[status]}</span>
    </>
  );
}
