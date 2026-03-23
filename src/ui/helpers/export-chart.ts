// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0. See LICENSE file in the project root for full license text.

import html2canvas from "html2canvas";

/**
 * Neutralize oklch() colors in cloned DOM tree.
 * html2canvas cannot parse oklch() (Tailwind CSS v4 default).
 * Uses a canvas to resolve oklch → rgb so colors are preserved visually.
 *
 * Two-pass approach:
 *  1. Fix CSS custom properties on :root (Tailwind v4 stores colors there).
 *     This causes var() references everywhere to resolve to rgb automatically.
 *  2. Fix any remaining oklch in computed standard properties on all elements
 *     (both HTML and SVG — SVG elements inherit color from parent HTML).
 */
function neutralizeOklch(doc: Document, clonedEl: HTMLElement): void {
  // Single reusable canvas to convert oklch → rgb
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
      if (prop.startsWith("--")) continue; // already handled on :root
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
 * Copy a DOM element as a PNG image to the clipboard.
 * Elements with the `copy-image-button` class are excluded from the capture.
 * @param element The element to capture
 */
export async function copyChartAsPng(
  element: HTMLElement
): Promise<void> {
  // Inline external stylesheets BEFORE html2canvas clones the DOM.
  // html2canvas clones into an iframe. Firefox CSP blocks the cloned <link>
  // from fetching the stylesheet because the iframe's origin doesn't match
  // 'self'. By converting <link> to inline <style> (same CSS rules, no fetch),
  // the clone inherits styles without triggering CSP. Computed styles on the
  // live document remain unchanged because the same rules are still applied.
  const swaps: { link: HTMLLinkElement; style: HTMLStyleElement; parent: Node; next: Node | null }[] = [];
  document.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]').forEach((link) => {
    if (!link.parentNode) return;
    // Find the matching CSSStyleSheet and extract its rules
    const sheet = [...document.styleSheets].find(
      (s) => s.ownerNode === link
    );
    if (!sheet) return;
    let cssText = "";
    try {
      for (const rule of sheet.cssRules) {
        cssText += rule.cssText + "\n";
      }
    } catch {
      // Cross-origin sheet — skip (shouldn't happen for same-origin Vite bundles)
      return;
    }
    const style = document.createElement("style");
    style.textContent = cssText;
    const parent = link.parentNode;
    const next = link.nextSibling;
    parent.replaceChild(style, link);
    swaps.push({ link, style, parent, next });
  });

  let canvas: HTMLCanvasElement;
  try {
    canvas = await html2canvas(element, {
      backgroundColor: "#ffffff",
      scale: 2, // Higher resolution
      ignoreElements: (el) => el.classList.contains("copy-image-button"),
      onclone: neutralizeOklch,
    });
  } finally {
    // Restore original <link> elements
    for (const { link, style, parent } of swaps) {
      parent.replaceChild(link, style);
    }
  }

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("Failed to create PNG blob"))),
      "image/png"
    );
  });

  await navigator.clipboard.write([
    new ClipboardItem({ "image/png": blob }),
  ]);
}
