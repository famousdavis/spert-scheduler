// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/**
 * WI-124: the Finish Target date moves from the project to each scenario (owner ruling, 2026-10-16), schema 24 → 25.
 *
 * ⚠️ These tests start from what version 0.77.2 itself SAVED — not from projects this version builds. The four
 * projects below are, byte for byte, what 0.77.2's own store and repository wrote to this browser's storage, made by
 * its own actions: scenarios added by duplicating one, the target set through its project-level setter, cleared and
 * set again, a scenario locked, a run in each; one is a v14 project that 0.77.2 itself migrated, which is how a stored
 * project comes to hold `null`. Its export file, the documents its cloud driver left and an older tab's save are built
 * from them below, each equal key for key to what 0.77.2 wrote (its own load re-orders the keys; nothing else
 * differs). A fix that reads stored state differently must meet the state the previous version stored.
 *
 * Each load path is driven: this browser's storage, Import Projects, and the cloud driver's loadAll, load and
 * subscription, against a fake Firestore that applies `setDoc`'s mergeFields as Firestore does, but none of its rules.
 */

const cloud = vi.hoisted(() => ({
  docs: new Map<string, Record<string, unknown>>(),
  sent: [] as Array<{ id: string; data: Record<string, unknown>; mergeFields: string[] | null }>,
  clone: <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T,
}));

vi.mock("@infrastructure/firebase/firebase", () => ({
  db: { fake: true },
  auth: null,
  isFirebaseAvailable: true,
  getSendInvitationEmail: () => null,
  getClaimPendingInvitations: () => null,
  getRevokeInvite: () => null,
  getResendInvite: () => null,
}));

vi.mock("firebase/firestore", () => ({
  doc: (_db: unknown, _collection: string, id: string) => ({ id }),
  collection: () => ({}),
  query: () => ({}),
  where: () => ({}),
  getDocs: async () => ({
    docs: [...cloud.docs].map(([id, data]) => ({ id, data: () => cloud.clone(data) })),
  }),
  getDoc: async (ref: { id: string }) => ({
    id: ref.id,
    exists: () => cloud.docs.has(ref.id),
    data: () => cloud.clone(cloud.docs.get(ref.id)),
  }),
  // Firestore's merge, none of its rules: in production loadAll's upgrade save of these documents is refused (WI-128).
  setDoc: async (ref: { id: string }, data: Record<string, unknown>, options?: { mergeFields?: string[] }) => {
    const sent = cloud.clone(data);
    cloud.sent.push({ id: ref.id, data: sent, mergeFields: options?.mergeFields ?? null });
    if (!options?.mergeFields) {
      cloud.docs.set(ref.id, sent);
      return;
    }
    const stored = { ...cloud.docs.get(ref.id) };
    for (const field of options.mergeFields) stored[field] = sent[field];
    cloud.docs.set(ref.id, stored);
  },
  onSnapshot: (ref: { id: string }, next: (snapshot: unknown) => void) => {
    next({
      id: ref.id,
      exists: () => cloud.docs.has(ref.id),
      data: () => cloud.clone(cloud.docs.get(ref.id)),
      metadata: { hasPendingWrites: false },
    });
    return () => {};
  },
  deleteDoc: vi.fn(),
  deleteField: vi.fn(),
  runTransaction: vi.fn(),
  serverTimestamp: vi.fn(),
  updateDoc: vi.fn(),
}));

import { setDoc } from "firebase/firestore";
import { applyMigrations } from "@infrastructure/persistence/migrations";
import { LocalStorageRepository } from "@infrastructure/persistence/local-storage-repository";
import { FirestoreDriver } from "@infrastructure/firebase/firestore-driver";
import { validateImport } from "@app/api/export-import-service";
import { useProjectStore } from "@ui/hooks/use-project-store";
import { SCHEMA_VERSION } from "@domain/models/types";
import type { Project } from "@domain/models/types";

/** A project as stored: JSON, read without this version's types. */
interface StoredProject {
  id: string;
  name: string;
  scenarios: Array<Record<string, unknown>>;
  [key: string]: unknown;
}

/** The target date 0.77.2 held for Alpha, shared by its three scenarios. */
const ALPHA_DATE = "2026-12-18";
/** A scenario with no date: the key is absent, as on every new scenario. */
const ABSENT = "(no key)";
const OWNER_UID = "uid-wi124-owner";
/** When 0.77.2's driver sent its documents. */
const SENT_AT = "2026-10-18T03:21:02.840Z";

/**
 * Three scenarios, made by duplicating the first; the third locked. The target set to 2026-12-18 through the
 * project-level setter, cleared (which turned "show on Gantt" off), set again and shown again. A run in each scenario.
 */
const SAVED_ALPHA: StoredProject = {
  id: "501f00a9-db80-40bc-a1a7-a7e6ce08e684",
  name: "WI124 Fixture Alpha",
  createdAt: "2026-10-18T03:21:02.819Z",
  schemaVersion: 24,
  owner: null,
  scenarios: [
    {
      id: "3c50c390-5524-40ad-93b1-64daced62a80",
      name: "Baseline",
      startDate: "2026-11-02",
      activities: [
        {
          id: "f13b3a6f-9e27-49ad-9965-e24df5c04087",
          name: "Alpha survey",
          min: 3,
          mostLikely: 5,
          max: 10,
          confidenceLevel: "mediumConfidence",
          distributionType: "triangular",
          status: "planned",
        },
        {
          id: "668551f2-b9f6-4b4a-aca2-eaa1e0346443",
          name: "Alpha build",
          min: 4,
          mostLikely: 6,
          max: 12,
          confidenceLevel: "mediumConfidence",
          distributionType: "triangular",
          status: "planned",
        },
        {
          id: "e4275c31-c06b-49ce-aff1-282482ae06c4",
          name: "Alpha test",
          min: 2,
          mostLikely: 4,
          max: 8,
          confidenceLevel: "mediumConfidence",
          distributionType: "triangular",
          status: "planned",
        },
      ],
      dependencies: [],
      milestones: [],
      settings: {
        defaultConfidenceLevel: "mediumConfidence",
        defaultDistributionType: "triangular",
        trialCount: 10000,
        rngSeed: "eda1d092-53ef-4325-8f66-c5944ba570d6",
        probabilityTarget: 0.5,
        projectProbabilityTarget: 0.95,
        heuristicEnabled: false,
        heuristicMinPercent: 75,
        heuristicMaxPercent: 200,
        dependencyMode: false,
        parkinsonsLawEnabled: true,
      },
      simulationResults: {
        id: "6ae06ffb-9e38-4702-9054-cbba288fe92e",
        timestamp: "2026-10-18T03:21:02.823Z",
        trialCount: 10000,
        seed: "eda1d092-53ef-4325-8f66-c5944ba570d6",
        engineVersion: "1.1.1",
        percentiles: {
          5: 19,
          10: 19,
          25: 19.091642804078784,
          50: 20.087242252714606,
          55: 20.330960610130006,
          60: 20.555070737639998,
          65: 20.788430567828545,
          70: 21.041500560280625,
          75: 21.319386961816072,
          80: 21.60228062425977,
          85: 21.9631939881308,
          90: 22.385710782537835,
          95: 23.09195567674699,
          96: 23.353209398752913,
          97: 23.638928231335154,
          98: 23.984880071899333,
          99: 24.532552391038084,
        },
        histogramBins: [
          { binStart: 19, binEnd: 19.138309881064338, count: 2604 },
          { binStart: 19.138309881064338, binEnd: 19.276619762128675, count: 346 },
          { binStart: 19.276619762128675, binEnd: 19.414929643193013, count: 351 },
          { binStart: 19.414929643193013, binEnd: 19.55323952425735, count: 357 },
          { binStart: 19.55323952425735, binEnd: 19.691549405321688, count: 359 },
          { binStart: 19.691549405321688, binEnd: 19.829859286386025, count: 344 },
          { binStart: 19.829859286386025, binEnd: 19.968169167450363, count: 346 },
          { binStart: 19.968169167450363, binEnd: 20.1064790485147, count: 331 },
          { binStart: 20.1064790485147, binEnd: 20.244788929579038, count: 272 },
          { binStart: 20.244788929579038, binEnd: 20.383098810643375, count: 278 },
          { binStart: 20.383098810643375, binEnd: 20.521408691707713, count: 327 },
          { binStart: 20.521408691707713, binEnd: 20.65971857277205, count: 316 },
          { binStart: 20.65971857277205, binEnd: 20.798028453836388, count: 292 },
          { binStart: 20.798028453836388, binEnd: 20.936338334900725, count: 263 },
          { binStart: 20.936338334900725, binEnd: 21.074648215965063, count: 267 },
          { binStart: 21.074648215965063, binEnd: 21.2129580970294, count: 253 },
          { binStart: 21.2129580970294, binEnd: 21.351267978093738, count: 252 },
          { binStart: 21.351267978093738, binEnd: 21.489577859158075, count: 238 },
          { binStart: 21.489577859158075, binEnd: 21.627887740222413, count: 241 },
          { binStart: 21.627887740222413, binEnd: 21.76619762128675, count: 207 },
          { binStart: 21.76619762128675, binEnd: 21.904507502351088, count: 192 },
          { binStart: 21.904507502351088, binEnd: 22.042817383415425, count: 169 },
          { binStart: 22.042817383415425, binEnd: 22.181127264479763, count: 167 },
          { binStart: 22.181127264479763, binEnd: 22.3194371455441, count: 169 },
          { binStart: 22.3194371455441, binEnd: 22.457747026608434, count: 128 },
          { binStart: 22.457747026608434, binEnd: 22.59605690767277, count: 115 },
          { binStart: 22.59605690767277, binEnd: 22.73436678873711, count: 123 },
          { binStart: 22.73436678873711, binEnd: 22.872676669801447, count: 80 },
          { binStart: 22.872676669801447, binEnd: 23.010986550865784, count: 70 },
          { binStart: 23.010986550865784, binEnd: 23.14929643193012, count: 58 },
          { binStart: 23.14929643193012, binEnd: 23.28760631299446, count: 64 },
          { binStart: 23.28760631299446, binEnd: 23.425916194058797, count: 51 },
          { binStart: 23.425916194058797, binEnd: 23.564226075123134, count: 47 },
          { binStart: 23.564226075123134, binEnd: 23.70253595618747, count: 43 },
          { binStart: 23.70253595618747, binEnd: 23.84084583725181, count: 35 },
          { binStart: 23.84084583725181, binEnd: 23.979155718316147, count: 43 },
          { binStart: 23.979155718316147, binEnd: 24.117465599380484, count: 29 },
          { binStart: 24.117465599380484, binEnd: 24.25577548044482, count: 27 },
          { binStart: 24.25577548044482, binEnd: 24.39408536150916, count: 24 },
          { binStart: 24.39408536150916, binEnd: 24.532395242573497, count: 22 },
        ],
        mean: 20.425729004361877,
        standardDeviation: 1.4071328891624895,
        minSample: 19,
        maxSample: 27.453318587141492,
        samples: [],
      },
      bands: [],
    },
    {
      id: "71f186e0-4fdc-472f-930b-56ccea4d77b2",
      name: "Fixture Downside",
      startDate: "2026-11-02",
      activities: [
        {
          id: "287d9ec3-8cb5-4fb6-b8f9-5504d1b8da55",
          name: "Alpha survey",
          min: 10,
          mostLikely: 20,
          max: 40,
          confidenceLevel: "mediumConfidence",
          distributionType: "triangular",
          status: "planned",
        },
        {
          id: "0446088b-745d-4dc9-8116-ac6c0f0d6cb0",
          name: "Alpha build",
          min: 12,
          mostLikely: 24,
          max: 48,
          confidenceLevel: "mediumConfidence",
          distributionType: "triangular",
          status: "planned",
        },
        {
          id: "c1d88bb6-93e6-4c8e-8d5c-20445f99a2f9",
          name: "Alpha test",
          min: 8,
          mostLikely: 16,
          max: 32,
          confidenceLevel: "mediumConfidence",
          distributionType: "triangular",
          status: "planned",
        },
      ],
      dependencies: [],
      milestones: [],
      settings: {
        defaultConfidenceLevel: "mediumConfidence",
        defaultDistributionType: "triangular",
        trialCount: 10000,
        rngSeed: "eda1d092-53ef-4325-8f66-c5944ba570d6",
        probabilityTarget: 0.5,
        projectProbabilityTarget: 0.95,
        heuristicEnabled: false,
        heuristicMinPercent: 75,
        heuristicMaxPercent: 200,
        dependencyMode: false,
        parkinsonsLawEnabled: true,
      },
      bands: [],
      simulationResults: {
        id: "e61d20e9-0499-4f11-9ba6-9d079f4b6bbc",
        timestamp: "2026-10-18T03:21:02.827Z",
        trialCount: 10000,
        seed: "eda1d092-53ef-4325-8f66-c5944ba570d6",
        engineVersion: "1.1.1",
        percentiles: {
          5: 70,
          10: 70,
          25: 71.83872851627132,
          50: 76.50574838177108,
          55: 77.4240814416398,
          60: 78.48086384055628,
          65: 79.63694246701033,
          70: 80.77011625984629,
          75: 82.05909862470679,
          80: 83.45526599157205,
          85: 85.02891474814523,
          90: 87.07888228164687,
          95: 90.35321347300216,
          96: 91.57512528492597,
          97: 92.81868176829661,
          98: 94.42185478830407,
          99: 97.18000907176356,
        },
        histogramBins: [
          { binStart: 70, binEnd: 70.67949885466523, count: 1910 },
          { binStart: 70.67949885466523, binEnd: 71.35899770933045, count: 343 },
          { binStart: 71.35899770933045, binEnd: 72.03849656399568, count: 359 },
          { binStart: 72.03849656399568, binEnd: 72.71799541866089, count: 350 },
          { binStart: 72.71799541866089, binEnd: 73.39749427332612, count: 388 },
          { binStart: 73.39749427332612, binEnd: 74.07699312799134, count: 375 },
          { binStart: 74.07699312799134, binEnd: 74.75649198265657, count: 352 },
          { binStart: 74.75649198265657, binEnd: 75.4359908373218, count: 380 },
          { binStart: 75.4359908373218, binEnd: 76.11548969198702, count: 345 },
          { binStart: 76.11548969198702, binEnd: 76.79498854665223, count: 351 },
          { binStart: 76.79498854665223, binEnd: 77.47448740131746, count: 381 },
          { binStart: 77.47448740131746, binEnd: 78.15398625598269, count: 310 },
          { binStart: 78.15398625598269, binEnd: 78.83348511064791, count: 302 },
          { binStart: 78.83348511064791, binEnd: 79.51298396531314, count: 285 },
          { binStart: 79.51298396531314, binEnd: 80.19248281997837, count: 298 },
          { binStart: 80.19248281997837, binEnd: 80.87198167464359, count: 311 },
          { binStart: 80.87198167464359, binEnd: 81.5514805293088, count: 251 },
          { binStart: 81.5514805293088, binEnd: 82.23097938397403, count: 283 },
          { binStart: 82.23097938397403, binEnd: 82.91047823863926, count: 239 },
          { binStart: 82.91047823863926, binEnd: 83.58997709330448, count: 222 },
          { binStart: 83.58997709330448, binEnd: 84.26947594796971, count: 219 },
          { binStart: 84.26947594796971, binEnd: 84.94897480263494, count: 223 },
          { binStart: 84.94897480263494, binEnd: 85.62847365730016, count: 187 },
          { binStart: 85.62847365730016, binEnd: 86.30797251196537, count: 160 },
          { binStart: 86.30797251196537, binEnd: 86.9874713666306, count: 150 },
          { binStart: 86.9874713666306, binEnd: 87.66697022129583, count: 138 },
          { binStart: 87.66697022129583, binEnd: 88.34646907596105, count: 104 },
          { binStart: 88.34646907596105, binEnd: 89.02596793062628, count: 125 },
          { binStart: 89.02596793062628, binEnd: 89.7054667852915, count: 83 },
          { binStart: 89.7054667852915, binEnd: 90.38496563995673, count: 78 },
          { binStart: 90.38496563995673, binEnd: 91.06446449462194, count: 52 },
          { binStart: 91.06446449462194, binEnd: 91.74396334928717, count: 55 },
          { binStart: 91.74396334928717, binEnd: 92.4234622039524, count: 62 },
          { binStart: 92.4234622039524, binEnd: 93.10296105861762, count: 45 },
          { binStart: 93.10296105861762, binEnd: 93.78245991328285, count: 45 },
          { binStart: 93.78245991328285, binEnd: 94.46195876794808, count: 40 },
          { binStart: 94.46195876794808, binEnd: 95.1414576226133, count: 30 },
          { binStart: 95.1414576226133, binEnd: 95.82095647727851, count: 29 },
          { binStart: 95.82095647727851, binEnd: 96.50045533194374, count: 18 },
          { binStart: 96.50045533194374, binEnd: 97.17995418660897, count: 22 },
        ],
        mean: 77.7103383563549,
        standardDeviation: 6.789203278964818,
        minSample: 70,
        maxSample: 109.50952969414557,
        samples: [],
      },
    },
    {
      id: "497d068b-24bf-4c84-8d83-035a561ee39b",
      name: "Fixture Locked",
      startDate: "2026-11-02",
      activities: [
        {
          id: "01f46c0d-194d-4a74-8ff8-f8b7ff7d0bea",
          name: "Alpha survey",
          min: 4,
          mostLikely: 6,
          max: 22,
          confidenceLevel: "mediumConfidence",
          distributionType: "triangular",
          status: "planned",
        },
        {
          id: "fb67a4fb-9c3f-4a3c-84bc-d2b60ba89017",
          name: "Alpha build",
          min: 4,
          mostLikely: 6,
          max: 22,
          confidenceLevel: "mediumConfidence",
          distributionType: "triangular",
          status: "planned",
        },
        {
          id: "06c7991e-5214-4a49-9d85-0acd409592b6",
          name: "Alpha test",
          min: 3,
          mostLikely: 5,
          max: 20,
          confidenceLevel: "mediumConfidence",
          distributionType: "triangular",
          status: "planned",
        },
      ],
      dependencies: [],
      milestones: [],
      settings: {
        defaultConfidenceLevel: "mediumConfidence",
        defaultDistributionType: "triangular",
        trialCount: 10000,
        rngSeed: "eda1d092-53ef-4325-8f66-c5944ba570d6",
        probabilityTarget: 0.5,
        projectProbabilityTarget: 0.95,
        heuristicEnabled: false,
        heuristicMinPercent: 75,
        heuristicMaxPercent: 200,
        dependencyMode: false,
        parkinsonsLawEnabled: true,
      },
      bands: [],
      simulationResults: {
        id: "73a7ec77-12b7-4d35-b786-ab9505f7acc6",
        timestamp: "2026-10-18T03:21:02.829Z",
        trialCount: 10000,
        seed: "eda1d092-53ef-4325-8f66-c5944ba570d6",
        engineVersion: "1.1.1",
        percentiles: {
          5: 29,
          10: 29,
          25: 30.720667722261986,
          50: 33.964835512382614,
          55: 34.69771169034073,
          60: 35.42334911236783,
          65: 36.15080001508674,
          70: 36.957256940695395,
          75: 37.806778075453515,
          80: 38.69841022227011,
          85: 39.83410807145664,
          90: 41.2448026661053,
          95: 43.57964318771084,
          96: 44.241977395764565,
          97: 45.308714457361575,
          98: 46.394187821836255,
          99: 48.081081753620886,
        },
        histogramBins: [
          { binStart: 29, binEnd: 29.477021345382386, count: 1630 },
          { binStart: 29.477021345382386, binEnd: 29.95404269076477, count: 339 },
          { binStart: 29.95404269076477, binEnd: 30.431064036147156, count: 340 },
          { binStart: 30.431064036147156, binEnd: 30.90808538152954, count: 349 },
          { binStart: 30.90808538152954, binEnd: 31.385106726911925, count: 341 },
          { binStart: 31.385106726911925, binEnd: 31.86212807229431, count: 376 },
          { binStart: 31.86212807229431, binEnd: 32.339149417676694, count: 359 },
          { binStart: 32.339149417676694, binEnd: 32.81617076305908, count: 375 },
          { binStart: 32.81617076305908, binEnd: 33.29319210844147, count: 361 },
          { binStart: 33.29319210844147, binEnd: 33.77021345382385, count: 401 },
          { binStart: 33.77021345382385, binEnd: 34.24723479920623, count: 318 },
          { binStart: 34.24723479920623, binEnd: 34.72425614458862, count: 326 },
          { binStart: 34.72425614458862, binEnd: 35.201277489971005, count: 332 },
          { binStart: 35.201277489971005, binEnd: 35.67829883535339, count: 342 },
          { binStart: 35.67829883535339, binEnd: 36.15532018073577, count: 315 },
          { binStart: 36.15532018073577, binEnd: 36.63234152611816, count: 278 },
          { binStart: 36.63234152611816, binEnd: 37.109362871500544, count: 310 },
          { binStart: 37.109362871500544, binEnd: 37.58638421688293, count: 280 },
          { binStart: 37.58638421688293, binEnd: 38.06340556226532, count: 279 },
          { binStart: 38.06340556226532, binEnd: 38.5404269076477, count: 264 },
          { binStart: 38.5404269076477, binEnd: 39.01744825303008, count: 215 },
          { binStart: 39.01744825303008, binEnd: 39.494469598412465, count: 224 },
          { binStart: 39.494469598412465, binEnd: 39.971490943794855, count: 203 },
          { binStart: 39.971490943794855, binEnd: 40.44851228917724, count: 200 },
          { binStart: 40.44851228917724, binEnd: 40.92553363455963, count: 162 },
          { binStart: 40.92553363455963, binEnd: 41.40255497994201, count: 131 },
          { binStart: 41.40255497994201, binEnd: 41.87957632532439, count: 117 },
          { binStart: 41.87957632532439, binEnd: 42.356597670706776, count: 122 },
          { binStart: 42.356597670706776, binEnd: 42.83361901608916, count: 83 },
          { binStart: 42.83361901608916, binEnd: 43.31064036147155, count: 76 },
          { binStart: 43.31064036147155, binEnd: 43.78766170685393, count: 79 },
          { binStart: 43.78766170685393, binEnd: 44.26468305223632, count: 76 },
          { binStart: 44.26468305223632, binEnd: 44.741704397618705, count: 45 },
          { binStart: 44.741704397618705, binEnd: 45.21872574300109, count: 37 },
          { binStart: 45.21872574300109, binEnd: 45.69574708838347, count: 56 },
          { binStart: 45.69574708838347, binEnd: 46.17276843376585, count: 40 },
          { binStart: 46.17276843376585, binEnd: 46.64978977914824, count: 36 },
          { binStart: 46.64978977914824, binEnd: 47.12681112453063, count: 34 },
          { binStart: 47.12681112453063, binEnd: 47.603832469913016, count: 30 },
          { binStart: 47.603832469913016, binEnd: 48.0808538152954, count: 19 },
        ],
        mean: 34.730955814944544,
        standardDeviation: 4.770899882699736,
        minSample: 29,
        maxSample: 56.58198137521667,
        samples: [],
      },
      locked: true,
    },
  ],
  targetFinishDate: "2026-12-18",
  showTargetOnGantt: true,
};

/**
 * No target ever set: no key at all. A run in its one scenario.
 */
const SAVED_BRAVO: StoredProject = {
  id: "bcc1c247-6b9b-4fd2-9a15-cf2704e79459",
  name: "WI124 Fixture Bravo",
  createdAt: "2026-10-18T03:21:02.830Z",
  schemaVersion: 24,
  owner: null,
  scenarios: [
    {
      id: "b19229fd-904a-4140-a80e-882bf71177dc",
      name: "Baseline",
      startDate: "2026-11-02",
      activities: [
        {
          id: "904931b8-99e0-4091-bcc9-b8e0b5a6e71f",
          name: "Bravo survey",
          min: 3,
          mostLikely: 5,
          max: 10,
          confidenceLevel: "mediumConfidence",
          distributionType: "triangular",
          status: "planned",
        },
      ],
      dependencies: [],
      milestones: [],
      settings: {
        defaultConfidenceLevel: "mediumConfidence",
        defaultDistributionType: "triangular",
        trialCount: 10000,
        rngSeed: "526e2d17-2869-4e00-a621-36260050797f",
        probabilityTarget: 0.5,
        projectProbabilityTarget: 0.95,
        heuristicEnabled: false,
        heuristicMinPercent: 75,
        heuristicMaxPercent: 200,
        dependencyMode: false,
        parkinsonsLawEnabled: true,
      },
      simulationResults: {
        id: "298173c0-a11f-4322-b3ef-06677e3fcff9",
        timestamp: "2026-10-18T03:21:02.831Z",
        trialCount: 10000,
        seed: "526e2d17-2869-4e00-a621-36260050797f",
        engineVersion: "1.1.1",
        percentiles: {
          5: 6,
          10: 6,
          25: 6,
          50: 6,
          55: 6.004521523397108,
          60: 6.23738857338129,
          65: 6.482015174869922,
          70: 6.7403430092680034,
          75: 7.0283238589989745,
          80: 7.347964729822397,
          85: 7.686195471947366,
          90: 8.100364978225922,
          95: 8.680961756953721,
          96: 8.809784797974432,
          97: 8.987532229781603,
          98: 9.191372765271153,
          99: 9.430353723112352,
        },
        histogramBins: [
          { binStart: 6, binEnd: 6.085758803539578, count: 5675 },
          { binStart: 6.085758803539578, binEnd: 6.1715176070791555, count: 186 },
          { binStart: 6.1715176070791555, binEnd: 6.257276410618734, count: 187 },
          { binStart: 6.257276410618734, binEnd: 6.343035214158311, count: 161 },
          { binStart: 6.343035214158311, binEnd: 6.428794017697889, count: 184 },
          { binStart: 6.428794017697889, binEnd: 6.5145528212374675, count: 180 },
          { binStart: 6.5145528212374675, binEnd: 6.600311624777045, count: 171 },
          { binStart: 6.600311624777045, binEnd: 6.686070428316623, count: 160 },
          { binStart: 6.686070428316623, binEnd: 6.7718292318562, count: 156 },
          { binStart: 6.7718292318562, binEnd: 6.8575880353957785, count: 151 },
          { binStart: 6.8575880353957785, binEnd: 6.943346838935357, count: 150 },
          { binStart: 6.943346838935357, binEnd: 7.029105642474934, count: 141 },
          { binStart: 7.029105642474934, binEnd: 7.114864446014512, count: 142 },
          { binStart: 7.114864446014512, binEnd: 7.20062324955409, count: 125 },
          { binStart: 7.20062324955409, binEnd: 7.286382053093668, count: 126 },
          { binStart: 7.286382053093668, binEnd: 7.372140856633246, count: 147 },
          { binStart: 7.372140856633246, binEnd: 7.457899660172823, count: 136 },
          { binStart: 7.457899660172823, binEnd: 7.543658463712402, count: 126 },
          { binStart: 7.543658463712402, binEnd: 7.629417267251979, count: 128 },
          { binStart: 7.629417267251979, binEnd: 7.715176070791557, count: 101 },
          { binStart: 7.715176070791557, binEnd: 7.800934874331135, count: 113 },
          { binStart: 7.800934874331135, binEnd: 7.886693677870713, count: 104 },
          { binStart: 7.886693677870713, binEnd: 7.972452481410291, count: 106 },
          { binStart: 7.972452481410291, binEnd: 8.058211284949868, count: 99 },
          { binStart: 8.058211284949868, binEnd: 8.143970088489446, count: 108 },
          { binStart: 8.143970088489446, binEnd: 8.229728892029025, count: 87 },
          { binStart: 8.229728892029025, binEnd: 8.315487695568603, count: 71 },
          { binStart: 8.315487695568603, binEnd: 8.40124649910818, count: 79 },
          { binStart: 8.40124649910818, binEnd: 8.487005302647757, count: 55 },
          { binStart: 8.487005302647757, binEnd: 8.572764106187336, count: 57 },
          { binStart: 8.572764106187336, binEnd: 8.658522909726914, count: 72 },
          { binStart: 8.658522909726914, binEnd: 8.744281713266492, count: 59 },
          { binStart: 8.744281713266492, binEnd: 8.830040516806068, count: 73 },
          { binStart: 8.830040516806068, binEnd: 8.915799320345647, count: 42 },
          { binStart: 8.915799320345647, binEnd: 9.001558123885225, count: 47 },
          { binStart: 9.001558123885225, binEnd: 9.087316927424803, count: 49 },
          { binStart: 9.087316927424803, binEnd: 9.173075730964381, count: 35 },
          { binStart: 9.173075730964381, binEnd: 9.258834534503958, count: 40 },
          { binStart: 9.258834534503958, binEnd: 9.344593338043536, count: 33 },
          { binStart: 9.344593338043536, binEnd: 9.430352141583114, count: 38 },
        ],
        mean: 6.60217485072776,
        standardDeviation: 0.9179428887992551,
        minSample: 6,
        maxSample: 9.946984139039891,
        samples: [],
      },
      bands: [],
    },
  ],
};

/**
 * V14_CHARLIE below, migrated by 0.77.2 on load and saved at a rename: `targetFinishDate: null`, the v14 → v15
 * default.
 */
const SAVED_CHARLIE: StoredProject = {
  id: "wi124-charlie-v14",
  name: "WI124 Fixture Charlie (renamed)",
  createdAt: "2025-03-03T15:00:00.000Z",
  schemaVersion: 24,
  owner: null,
  forcedWorkDays: [],
  targetFinishDate: null,
  showTargetOnGantt: false,
  scenarios: [
    {
      id: "charlie-s1",
      name: "Baseline",
      startDate: "2026-11-02",
      activities: [
        {
          id: "charlie-a1",
          name: "Charlie survey",
          min: 3,
          mostLikely: 5,
          max: 10,
          confidenceLevel: "mediumConfidence",
          distributionType: "triangular",
          status: "planned",
        },
      ],
      dependencies: [],
      milestones: [],
      settings: {
        defaultConfidenceLevel: "mediumConfidence",
        defaultDistributionType: "normal",
        trialCount: 10000,
        rngSeed: "charlie-seed",
        probabilityTarget: 0.5,
        projectProbabilityTarget: 0.95,
        heuristicEnabled: false,
        heuristicMinPercent: 50,
        heuristicMaxPercent: 200,
        dependencyMode: false,
        parkinsonsLawEnabled: true,
      },
      bands: [],
    },
  ],
  archived: false,
};

/**
 * A target set, shown, then cleared: `null`, and "show on Gantt" off.
 */
const SAVED_DELTA: StoredProject = {
  id: "6564a8d0-e8bd-48ac-942d-770bac8a15fe",
  name: "WI124 Fixture Delta",
  createdAt: "2026-10-18T03:21:02.834Z",
  schemaVersion: 24,
  owner: null,
  scenarios: [
    {
      id: "9748b86e-9eff-4eea-bc06-e41c6063af5c",
      name: "Baseline",
      startDate: "2026-11-02",
      activities: [
        {
          id: "ec8954b5-998d-4200-91f9-79b23a205daa",
          name: "Delta survey",
          min: 3,
          mostLikely: 5,
          max: 10,
          confidenceLevel: "mediumConfidence",
          distributionType: "triangular",
          status: "planned",
        },
      ],
      dependencies: [],
      milestones: [],
      settings: {
        defaultConfidenceLevel: "mediumConfidence",
        defaultDistributionType: "triangular",
        trialCount: 10000,
        rngSeed: "4d772314-86d2-40fa-ba87-7a19ded60b24",
        probabilityTarget: 0.5,
        projectProbabilityTarget: 0.95,
        heuristicEnabled: false,
        heuristicMinPercent: 75,
        heuristicMaxPercent: 200,
        dependencyMode: false,
        parkinsonsLawEnabled: true,
      },
      bands: [],
    },
  ],
  targetFinishDate: null,
  showTargetOnGantt: false,
};

/** What a v14 build stored — written by hand, as no v14 build is at hand; 0.77.2 migrated exactly this into CHARLIE. */
const V14_CHARLIE: StoredProject = {
  id: "wi124-charlie-v14",
  name: "WI124 Fixture Charlie",
  createdAt: "2025-03-03T15:00:00.000Z",
  schemaVersion: 14,
  archived: false,
  scenarios: [
    {
      id: "charlie-s1",
      name: "Baseline",
      startDate: "2026-11-02",
      activities: [
        {
          id: "charlie-a1",
          name: "Charlie survey",
          min: 3,
          mostLikely: 5,
          max: 10,
          confidenceLevel: "mediumConfidence",
          distributionType: "triangular",
          status: "planned",
        },
      ],
      dependencies: [],
      milestones: [],
      settings: {
        defaultConfidenceLevel: "mediumConfidence",
        defaultDistributionType: "normal",
        trialCount: 10000,
        rngSeed: "charlie-seed",
        probabilityTarget: 0.5,
        projectProbabilityTarget: 0.95,
        heuristicEnabled: false,
        heuristicMinPercent: 50,
        heuristicMaxPercent: 200,
        dependencyMode: false,
        parkinsonsLawEnabled: true,
      },
    },
  ],
};

const SAVED = [SAVED_ALPHA, SAVED_BRAVO, SAVED_CHARLIE, SAVED_DELTA];

/** A stored project without its runs — what an export file and a cloud document carry. */
function withoutRuns(project: StoredProject): StoredProject {
  return {
    ...project,
    scenarios: project.scenarios.map(({ simulationResults: _runs, ...scenario }) => scenario),
  };
}

/** The export file 0.77.2 wrote from the Dashboard's Export, with these four projects. */
const EXPORT_FILE = {
  format: "spert-scheduler-export",
  appVersion: "0.77.2",
  exportedAt: SENT_AT,
  schemaVersion: 24,
  projects: SAVED.map(withoutRuns),
};

/** A project's fields as its cloud document holds them: no runs, and no id (the document's name). */
function cloudFieldsOf(project: StoredProject): Record<string, unknown> {
  const fields: Record<string, unknown> = { ...withoutRuns(project) };
  delete fields.id;
  return fields;
}

/** The document 0.77.2's driver left in cloud storage for a project: its create(), then a save's mergeFields. */
function cloudDocOf(project: StoredProject): Record<string, unknown> {
  return { ...cloudFieldsOf(project), owner: OWNER_UID, members: { [OWNER_UID]: "owner" }, updatedAt: SENT_AT };
}

/** A tab still running 0.77.2, holding Alpha as it loaded, saves one change: a scenario note. */
const OLDER_TAB_NOTE = "edited in a tab still running 0.77.2";
const OLDER_TAB_ALPHA: StoredProject = {
  ...SAVED_ALPHA,
  scenarios: SAVED_ALPHA.scenarios.map((s, i) => (i === 0 ? { ...s, notes: OLDER_TAB_NOTE } : s)),
};
/** The fields that tab's driver sends with that save, as mergeFields. */
const OLDER_TAB_FIELDS = ["name", "createdAt", "schemaVersion", "targetFinishDate", "showTargetOnGantt", "scenarios", "updatedAt"];

/**
 * Each scenario's date — a date, or null — or ABSENT where it holds none. An in-memory key holding `undefined` (a copy
 * of a scenario with none) counts as absent: neither JSON nor Firestore keeps it.
 */
function datesOf(project: { scenarios: readonly object[] }): unknown[] {
  return project.scenarios.map((s) => {
    const date = (s as Record<string, unknown>).targetFinishDate;
    return date === undefined ? ABSENT : date;
  });
}

function storeLocally(projects: StoredProject[]): void {
  localStorage.setItem("spert:project-index:local", JSON.stringify(projects.map((p) => p.id)));
  for (const p of projects) localStorage.setItem(`spert:project:local:${p.id}`, JSON.stringify(p));
}

function storedLocally(id: string): StoredProject {
  return JSON.parse(localStorage.getItem(`spert:project:local:${id}`)!) as StoredProject;
}

function inStore(id: string): Project {
  return useProjectStore.getState().projects.find((p) => p.id === id)!;
}

/** The store's setter for one scenario's date, which 0.77.2 did not have. */
function setTargetIn(projectId: string, scenarioId: string, date: string | null): void {
  const setter = useProjectStore.getState().updateScenarioTargetFinishDate;
  expect(setter, "the store sets one scenario's Finish Target date").toBeTypeOf("function");
  setter(projectId, scenarioId, date);
}

function upgrade(project: StoredProject, from: number): StoredProject {
  return applyMigrations(cloud.clone(project), from, SCHEMA_VERSION) as StoredProject;
}

beforeEach(() => {
  localStorage.clear();
  cloud.docs.clear();
  cloud.sent.length = 0;
  useProjectStore.setState({ projects: [], loadError: false, loadErrors: [], undoStack: [], redoStack: [] });
});

afterEach(() => {
  vi.useRealTimers();
});

describe("the v24 → v25 step, on the projects 0.77.2 saved", () => {
  it("gives every scenario the project's date — the locked one included — and removes the project's own", () => {
    const upgraded = upgrade(SAVED_ALPHA, 24);
    expect(datesOf(upgraded)).toEqual([ALPHA_DATE, ALPHA_DATE, ALPHA_DATE]);
    expect("targetFinishDate" in upgraded).toBe(false);
    expect(upgraded.schemaVersion).toBe(25);
    expect(upgraded.scenarios.map((s) => s.locked ?? false)).toEqual([false, false, true]);
    expect(upgraded.showTargetOnGantt).toBe(true);
  });

  it("gives a project with no date none: null from the v14 → v15 step, null from a clear, or no key at all", () => {
    for (const saved of [SAVED_CHARLIE, SAVED_DELTA, SAVED_BRAVO]) {
      const upgraded = upgrade(saved, 24);
      expect(datesOf(upgraded), saved.name).toEqual([ABSENT]);
      expect("targetFinishDate" in upgraded, saved.name).toBe(false);
      expect(upgraded.schemaVersion, saved.name).toBe(25);
    }
  });

  it("control: never today's date, whatever today is", () => {
    vi.useFakeTimers({ now: new Date("2026-11-20T12:00:00"), toFake: ["Date"] });
    expect(new Date().toISOString().slice(0, 10)).toBe("2026-11-20");
    const upgraded = [SAVED_BRAVO, SAVED_CHARLIE, SAVED_DELTA].map((saved) => upgrade(saved, 24));
    expect(upgraded.flatMap(datesOf)).toEqual([ABSENT, ABSENT, ABSENT]);
  });

  it("leaves a scenario that already holds a date, or null, as it is", () => {
    // A shape 0.77.2 never writes: it can only reach the step through a hand-edited file.
    const [first, second, third] = SAVED_ALPHA.scenarios;
    const holding: StoredProject = {
      ...SAVED_ALPHA,
      scenarios: [first!, { ...second!, targetFinishDate: "2027-03-01" }, { ...third!, targetFinishDate: null }],
    };
    expect(datesOf(upgrade(holding, 24))).toEqual([ALPHA_DATE, "2027-03-01", null]);
  });

  it("runs at the end of the whole ladder from v14: a v14 project gains no date, and no project-level key", () => {
    const upgraded = upgrade(V14_CHARLIE, 14);
    expect(datesOf(upgraded)).toEqual([ABSENT]);
    expect("targetFinishDate" in upgraded).toBe(false);
    expect(upgraded.showTargetOnGantt).toBe(false);
    expect(upgraded.schemaVersion).toBe(25);
  });

  it("carries a date set at v15 through the whole ladder to every scenario", () => {
    const v15: StoredProject = {
      ...V14_CHARLIE,
      schemaVersion: 15,
      targetFinishDate: "2027-02-26",
      showTargetOnGantt: true,
      scenarios: [V14_CHARLIE.scenarios[0]!, { ...V14_CHARLIE.scenarios[0]!, id: "charlie-s2", name: "Second" }],
    };
    const upgraded = upgrade(v15, 15);
    expect(datesOf(upgraded)).toEqual(["2027-02-26", "2027-02-26"]);
    expect("targetFinishDate" in upgraded).toBe(false);
  });
});

describe("each load path, on what 0.77.2 saved", () => {
  it("this browser's storage: each scenario's date, the locked scenario still locked, every run kept", () => {
    storeLocally(SAVED);
    const repo = new LocalStorageRepository();
    const loaded = SAVED.map((saved) => repo.loadWithDiagnostics(saved.id));
    expect(loaded.map((r) => r.success)).toEqual([true, true, true, true]);
    const [alpha, bravo, charlie, delta] = loaded.map((r) => (r.success ? r.data : null)) as Project[];
    expect(datesOf(alpha!)).toEqual([ALPHA_DATE, ALPHA_DATE, ALPHA_DATE]);
    expect(alpha!.scenarios.map((s) => s.locked ?? false)).toEqual([false, false, true]);
    expect(alpha!.scenarios.map((s) => s.simulationResults?.id)).toEqual(
      SAVED_ALPHA.scenarios.map((s) => (s.simulationResults as { id: string }).id),
    );
    expect([bravo, charlie, delta].flatMap((p) => datesOf(p!))).toEqual([ABSENT, ABSENT, ABSENT]);
    expect(loaded.map((r) => (r.success ? "targetFinishDate" in r.data : "failed"))).toEqual([false, false, false, false]);
  });

  it("this browser's storage: the next change saves the project as schema 25, its dates in the scenarios", () => {
    storeLocally(SAVED);
    useProjectStore.getState().loadProjects();
    useProjectStore.getState().renameProject(SAVED_ALPHA.id, "Alpha renamed");
    const saved = storedLocally(SAVED_ALPHA.id);
    expect(saved.schemaVersion).toBe(25);
    expect(datesOf(saved)).toEqual([ALPHA_DATE, ALPHA_DATE, ALPHA_DATE]);
    expect("targetFinishDate" in saved).toBe(false);
  });

  it("Import Projects: the file 0.77.2 exported imports with each scenario's date, as schema 25", () => {
    const result = validateImport(JSON.stringify(EXPORT_FILE, null, 2), []);
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.projects.map(datesOf)).toEqual([[ALPHA_DATE, ALPHA_DATE, ALPHA_DATE], [ABSENT], [ABSENT], [ABSENT]]);
    expect(result.projects.map((p) => p.schemaVersion)).toEqual([25, 25, 25, 25]);
    expect(result.projects.map((p) => "targetFinishDate" in p)).toEqual([false, false, false, false]);
  });

  it("cloud loadAll: each scenario's date, and the upgraded project written forward with them", async () => {
    for (const saved of SAVED) cloud.docs.set(saved.id, cloudDocOf(saved));
    const { projects, errors } = await new FirestoreDriver(OWNER_UID).loadAll();
    expect(errors).toEqual([]);
    const byId = new Map(projects.map((p) => [p.id, p]));
    expect(SAVED.map((s) => datesOf(byId.get(s.id)!))).toEqual([[ALPHA_DATE, ALPHA_DATE, ALPHA_DATE], [ABSENT], [ABSENT], [ABSENT]]);
    const written = cloud.docs.get(SAVED_ALPHA.id)!;
    expect(written.schemaVersion).toBe(25);
    expect(datesOf(written as StoredProject)).toEqual([ALPHA_DATE, ALPHA_DATE, ALPHA_DATE]);
    const forward = cloud.sent.find((w) => w.id === SAVED_ALPHA.id)!;
    expect(forward.mergeFields).not.toContain("targetFinishDate");
  });

  it("cloud load: each scenario's date", async () => {
    cloud.docs.set(SAVED_ALPHA.id, cloudDocOf(SAVED_ALPHA));
    const project = await new FirestoreDriver(OWNER_UID).load(SAVED_ALPHA.id);
    expect(datesOf(project!)).toEqual([ALPHA_DATE, ALPHA_DATE, ALPHA_DATE]);
    expect("targetFinishDate" in project!).toBe(false);
  });

  it("cloud subscription: a snapshot of 0.77.2's document arrives with each scenario's date", () => {
    cloud.docs.set(SAVED_DELTA.id, cloudDocOf(SAVED_DELTA));
    cloud.docs.set(SAVED_ALPHA.id, cloudDocOf(SAVED_ALPHA));
    const received: Project[] = [];
    const driver = new FirestoreDriver(OWNER_UID);
    driver.subscribeToProject(SAVED_ALPHA.id, (p) => received.push(p));
    driver.subscribeToProject(SAVED_DELTA.id, (p) => received.push(p));
    expect(received.map(datesOf)).toEqual([[ALPHA_DATE, ALPHA_DATE, ALPHA_DATE], [ABSENT]]);
    expect(received.map((p) => "targetFinishDate" in p)).toEqual([false, false]);
  });
});

describe("a tab still running 0.77.2, after this version saved the project", () => {
  it("this browser's storage: its save gives every scenario the one date that tab held, and keeps its change", () => {
    const [baseline, downside] = SAVED_ALPHA.scenarios.map((s) => s.id as string);
    storeLocally([SAVED_ALPHA]);
    useProjectStore.getState().loadProjects();
    setTargetIn(SAVED_ALPHA.id, baseline!, "2027-01-15");
    setTargetIn(SAVED_ALPHA.id, downside!, null);
    expect(datesOf(storedLocally(SAVED_ALPHA.id))).toEqual(["2027-01-15", null, ALPHA_DATE]);

    // The older tab writes the whole project it holds, stamped 24, over this version's.
    localStorage.setItem(`spert:project:local:${SAVED_ALPHA.id}`, JSON.stringify(OLDER_TAB_ALPHA));
    useProjectStore.getState().loadProjects();
    expect(datesOf(inStore(SAVED_ALPHA.id))).toEqual([ALPHA_DATE, ALPHA_DATE, ALPHA_DATE]);
    expect(inStore(SAVED_ALPHA.id).scenarios[0]!.notes).toBe(OLDER_TAB_NOTE);
  });

  it("cloud storage: its save, merged by field, gives every scenario the one date that tab held", async () => {
    cloud.docs.set(SAVED_ALPHA.id, cloudDocOf(SAVED_ALPHA));
    const driver = new FirestoreDriver(OWNER_UID);
    await driver.loadAll();
    expect(cloud.docs.get(SAVED_ALPHA.id)!.schemaVersion).toBe(25);

    // The older tab's save, as its driver sends it: every field it holds, merged by field.
    const olderTabSave = { ...cloudFieldsOf(OLDER_TAB_ALPHA), updatedAt: SENT_AT };
    await setDoc({ id: SAVED_ALPHA.id } as never, olderTabSave, { mergeFields: OLDER_TAB_FIELDS });

    const { projects } = await driver.loadAll();
    expect(datesOf(projects[0]!)).toEqual([ALPHA_DATE, ALPHA_DATE, ALPHA_DATE]);
    expect(projects[0]!.scenarios[0]!.notes).toBe(OLDER_TAB_NOTE);
  });
});
