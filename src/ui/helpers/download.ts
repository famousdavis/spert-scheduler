// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0. See LICENSE file in the project root for full license text.

/**
 * Replace characters that are invalid in filenames on Windows/macOS/Linux.
 * Returns "Untitled" if the result is empty after sanitization.
 * Truncates to 200 characters to stay within filesystem limits.
 */
export function sanitizeFilename(name: string): string {
  const sanitized = name.replace(/[/\\*?"<>|:]/g, "_").trim();
  if (!sanitized) return "Untitled";
  return sanitized.length > 200 ? sanitized.slice(0, 200) : sanitized;
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
