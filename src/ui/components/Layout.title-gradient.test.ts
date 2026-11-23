// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

import { describe, it, expect } from "vitest";

/**
 * The header's SPERT® Scheduler is drawn as a gradient in Scheduler's favicon orange (HDR26, v0.87.2), and every point
 * of it stays readable on the ground behind it, in both themes.
 *
 * RE-PINNED at v0.88.0 (FRAME26 stage 4), on purpose. The title moved onto the SPERT® Suite frame: its ground is the
 * frame's page ground (`--sf-page`, `#ffffff` / `#101828`, read from the vendored `spert-frame.css`), no longer the old
 * header's `bg-white` / `dark:bg-gray-800` (`#1e2939`); the ramps moved from a Tailwind class string (`TITLE_GRADIENT`)
 * into two custom properties in `src/styles.css`, `--app-grad-light` and `--app-grad-dark`, which the frame's `.sf-grad`
 * draws, ends unchanged; the title is the frame's `.sf-title`, 24 px bold at every width, which is large text, so the
 * bar is 3 : 1 (it was 4.5, because the title was 18 px below 1,024 px); and the fallbacks are the frame's (solid
 * `--sf-heading` under `prefers-contrast: more`, solid black in print).
 *
 * ⚠️ jsdom has no paint, so nothing here is measured from a render: the ends and the ground are read from the source
 * and the vendored stylesheet, and the contrast is computed here from the WCAG 2.x definition. The rendered page is
 * measured by frame-check (`contrast.title`, at 41 sRGB points). The colour maths is the HDR26 plan's Appendix A,
 * typed; it is copied, not shared.
 */
const SRC = join(process.cwd(), "src");
const STYLES = join(SRC, "styles.css");
const FRAME = join(SRC, "styles", "spert-frame.css");
const HEADER = join(SRC, "ui", "components", "AppHeader.tsx");

/** The title is 24 px bold (`.sf-title`), large text: WCAG's bar for it is 3 : 1. */
const BAR = 3;
/** The frame's page ground in each theme (`--sf-page`), which the vendored stylesheet must still declare. */
const PREMISE = { light: "#ffffff", dark: "#101828" } as const;
/** HDR26's ends (v0.87.2), unchanged by the move onto the frame. */
const ENDS = { light: ["#cc4b24", "#7c2000"], dark: ["#ffc1af", "#f26035"] } as const;
/** The weakest point of each ramp on its ground, measured when this was re-pinned (Oklab and sRGB agree). */
const WEAKEST = { light: "4.56", dark: "5.49" } as const;
/** "SPERT" and "Scheduler": one gradient per word, with the ® between them. */
const GRADIENT_SPANS = 2;

// ---- Appendix A (HDR26 plan v4), typed ------------------------------------------------------------------------

type Triple = [number, number, number];

const lin = (c: number) => {
  const s = c / 255;
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
};
const delin = (v: number) =>
  Math.round(255 * Math.min(1, Math.max(0, v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055)));
const rgb = (h: string): Triple => [1, 3, 5].map((i) => Number.parseInt(h.slice(i, i + 2), 16)) as Triple;
const hex = (a: number[]) => "#" + a.map((v) => v.toString(16).padStart(2, "0")).join("");
const luminance = (h: string) => {
  const [r, g, b] = rgb(h).map(lin) as Triple;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a: string, b: string) => {
  const [x, y] = [luminance(a), luminance(b)];
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
};
/** A contrast ratio to two decimals, truncated: never rounded up across a bar. */
const trunc = (n: number) => (Math.floor(n * 100) / 100).toFixed(2);

const toOklab = (h: string): Triple => {
  const [r, g, b] = rgb(h).map(lin) as Triple;
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
};
const linFromOklab = ([lk, a, b]: Triple): Triple => {
  const l = (lk + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (lk - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (lk - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
};
const fromOklab = (lab: Triple) => hex(linFromOklab(lab).map(delin));
const toLch = (h: string): Triple => {
  const [lk, a, b] = toOklab(h);
  return [lk, Math.hypot(a, b), ((Math.atan2(b, a) * 180) / Math.PI + 360) % 360];
};
const lab = ([lk, c, h]: Triple): Triple => [lk, c * Math.cos((h * Math.PI) / 180), c * Math.sin((h * Math.PI) / 180)];
const inGamut = (lch: Triple) => linFromOklab(lab(lch)).every((v) => v >= -1e-6 && v <= 1 + 1e-6);
/** Fit to sRGB by cutting chroma at fixed lightness and hue; never by clamping channels, which turns the hue. */
const fromLch = ([lk, c, h]: Triple) => {
  let fit = c;
  if (!inGamut([lk, c, h])) {
    let lo = 0;
    let hi = c;
    for (let i = 0; i < 40; i++) {
      const mid = (lo + hi) / 2;
      if (inGamut([lk, mid, h])) lo = mid;
      else hi = mid;
    }
    fit = lo;
  }
  return fromOklab(lab([lk, fit, h]));
};

/** A colour as Tailwind's theme.css writes it: `#rgb`, `#rrggbb`, or `oklch(L% C H)` with H possibly `none`. */
function parseCssColor(value: string): string {
  const v = value.trim();
  let m = /^#([0-9a-f]{3})$/i.exec(v);
  if (m) return "#" + [...m[1]!].map((c) => c + c).join("").toLowerCase();
  m = /^#([0-9a-f]{6})$/i.exec(v);
  if (m) return "#" + m[1]!.toLowerCase();
  m = /^oklch\(\s*([\d.]+)%\s+([\d.]+)\s+([\d.]+|none)\s*\)$/i.exec(v);
  if (m) return fromOklab(lab([Number(m[1]) / 100, Number(m[2]), m[3] === "none" ? 0 : Number(m[3])]));
  throw new Error("unreadable color: " + v);
}

/**
 * The weakest contrast along a ramp, 41 samples. `oklab` is how Tailwind 4's `bg-gradient-to-r` interpolates
 * (`to right in oklab`); `srgb` is a plain gradient's. Both are checked, so a change of interpolation cannot pass.
 */
function weakest(e1: string, e2: string, ground: string, space: "oklab" | "srgb"): number {
  let min = Infinity;
  const [a, b] = [toOklab(e1), toOklab(e2)];
  const [p, q] = [rgb(e1), rgb(e2)];
  for (let i = 0; i <= 40; i++) {
    const t = i / 40;
    const c =
      space === "oklab"
        ? fromOklab(a.map((v, k) => v + (b[k]! - v) * t) as Triple)
        : hex(p.map((v, k) => Math.round(v + (q[k]! - v) * t)));
    min = Math.min(min, contrast(c, ground));
  }
  return min;
}

// ---- Reading the source --------------------------------------------------------------------------------------

const read = (path: string) => readFileSync(path, "utf8");

/** The one declaration of `--app-grad-<theme>` in styles.css: its interpolation and its two stops. Exactly one. */
function ramp(theme: "light" | "dark"): { interpolation: string; stops: string[] } {
  const hits = [...read(STYLES).matchAll(new RegExp(`--app-grad-${theme}:\\s*linear-gradient\\(([^;]*)\\);`, "g"))];
  if (hits.length !== 1) throw new Error(`styles.css: --app-grad-${theme} declared ${hits.length} times, expected 1`);
  const parts = hits[0]![1]!.split(",").map((p) => p.trim());
  return { interpolation: parts[0]!, stops: parts.slice(1).map((c) => c.toLowerCase()) };
}

/** A custom property's value inside the vendored stylesheet's block that opens with `selector {`. */
function frameToken(selector: string, name: string): string {
  const css = read(FRAME);
  const start = css.indexOf(`${selector} {`);
  if (start === -1) throw new Error(`spert-frame.css: no block "${selector} {"`);
  const block = css.slice(start, css.indexOf("}", start));
  const m = new RegExp(`${name}:\\s*(#[0-9a-f]{6});`, "i").exec(block);
  if (!m) throw new Error(`spert-frame.css: no ${name} in "${selector}"`);
  return m[1]!.toLowerCase();
}
const LIGHT_ROOT = ":root";
const DARK_ROOT = ':root.dark, :root[data-theme="dark"]';

/** Every `<span className="…">text</span>` in the brand row's source whose classes include `cls`. */
function spansWith(cls: string): { classes: string[]; text: string }[] {
  return [...read(HEADER).matchAll(/<span\s+className="([^"]*)"[^>]*>([^<]*)<\/span>/g)]
    .map((m) => ({ classes: m[1]!.split(/\s+/), text: m[2]! }))
    .filter((s) => s.classes.includes(cls));
}

/** Every source file under src/, tests excluded. */
function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.(?:tsx?|css)$/.test(name) && !name.includes(".test.") ? [path] : [];
  });
}

// ---- The guard --------------------------------------------------------------------------------------------------

describe("the header's SPERT® Scheduler: a gradient in Scheduler's orange, readable in both themes (HDR26, on the frame)", () => {
  describe("instrument self-checks", () => {
    it("the contrast formula: #767676 on white is 4.54 : 1", () => {
      expect(trunc(contrast("#767676", "#ffffff"))).toBe("4.54");
    });

    it("the OKLCH steps rebuild the suite's old blue gradient from #0070f3, with its hue turns", () => {
      // As Appendix A writes it. Algebraically this is a round trip of #0099ff and #0051cc through OKLCH and the
      // gamut fit, so it checks those conversions, not the steps themselves.
      const [p, g1, g2] = ["#0070f3", "#0099ff", "#0051cc"].map(toLch) as [Triple, Triple, Triple];
      const stepOf = (g: Triple): Triple => [g[0] - p[0], g[1] / p[1], g[2] - p[2]];
      const withTurn = (fav: string, d: Triple) => {
        const [lk, c, h] = toLch(fav);
        return fromLch([lk + d[0], c * d[1], h + d[2]]);
      };
      expect(withTurn("#0070f3", stepOf(g1))).toBe("#0099ff");
      expect(withTurn("#0070f3", stepOf(g2))).toBe("#0051cc");
    });

    it("parseCssColor reads Tailwind's #fff and 'none'-hue forms, and refuses what it cannot read", () => {
      expect(parseCssColor("#fff")).toBe("#ffffff");
      expect(parseCssColor("oklch(98.5% 0 none)")).toBe("#fafafa");
      expect(() => parseCssColor("rgb(1, 2, 3)")).toThrow(/unreadable/);
    });

    it("the ramp sampler fails a known-bad: the old blue gradient is 2.99 : 1 on white", () => {
      // Vacuity control: a sampler that always passed would pass every row below.
      expect(trunc(weakest("#0099ff", "#0051cc", "#ffffff", "oklab"))).toBe("2.99");
    });
  });

  it("the title has exactly two gradient spans, SPERT and Scheduler, with no space inside either", () => {
    // Must-find, and the census: a reader that found nothing would pass every row below. The space before
    // "Scheduler" is text of the title (HDR26 ruling F1): inside the span, jsdom's accessible name loses it.
    const spans = spansWith("sf-grad");
    expect(spans.map((s) => s.text)).toEqual(["SPERT", "Scheduler"]);
    expect(spans).toHaveLength(GRADIENT_SPANS);
    for (const span of spans) expect(span.classes).toEqual(["sf-grad"]);
  });

  it("nothing else in the app draws a title gradient: no `.sf-grad` outside the brand row, no `TITLE_GRADIENT`", () => {
    // changelog-data.ts is excluded: its old entries name `TITLE_GRADIENT` in prose, as history, and must stay.
    const CHANGELOG_DATA = join(SRC, "ui", "pages", "changelog-data.ts");
    const stray = sourceFiles(SRC)
      .filter((f) => f !== HEADER && f !== FRAME && f !== STYLES && f !== CHANGELOG_DATA)
      .filter((f) => /\bsf-grad\b|TITLE_GRADIENT|bg-clip-text/.test(read(f)))
      .map((f) => f.replace(SRC + "/", ""));
    expect(stray).toEqual([]);
  });

  it("each theme's ramp is declared once in styles.css, interpolated in Oklab, with HDR26's two ends", () => {
    for (const theme of ["light", "dark"] as const) {
      const r = ramp(theme);
      expect(r.interpolation, theme).toBe("to right in oklab");
      expect(r.stops, theme).toEqual([...ENDS[theme]]);
    }
  });

  it("the ground is the frame's page ground, read from the vendored stylesheet, in each theme", () => {
    expect(frameToken(LIGHT_ROOT, "--sf-page")).toBe(PREMISE.light);
    expect(frameToken(DARK_ROOT, "--sf-page")).toBe(PREMISE.dark);
  });

  it("the title is the frame's 24 px bold, large text, so the bar is 3 : 1", () => {
    expect(read(FRAME)).toMatch(/\.sf-title \{[^}]*font: 700 24px\/32px var\(--sf-font\)/);
    // And the brand row sets no size, weight, ground or fade of its own on the link or the title.
    const header = read(HEADER);
    expect(header).toMatch(/<Link to="\/projects" className="sf-brand" data-sf="brand">/);
    expect(header).toMatch(/<span className="sf-title" data-sf="title">/);
  });

  for (const theme of ["light", "dark"] as const) {
    it(`${theme}: every point of the ramp meets ${BAR} : 1 on the page ground, in Oklab and in sRGB`, () => {
      const [from, to] = ramp(theme).stops as [string, string];
      for (const space of ["oklab", "srgb"] as const) {
        const w = weakest(from, to, PREMISE[theme], space);
        expect(w, `${theme} ${from} → ${to} on ${PREMISE[theme]} (${space}): ${trunc(w)}`).toBeGreaterThanOrEqual(BAR);
        expect(trunc(w), `${theme} (${space}): the weakest point measured at the re-pin`).toBe(WEAKEST[theme]);
      }
    });
  }

  it("falls back to solid in print and under prefers-contrast: more, by the frame's own rules", () => {
    const css = read(FRAME);
    const more = css.indexOf("@media (prefers-contrast: more)");
    const print = css.indexOf("@media print");
    expect(more).toBeGreaterThan(-1);
    expect(print).toBeGreaterThan(more);
    expect(css.slice(more, print)).toMatch(
      /\.sf-grad \{ background-image: none !important; -webkit-text-fill-color: currentColor !important; color: var\(--sf-heading\) !important; \}/,
    );
    expect(css.slice(print)).toMatch(
      /\.sf-grad \{ background-image: none !important; -webkit-text-fill-color: currentColor !important; color: #000 !important; \}/,
    );
  });

  it("the increased-contrast colour, the frame's heading colour, meets the bar on the ground too", () => {
    expect(contrast(frameToken(LIGHT_ROOT, "--sf-heading"), PREMISE.light)).toBeGreaterThanOrEqual(BAR);
    expect(contrast(frameToken(DARK_ROOT, "--sf-heading"), PREMISE.dark)).toBeGreaterThanOrEqual(BAR);
  });

  it("the ® between the words is the frame's muted mark, at 4.5 : 1 on both grounds (it is 12 px text)", () => {
    expect(spansWith("sf-mark").map((s) => [s.classes, s.text])).toEqual([[["sf-mark"], "®"]]);
    expect(contrast(frameToken(LIGHT_ROOT, "--sf-text-muted"), PREMISE.light)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(frameToken(DARK_ROOT, "--sf-text-muted"), PREMISE.dark)).toBeGreaterThanOrEqual(4.5);
  });
});
