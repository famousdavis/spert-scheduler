// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0. See LICENSE file in the project root for full license text.

/**
 * Replace characters that are invalid in filenames on Windows/macOS/Linux.
 */
export function sanitizeFilename(name: string): string {
  return name.replace(/[/\\*?"<>|:]/g, "_");
}

/**
 * Generic file download helper — creates a Blob, triggers download via anchor element.
 */
export function downloadFile(
  content: BlobPart,
  filename: string,
  mimeType: string
): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  try {
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  } finally {
    URL.revokeObjectURL(url);
  }
}
