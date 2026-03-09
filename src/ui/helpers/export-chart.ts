import html2canvas from "html2canvas";

/**
 * Neutralize oklch() colors in cloned DOM tree.
 * html2canvas cannot parse oklch() (Tailwind CSS v4 default).
 * Uses a canvas to resolve oklch → rgb so colors are preserved visually.
 */
function neutralizeOklch(_doc: Document, clonedEl: HTMLElement): void {
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

  const props = [
    "color",
    "backgroundColor",
    "borderColor",
    "borderTopColor",
    "borderRightColor",
    "borderBottomColor",
    "borderLeftColor",
    "outlineColor",
  ] as const;

  const fix = (el: HTMLElement) => {
    const s = getComputedStyle(el);
    for (const p of props) {
      const v = s[p] as string | undefined;
      if (v?.includes("oklch")) {
        (el.style as unknown as Record<string, string>)[p] = resolve(v);
      }
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
