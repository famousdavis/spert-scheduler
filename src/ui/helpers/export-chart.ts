import html2canvas from "html2canvas";

/**
 * Neutralize oklch() colors in cloned DOM tree.
 * html2canvas cannot parse oklch() (Tailwind CSS v4 default).
 * Only border-color properties use oklch in computed non-custom-property styles.
 */
function neutralizeOklch(_doc: Document, clonedEl: HTMLElement): void {
  const fix = (el: HTMLElement) => {
    const s = getComputedStyle(el);
    if (s.borderColor?.includes("oklch")) {
      el.style.borderColor = "transparent";
    }
  };
  fix(clonedEl);
  clonedEl.querySelectorAll("*").forEach((node) => {
    if (node instanceof HTMLElement) fix(node);
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
  const canvas = await html2canvas(element, {
    backgroundColor: "#ffffff",
    scale: 2, // Higher resolution
    ignoreElements: (el) => el.classList.contains("copy-image-button"),
    onclone: neutralizeOklch,
  });

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
