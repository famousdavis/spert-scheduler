// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0. See LICENSE file in the project root for full license text.

import { describe, it, expect } from "vitest";
import { buildProjectExportFilename } from "./export-filename";

describe("buildProjectExportFilename", () => {
  it("builds a spert-scheduler-prefixed, project-named, timestamped .json filename", () => {
    expect(
      buildProjectExportFilename("My Project", "2026-06-10T15-48-30")
    ).toBe("spert-scheduler-My Project-2026-06-10T15-48-30.json");
  });

  it("always carries the spert-scheduler app prefix and the .json extension", () => {
    const name = buildProjectExportFilename("Anything", "2026-01-02T09-04-07");
    expect(name.startsWith("spert-scheduler-")).toBe(true);
    expect(name.endsWith(".json")).toBe(true);
  });

  it("embeds the timestamp stamp verbatim between name and extension", () => {
    expect(buildProjectExportFilename("Plan", "2026-12-31T23-59-58")).toBe(
      "spert-scheduler-Plan-2026-12-31T23-59-58.json"
    );
  });

  it("sanitizes characters that are illegal in filenames", () => {
    // Slashes and colons would break the download path — replaced with "_".
    expect(
      buildProjectExportFilename("Q3 / Roadmap: v2", "2026-06-10T15-48-30")
    ).toBe("spert-scheduler-Q3 _ Roadmap_ v2-2026-06-10T15-48-30.json");
  });

  it("falls back to 'Untitled' for an empty or whitespace-only name", () => {
    expect(buildProjectExportFilename("   ", "2026-06-10T15-48-30")).toBe(
      "spert-scheduler-Untitled-2026-06-10T15-48-30.json"
    );
  });
});
