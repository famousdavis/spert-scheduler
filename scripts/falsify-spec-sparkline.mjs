// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

// Falsification spec for WI-77: the activity grid's distribution sparkline draws the distribution the
// simulation samples from the row's estimate, for all five types, on the row's own numbers and Confidence
// (owner ruling, 2026-10-08); its card shows on the Confidence cell too, anchored to that cell's right
// edge, and never as an empty box; and on a planned row a green dashed line marks the scheduled duration
// the Duration cell shows (owner ruling, 2026-10-10).
//
// Each straw breaks ONE guarantee, and most are a tempting wrong design: the old T-Normal bell centred on
// Most Likely (S1), a Confidence-blind spread (S2), LogNormal pinned to Most Likely as it was drawn before
// (S3), the card's box kept at the call site (S4), a standard deviation set directly ignored (S9), the
// sparkline's former resolution (S12), the half-height Uniform (S13), and the marker at Most Likely, at
// the mean, or at the unrounded quantile instead of the number the grid shows (S16, S17, S20), and the two
// dashed lines drawn in colours under 3:1 (S21, S22). S23–S29 are six wrong builds that once passed the
// whole suite — the Confidence card gated on the distribution type alone (S23), the marker gated on a
// missing actual duration rather than the status (S24), a Most Likely line on Uniform (S25), a Confidence
// cell that is not a hover group (S26), a card never hidden (S27), a fill left open under an open tail
// (S28) — and the Confidence card centred on its narrow cell, as it first was (S29). S30–S33 break where the two
// dashed lines meet, within 1 px, and are drawn as one line of alternating blue and green dashes at their midpoint
// (owner ruling, 2026-10-29): the green's offset dropped, so its dashes land on the blue's (S30); the meet test
// removed, so the green covers the blue as before (S31); meeting widened to 2 px (S32); and no midpoint, so the two
// stay a fraction of a pixel apart (S33). S30 used to swap the order the two lines are drawn in, under 2026-10-10's
// "the green is drawn over the blue"; with alternating dashes the order hides nothing, and that straw failed no
// test, so it was replaced.
// Each straw names EXACTLY the tests it must fail, and no others — read "K failing; named-match K", not
// merely a non-zero exit: the runner prints ✔ when ANY named test fails. Every expected set was written
// before the run that first included it, with one exception, corrected after the first run and said at
// the straw: S12's. S20's straw was rebuilt after that run too — its edit had moved a line another test
// pins by number, and that third failure belonged to the edit, not to the wrong design. S30–S33's sets are
// the other way round, by design: each was written from what that straw failed when first run alone
// (2026-10-29), as was S21's after its needle moved with the line it edits (still L1 alone). The same day,
// S16, S17, S18, S20 and S24 each failed one test more than their sets named, in the whole-spec run: L2, the
// test of where the two lines meet, whose rows mark the duration too. Each was then run alone to name it,
// and L2 was added to its set.
//
// NOT HERE, on purpose: "Beta-PERT's curve is its own, not T-Normal's, on the same estimate" and "never
// draws a NaN, at any level, for any in-order Beta-PERT estimate" are controls with no single wrong design
// of their own — any straw that fails them fails most of the file too.
//
// testFile is all of src/, so every straw runs against the whole suite.
const CURVE = new URL("../src/ui/components/sparkline-curve.ts", import.meta.url).pathname;
const CARD = new URL("../src/ui/components/DistributionSparkline.tsx", import.meta.url).pathname;
const ROW = new URL("../src/ui/components/UnifiedActivityRow.tsx", import.meta.url).pathname;

// DistributionSparkline.test.tsx — the curve
const C1 = "T-Normal is centred on the PERT mean, not on Most Likely";
const C2 = "T-Normal's width follows Confidence: 12.7 px at half height at Near certainty, 72.7 at Guesstimate";
const C3 = "LogNormal peaks at its own mode, left of Most Likely on 10 / 30 / 40";
const C4 = "T-Normal and LogNormal are redrawn when Confidence changes";
const C5 =
  "a T-Normal tail runs open off the frame, at its true height, and the area under it is filled down to the baseline";
const C6 =
  "a Beta-PERT whose Most Likely equals Min climbs a wall at Min to a finite top, then falls to the baseline at Max";
const C7 = "Uniform fills the card: flat at the top, walled at Min and Max, with no Most Likely line";
const C8 =
  "a standard deviation set directly is drawn: with SD 20, T-Normal 10 / 12 / 40 still stands at half its peak at Max";
const C9 = "a point estimate whose standard deviation was set directly draws its bell, centred on the estimate";
const C10 =
  "a Beta-PERT that climbs almost straight up at Min is drawn so: half a pixel in, it is at 0.96 of its peak";
const C12 = "Beta-PERT peaks exactly at Most Likely, at the top of the card";
const C13 =
  "Beta-PERT is redrawn at the row's Confidence: narrower at High than at Medium, and at Medium than at Low";
const C15 = "Triangular is its exact triangle: the apex at Most Likely at the top, both ends on the baseline";
// DistributionSparkline.test.tsx — the card
const K1 = "is not drawn at all for an out-of-order estimate, of any type, or for LogNormal at zero";
const K2 =
  "shows on the Confidence cell too, against the cell's right edge, shown only while its cell is hovered, where the level changes the curve, and not where it cannot";
// DistributionSparkline.test.tsx — the scheduled duration
const M1 = "is marked at the number the Duration cell shows, on three rows";
const M2 = "moves with the Activity target: 17 days at P50, 22 at P80";
const M3 = "is marked on the Confidence cell's card too";
const M4 =
  "is not marked on an in-progress or a complete row, with or without days worked or an actual: the line is for planned rows";
const M5 = "is not marked where there is no curve";
const M6 = "past Max is drawn on Max's edge, and below Min on Min's";
// DistributionSparkline.test.tsx — the two dashed lines
const L1 =
  "are drawn opaque, in the colours measured at 3:1 or more against the card and the fill, in both themes";
const L2 =
  "where they meet, within 1 px, are one line of alternating blue and green dashes at their midpoint; apart, or with no green line, each is as before";
// inert-controls.test.tsx
const I1 = "draws a Beta-PERT row's hover sparkline at that row's own Confidence";
const I2 = "draws no hover sparkline on a greyed cell";

const escape = (s) => s.replaceAll(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`);

/** Matches exactly these test titles, as the verbose reporter prints them. */
const only = (...titles) => new RegExp(`> (?:${titles.map(escape).join("|")})$`);

const BUILD = "    return createDistributionForActivity({ ...SPARKLINE_ACTIVITY, ...estimate });";
const FACTORY_IMPORT = 'import { createDistributionForActivity } from "@core/distributions/factory";';
const NORMAL_IMPORT = `${FACTORY_IMPORT}\nimport { NormalDistribution } from "@core/distributions/normal";`;
const DISTRIBUTION_CARD =
  "        <DistributionSparkline activity={activity} scheduledActivity={scheduledActivity} />\n      </div>\n\n      {/* Confidence";
const CONFIDENCE_CARD =
  '{confidenceIsRelevant && <DistributionSparkline activity={activity} scheduledActivity={scheduledActivity} anchor="right" />}';

export const testFile = "src/";
export const mutations = [
  // -- The curve ----------------------------------------------------------------------------------
  {
    id: "S1  T-Normal centred on Most Likely, with its true spread  [expect 3: C1, C5, C8]",
    file: CURVE,
    find: BUILD,
    replace:
      "    const built = createDistributionForActivity({ ...SPARKLINE_ACTIVITY, ...estimate });\n" +
      '    if (estimate.distributionType === "normal") return new NormalDistribution(estimate.mostLikely, built.parameters().sigma);\n' +
      "    return built;",
    also: { find: FACTORY_IMPORT, replace: NORMAL_IMPORT },
    expectFailing: only(C1, C5, C8),
  },
  {
    id: "S2  T-Normal at the PERT mean with a fixed spread of a fifth of the range  [expect 4: C2, C4, C8, C9]",
    file: CURVE,
    find: BUILD,
    replace:
      "    const built = createDistributionForActivity({ ...SPARKLINE_ACTIVITY, ...estimate });\n" +
      '    if (estimate.distributionType === "normal") return new NormalDistribution(built.mean(), (estimate.max - estimate.min) * 0.2);\n' +
      "    return built;",
    also: { find: FACTORY_IMPORT, replace: NORMAL_IMPORT },
    expectFailing: only(C2, C4, C8, C9),
  },
  {
    id: "S3  LogNormal pinned to Most Likely (drawn as a Beta-PERT)  [expect 1: C3]",
    file: CURVE,
    find: BUILD,
    replace:
      '    return createDistributionForActivity({ ...SPARKLINE_ACTIVITY, ...estimate, ...(estimate.distributionType === "logNormal" ? { distributionType: "betaPert" as const } : {}) });',
    expectFailing: only(C3),
  },
  {
    id: "S6  the order check removed: an out-of-order T-Normal is drawn  [expect 2: K1, M5]",
    file: CURVE,
    find: "  if (estimateOrderIssues(estimate.min, estimate.mostLikely, estimate.max).length > 0) return null;\n",
    replace: "",
    expectFailing: only(K1, M5),
  },
  {
    id: "S9  a standard deviation set directly is ignored  [expect 2: C8, C9]",
    file: CURVE,
    find: BUILD,
    replace: "    return createDistributionForActivity({ ...SPARKLINE_ACTIVITY, ...estimate, sdOverride: undefined });",
    expectFailing: only(C8, C9),
  },
  {
    id: "S10 no wall where a distribution ends  [expect 2: C6, C7]",
    file: CURVE,
    find:
      "  const stroke = [\n    ...(dist.cdf(frame.lo) <= 0 ? [leftFoot] : []),\n    ...points,\n    ...(dist.cdf(frame.hi) >= 1 ? [rightFoot] : []),\n  ];",
    replace: "  const stroke = [...points];",
    expectFailing: only(C6, C7),
  },
  {
    id: "S11 every edge walled, a tail that runs on included  [expect 2: C5, C8]",
    file: CURVE,
    find: "    ...(dist.cdf(frame.lo) <= 0 ? [leftFoot] : []),",
    replace: "    ...[leftFoot],",
    also: { find: "    ...(dist.cdf(frame.hi) >= 1 ? [rightFoot] : []),", replace: "    ...[rightFoot]," },
    expectFailing: only(C5, C8),
  },
  {
    // Written first as C3 and C10. C3 survives, measured: with one sample a day on 10 / 30 / 40, the two
    // samples either side of LogNormal's mode differ by 0.03 px, are written at the same height, and the
    // test reads the middle of that flat top — 0.07 px from the mode. The near-vertical edge is the catch.
    id: "S12 the former resolution: 31 columns, no fifth-pixel edge points  [expect 1: C10]",
    file: CURVE,
    find: "samplePoints(frame, [estimate.mostLikely, dist.mean()], columns)",
    replace: "samplePoints(frame, [estimate.mostLikely, dist.mean()], 30)",
    also: {
      find: "const EDGE_STEPS = [0.2, 0.4, 0.6, 0.8, -0.8, -0.6, -0.4, -0.2];",
      replace: "const EDGE_STEPS: number[] = [];",
    },
    expectFailing: only(C10),
  },
  {
    id: "S13 Uniform drawn at half height  [expect 1: C7]",
    file: CURVE,
    find: "  const peak = peakOf(samples.map((s) => s.density));\n  if (peak === null) return null;",
    replace:
      "  const found = peakOf(samples.map((s) => s.density));\n  if (found === null) return null;\n" +
      '  const peak = estimate.distributionType === "uniform" ? 2 * found : found;',
    expectFailing: only(C7),
  },
  {
    id: "S14 Most Likely and the mean not sampled: peaks drawn at the nearest column  [expect 2: C12, C15]",
    file: CURVE,
    find: "samplePoints(frame, [estimate.mostLikely, dist.mean()], columns)",
    replace: "samplePoints(frame, [], columns)",
    expectFailing: only(C12, C15),
  },
  {
    id: "S15 Beta-PERT drawn at Medium whatever the row's Confidence  [expect 3: C10, C13, I1]",
    file: CURVE,
    find: BUILD,
    replace:
      '    return createDistributionForActivity({ ...SPARKLINE_ACTIVITY, ...estimate, ...(estimate.distributionType === "betaPert" ? { confidenceLevel: "mediumConfidence" as const } : {}) });',
    expectFailing: only(C10, C13, I1),
  },
  // -- The card -----------------------------------------------------------------------------------
  {
    id: "S4  the box kept at the call site, guarded only by the greyed Distribution  [expect 1: K1]",
    file: ROW,
    find: DISTRIBUTION_CARD,
    replace:
      '        {!distributionInert && <div className="absolute bottom-full"><DistributionSparkline activity={activity} scheduledActivity={scheduledActivity} /></div>}\n      </div>\n\n      {/* Confidence',
    expectFailing: only(K1),
  },
  {
    id: "S5  the card draws an empty box when it has no curve  [expect 2: K1, I2]",
    file: CARD,
    find: "  if (!curve) return null;",
    replace: '  if (!curve) return <div className="absolute bottom-full"><svg /></div>;',
    expectFailing: only(K1, I2),
  },
  {
    id: "S7  the card on every Confidence cell, Triangular and Uniform included  [expect 1: K2]",
    file: ROW,
    find: CONFIDENCE_CARD,
    replace: '{<DistributionSparkline activity={activity} scheduledActivity={scheduledActivity} anchor="right" />}',
    expectFailing: only(K2),
  },
  {
    id: "S8  no card on the Confidence cell  [expect 2: K2, M3]",
    file: ROW,
    find: CONFIDENCE_CARD,
    replace: '{false && <DistributionSparkline activity={activity} scheduledActivity={scheduledActivity} anchor="right" />}',
    expectFailing: only(K2, M3),
  },
  // -- The scheduled duration ----------------------------------------------------------------------
  {
    id: "S16 the marker at Most Likely  [expect 5: M1, M2, M3, M6, L2]",
    file: CARD,
    find: "sparklineX(curve, scheduledActivity.duration)",
    replace: "sparklineX(curve, activity.mostLikely)",
    expectFailing: only(M1, M2, M3, M6, L2),
  },
  {
    id: "S17 the marker at the mean  [expect 5: M1, M2, M3, M6, L2]",
    file: CARD,
    find: "sparklineX(curve, scheduledActivity.duration)",
    replace: "sparklineX(curve, (activity.min + 4 * activity.mostLikely + activity.max) / 6)",
    expectFailing: only(M1, M2, M3, M6, L2),
  },
  {
    id: "S18 the marker on in-progress and complete rows too  [expect 2: M4, L2]",
    file: CARD,
    find: 'activity.status === "planned" && scheduledActivity',
    replace: "scheduledActivity",
    expectFailing: only(M4, L2),
  },
  {
    id: "S19 the marker missing on the Confidence cell's card  [expect 1: M3]",
    file: ROW,
    find: CONFIDENCE_CARD,
    replace: '{confidenceIsRelevant && <DistributionSparkline activity={activity} anchor="right" />}',
    expectFailing: only(M3),
  },
  {
    id: "S20 the marker at the unrounded quantile, not the number the grid shows  [expect 3: M1, M2, L2]",
    file: ROW,
    find: DISTRIBUTION_CARD,
    replace:
      "        <DistributionSparkline activity={activity} scheduledActivity={scheduledActivity && { duration: createDistributionForActivity(activity).inverseCDF(activityProbabilityTarget) }} />\n      </div>\n\n      {/* Confidence",
    also: {
      find: 'import { DistributionSparkline } from "./DistributionSparkline";',
      // On the SAME line: a new line here would move UnifiedActivityRow.tsx:546, which the legibility-floor
      // test pins by number, and fail it for a reason that is not this straw's.
      replace:
        'import { DistributionSparkline } from "./DistributionSparkline"; import { createDistributionForActivity } from "@core/distributions/factory";',
    },
    expectFailing: only(M1, M2, L2),
  },
  // -- The two dashed lines' colours (owner ruling, 2026-10-10) -------------------------------------
  {
    id: "S21 the Most Likely line back at its former 0.6 opacity, under 3:1 in light mode  [expect 1: L1]",
    file: CARD,
    find: "          strokeDasharray={mostLikely.dashes}\n        />",
    replace: '          strokeDasharray={mostLikely.dashes}\n          opacity="0.6"\n        />',
    expectFailing: only(L1),
  },
  {
    id: "S22 the duration line one shade lighter, green-600, under 3:1 on the light fill  [expect 1: L1]",
    file: CARD,
    find: 'className="stroke-green-700 dark:stroke-green-400"',
    replace: 'className="stroke-green-600 dark:stroke-green-400"',
    expectFailing: only(L1),
  },
  // -- Six wrong builds that passed the whole suite, and the centred Confidence card ----------------------
  {
    id: "S23 the Confidence card gated on the distribution type alone, so it shows on a dash  [expect 1: K2]",
    file: ROW,
    find: CONFIDENCE_CARD,
    replace:
      '{confidenceApplies(activity.distributionType) && <DistributionSparkline activity={activity} scheduledActivity={scheduledActivity} anchor="right" />}',
    also: {
      // On the SAME line, for the reason S20 gives.
      find: 'import { confidenceInertReason, distributionIsInert, DISTRIBUTION_INERT_TITLE } from "@domain/helpers/confidence-applies";',
      replace:
        'import { confidenceApplies, confidenceInertReason, distributionIsInert, DISTRIBUTION_INERT_TITLE } from "@domain/helpers/confidence-applies";',
    },
    expectFailing: only(K2),
  },
  {
    id: "S24 the marker gated on a missing actual duration, not on the status  [expect 2: M4, L2]",
    file: CARD,
    find: 'activity.status === "planned" && scheduledActivity',
    replace: "activity.actualDuration == null && scheduledActivity",
    also: { find: 'Pick<Activity, "status">', replace: 'Pick<Activity, "status" | "actualDuration">' },
    expectFailing: only(M4, L2),
  },
  {
    id: "S25 a Most Likely line on Uniform, whose curve does not use it  [expect 1: C7]",
    file: CURVE,
    find: '    estimate.distributionType !== "uniform" &&\n',
    replace: "",
    expectFailing: only(C7),
  },
  {
    id: "S26 the Confidence cell not a hover group, so its card never shows  [expect 1: K2]",
    file: ROW,
    find: '      <div className="group relative">\n        <ConfidenceLevelSelect',
    replace: "      <div>\n        <ConfidenceLevelSelect",
    expectFailing: only(K2),
  },
  {
    id: "S27 the card never hidden, so every card shows above every row  [expect 1: K2]",
    file: CARD,
    find: "-translate-x-1/2 mb-1 hidden group-hover:block",
    replace: "-translate-x-1/2 mb-1 group-hover:block",
    also: { find: "right-0 mb-1 hidden group-hover:block", replace: "right-0 mb-1 group-hover:block" },
    expectFailing: only(K2),
  },
  {
    id: "S28 the fill closed without its feet, so the area under an open tail is left unfilled  [expect 1: C5]",
    file: CURVE,
    find: '    fill: `M ${[leftFoot, ...points, rightFoot].join(" L ")} Z`,',
    replace: '    fill: `M ${points.join(" L ")} Z`,',
    expectFailing: only(C5),
  },
  {
    id: "S29 the Confidence card centred on its narrow cell, its Max side clipped at the grid's edge  [expect 1: K2]",
    file: ROW,
    find: CONFIDENCE_CARD,
    replace: "{confidenceIsRelevant && <DistributionSparkline activity={activity} scheduledActivity={scheduledActivity} />}",
    expectFailing: only(K2),
  },
  {
    id: "S30 the green's dash offset dropped, so where the lines meet its dashes land on the blue's  [expect 2: L1, L2]",
    file: CARD,
    find: 'duration: { x, dashes: "2 2", offset: "2" } };',
    replace: 'duration: { x, dashes: "2 2" } };',
    expectFailing: only(L1, L2),
  },
  {
    id: "S31 the meet test removed: lines that meet keep their own dashes, and only the green shows  [expect 2: L1, L2]",
    file: CARD,
    find: "Math.abs(mostLikelyX - durationX) > MEET_PX) {",
    replace: "true) {",
    expectFailing: only(L1, L2),
  },
  {
    id: "S32 meeting widened from 1 px to 2  [expect 1: L2]",
    file: CARD,
    find: "const MEET_PX = 1;",
    replace: "const MEET_PX = 2;",
    expectFailing: only(L2),
  },
  {
    id: "S33 no midpoint: where the lines meet, each keeps its own x, a fraction of a pixel apart  [expect 1: L2]",
    file: CARD,
    find: '  const x = (mostLikelyX + durationX) / 2;\n  return { mostLikely: { x, dashes: "2 2" }, duration: { x, dashes: "2 2", offset: "2" } };',
    replace: '  return { mostLikely: { x: mostLikelyX, dashes: "2 2" }, duration: { x: durationX, dashes: "2 2", offset: "2" } };',
    expectFailing: only(L2),
  },
];
