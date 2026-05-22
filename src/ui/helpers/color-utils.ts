// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0. See LICENSE file in the project root for full license text.

export interface RgbColor {
  r: number;
  g: number;
  b: number;
}

/**
 * Parse a 6-digit hex color (with or without leading `#`) into RGB channels.
 * Returns null when the input is malformed or any other length (3-digit
 * shorthand, alpha-bearing 8-digit, named colors, etc.).
 */
export function hexToRgb(hex: string): RgbColor | null {
  const clean = hex.trim().replace(/^#/, "");
  if (!/^[0-9a-fA-F]{6}$/.test(clean)) return null;
  return {
    r: parseInt(clean.slice(0, 2), 16),
    g: parseInt(clean.slice(2, 4), 16),
    b: parseInt(clean.slice(4, 6), 16),
  };
}

/**
 * Build a muted `rgba(...)` background string from a hex color. Used for
 * subtle row tinting (e.g. band header rows). The default 0.18 alpha was
 * chosen empirically so PROJECT_TILE_COLORS render as a faint accent over
 * both light (white) and dark (gray-800) parents without overwhelming the
 * row contents. Returns null for invalid hex input so callers can fall back
 * to their default styling.
 *
 * v0.44.3 neutralized `color-mix()` for cross-browser reasons, which is why
 * this helper does explicit channel math instead.
 */
export function hexToTintedBackground(hex: string, alpha = 0.18): string | null {
  const rgb = hexToRgb(hex);
  if (!rgb) return null;
  return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${alpha})`;
}
