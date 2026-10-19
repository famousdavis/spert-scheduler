// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

// Falsification spec for WI-128's quiet fix (owner ruling, 2026-10-18): the save a load makes to upgrade a project — in
// loadAll, for each project it reads, and in load — is logged if refused and never reported to onSaveError, because it
// carries no change of the user's and cloud storage refuses it for every document as 0.77.2's driver leaves one, so a
// report showed "Cloud sync error" when nothing was lost. Every other save is reported as before, and the upgrade save
// is still tried: a document that cloud storage lets it through for is stored in the new format as it loads.
//
// Each straw breaks ONE guarantee: either upgrade save reporting its refusal again — at every load, or from a driver's
// second load on, as at an invitation's re-fetch — the report taken from every save, or the upgrade save not tried at all. Each names EXACTLY the tests it must fail, and no others — read "K failing;
// named-match K", not merely a non-zero exit: the runner prints ✔ when ANY named test fails. Each expected set was
// written before the run that first included it.
//
// testFile is all of src/, so every straw runs against the whole suite.
const DRIVER = new URL("../src/infrastructure/firebase/firestore-driver.ts", import.meta.url).pathname;

// firestore-driver.upgrade-save.test.ts — the save a load makes to upgrade a project
const D_LOADALL =
  "loadAll: each project's upgrade save is tried and refused, logged, and reported to no one; the documents stay at 24";
const D_VIEWER = "load: a viewer's upgrade save is refused and reported to no one; the document stays at 24";
const D_OWNER = "load: its upgrade save names neither internal field, so an owner's is stored as 25";
const D_HELD =
  "loadAll: a document that already holds `_owner` and `_members` with the same values is stored as 25 as it loads";
const D_REPORTED = "control: a change's refused save is reported, immediate or debounced";
const D_CHANGE = "a change's save is let through, and stores the project as 25 with each scenario's date";
const D_REFETCH =
  "a second loadAll on the same driver, as at an invitation's re-fetch: each upgrade save is tried and refused again, and still reported to no one";
// scenario-target-upgrade.test.ts — the upgrade through the cloud driver, against a fake that applies no rules
const L_LOADALL = "cloud loadAll: each scenario's date, and the upgraded project written forward with them";
const O_CLOUD = "cloud storage: its save, merged by field, gives every scenario the one date that tab held";

const escape = (s) => s.replaceAll(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`);

/** Matches exactly these test titles, as the verbose reporter prints them. */
const only = (...titles) => new RegExp(`> (?:${titles.map(escape).join("|")})$`);

const IN_LOADALL = '      await this.doSave(project, false);\n    }\n\n    return { kind: "ok", project };\n';
const LOADALL_SNAP = "    const snap = await getDocs(q);\n    const projects: (Project & {\n";
const IN_LOAD = "      await this.doSave(project, false);\n    }\n\n    return project;\n";

export const testFile = "src/";
export const mutations = [
  {
    // Three tests: loadAll's own, the second load's, and the change-save test, which loads its project first and so reads
    // that refusal too.
    id: "U1 loadAll's upgrade save reports its refusal again  [expect 3: D_LOADALL, D_CHANGE, D_REFETCH]",
    file: DRIVER,
    find: IN_LOADALL,
    replace: '      await this.doSave(project);\n    }\n\n    return { kind: "ok", project };\n',
    expectFailing: only(D_LOADALL, D_CHANGE, D_REFETCH),
  },
  {
    id: "U2 load's upgrade save reports its refusal again  [expect 1: D_VIEWER]",
    file: DRIVER,
    find: IN_LOAD,
    replace: "      await this.doSave(project);\n    }\n\n    return project;\n",
    expectFailing: only(D_VIEWER),
  },
  {
    id: "U3 WRONG DESIGN: no save reports its refusal — a change's included  [expect 1: D_REPORTED]",
    file: DRIVER,
    find: "      if (report) this.onSaveErrorCb?.(e);\n",
    replace: "",
    expectFailing: only(D_REPORTED),
  },
  {
    id: "U4 WRONG DESIGN: a load no longer tries the upgrade save at all  [expect 7: D_LOADALL, D_VIEWER, D_OWNER, D_HELD, D_REFETCH, L_LOADALL, O_CLOUD]",
    file: DRIVER,
    find: IN_LOADALL,
    replace: '    }\n\n    return { kind: "ok", project };\n',
    also: { find: IN_LOAD, replace: "    }\n\n    return project;\n" },
    expectFailing: only(D_LOADALL, D_VIEWER, D_OWNER, D_HELD, D_REFETCH, L_LOADALL, O_CLOUD),
  },
  {
    // The wrong fix found passing the whole suite before its test existed: quiet at a driver's first load only, so an
    // invitation's re-fetch — the one load where the false messages ever showed — reports again.
    id: "U5 WRONG DESIGN: loadAll's upgrade save quiet only at the driver's first load  [expect 1: D_REFETCH]",
    file: DRIVER,
    find: LOADALL_SNAP,
    replace: "    const snap = await getDocs(q);\n    const counted = this as unknown as { loads?: number };\n    counted.loads = (counted.loads ?? 0) + 1;\n    const projects: (Project & {\n",
    also: {
      find: IN_LOADALL,
      replace: '      await this.doSave(project, ((this as unknown as { loads?: number }).loads ?? 0) > 1);\n    }\n\n    return { kind: "ok", project };\n',
    },
    expectFailing: only(D_REFETCH),
  },
];
