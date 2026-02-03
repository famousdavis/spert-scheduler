import html2canvas from "html2canvas";

/**
 * Export a DOM element as a PNG image.
 * @param element The element to capture
 * @param filename The filename (without extension)
 */
export async function exportChartAsPng(
  element: HTMLElement,
  filename: string
): Promise<void> {
  const canvas = await html2canvas(element, {
    backgroundColor: "#ffffff",
    scale: 2, // Higher resolution
  });

  const dataUrl = canvas.toDataURL("image/png");

  // Convert data URL to blob for download
  const res = await fetch(dataUrl);
  const blob = await res.blob();

  // Create download link
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${filename}.png`;
  a.click();
  URL.revokeObjectURL(url);
}
