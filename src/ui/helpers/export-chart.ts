// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0. See LICENSE file in the project root for full license text.

import html2canvas from "html2canvas";

/**
 * Prepare the cloned DOM for html2canvas rendering:
 *  1. Replace <link rel="stylesheet"> with inline <style> tags in the clone.
 *     Firefox CSP blocks <link> fetches in the cloned iframe because the
 *     iframe's null origin doesn't match 'self'. Inlining the CSS rules from
 *     the LIVE document's stylesheets into the CLONE preserves all styles
 *     without any external fetch. The live DOM is never touched.
 *  2. Neutralize oklch() colors that html2canvas cannot parse.
 */
function prepareClone(doc: Document, clonedEl: HTMLElement): void {
  // -- Step 1: Inline stylesheets in the clone --
  // Read CSS rules from the LIVE document's sheets, inject as <style> into
  // the CLONE, then remove the <link> elements from the clone.
  doc.querySelectorAll('link[rel="stylesheet"]').forEach((link) => {
    // Match the cloned <link> to its live counterpart by href
    const href = link.getAttribute("href");
    const liveSheet = href
      ? [...document.styleSheets].find(
          (s) =>
            s.href === href ||
            s.href?.endsWith(href) ||
            (s.ownerNode as HTMLLinkElement)?.getAttribute?.("href") === href
        )
      : null;
    if (liveSheet) {
      let cssText = "";
      try {
        for (const rule of liveSheet.cssRules) {
          cssText += rule.cssText + "\n";
        }
      } catch {
        // Cross-origin — can't read rules, leave the <link> in place
        return;
      }
      const style = doc.createElement("style");
      style.textContent = cssText;
      link.parentNode?.replaceChild(style, link);
    } else {
      // No matching live sheet — remove to prevent CSP fetch attempt
      link.remove();
    }
  });

  // -- Step 2: Neutralize oklch() colors --
  // html2canvas cannot parse oklch() (Tailwind CSS v4 default).
  // Uses a canvas to resolve oklch → rgb so colors are preserved visually.
  const cvs = document.createElement("canvas");
  cvs.width = 1;
  cvs.height = 1;
  const ctx = cvs.getContext("2d")!;

  const resolve = (oklch: string): string => {
    ctx.clearRect(0, 0, 1, 1);
    ctx.fillStyle = "#000";
    ctx.fillStyle = oklch;
    ctx.fillRect(0, 0, 1, 1);
    const d = ctx.getImageData(0, 0, 1, 1).data;
    const r = d[0]!, g = d[1]!, b = d[2]!, a = d[3]!;
    return a < 255
      ? `rgba(${r},${g},${b},${(a / 255).toFixed(3)})`
      : `rgb(${r},${g},${b})`;
  };

  // Pass 1: Fix CSS custom properties (--color-*) on the cloned :root.
  const root = doc.documentElement;
  const rootStyles = getComputedStyle(root);
  for (let i = 0; i < rootStyles.length; i++) {
    const prop = rootStyles[i]!;
    if (prop.startsWith("--")) {
      const val = rootStyles.getPropertyValue(prop);
      if (val.includes("oklch")) {
        root.style.setProperty(prop, resolve(val.trim()));
      }
    }
  }

  // Pass 2: Fix remaining oklch in standard properties on all elements.
  const fix = (el: HTMLElement | SVGElement) => {
    const s = getComputedStyle(el);
    for (let i = 0; i < s.length; i++) {
      const prop = s[i]!;
      if (prop.startsWith("--")) continue;
      const val = s.getPropertyValue(prop);
      if (val.includes("oklch")) {
        el.style.setProperty(prop, resolve(val));
      }
    }
  };
  fix(clonedEl);
  clonedEl.querySelectorAll("*").forEach((node) => {
    if (node instanceof HTMLElement || node instanceof SVGElement) fix(node);
  });
}

/**
 * Render a DOM element to a PNG blob via html2canvas.
 * No live DOM manipulation — all work happens on the clone via onclone.
 */
function renderToBlob(element: HTMLElement): Promise<Blob> {
  return html2canvas(element, {
    backgroundColor: "#ffffff",
    scale: 2,
    ignoreElements: (el) => el.classList.contains("copy-image-button"),
    onclone: prepareClone,
  }).then(
    (canvas) =>
      new Promise<Blob>((resolve, reject) => {
        canvas.toBlob(
          (b) =>
            b ? resolve(b) : reject(new Error("Failed to create PNG blob")),
          "image/png"
        );
      })
  );
}

/**
 * Copy a DOM element as a PNG image to the clipboard.
 * Elements with the `copy-image-button` class are excluded from the capture.
 *
 * Uses Promise-based ClipboardItem: clipboard.write() is called synchronously
 * within the user gesture (before any await), and the blob Promise resolves
 * asynchronously when html2canvas finishes. This prevents Firefox from
 * revoking clipboard permission due to gesture expiration.
 *
 * @param element The element to capture
 */
export async function copyChartAsPng(
  element: HTMLElement
): Promise<void> {
  // Start rendering immediately (returns a Promise<Blob>).
  const blobPromise = renderToBlob(element);

  // Call clipboard.write() SYNCHRONOUSLY — before any await — so the user
  // gesture is still active when the browser checks permission.
  // ClipboardItem accepts a Promise<Blob> which resolves later.
  await navigator.clipboard.write([
    new ClipboardItem({ "image/png": blobPromise }),
  ]);
}
