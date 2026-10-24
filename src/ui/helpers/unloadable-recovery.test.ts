// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { describe, it, expect } from "vitest";
import { describeUnloadableDelete } from "./unloadable-recovery";

// CI-3 (v0.79.8 audit): the confirm-dialog body must state a cloud delete's
// blast radius (every member, permanent) and not overstate a local one.
describe("describeUnloadableDelete", () => {
  it("names the all-members, permanent cloud blast radius for an invalid cloud project", () => {
    const text = describeUnloadableDelete({ source: "cloud", type: "validation" });
    expect(text).toContain("everyone it's shared with");
    expect(text).toContain("cannot be undone");
    // Not the "newer version" wording — this one IS damaged.
    expect(text).not.toContain("newer version");
  });

  it("flags a future-version cloud project as newer-not-damaged before the all-members delete", () => {
    const text = describeUnloadableDelete({ source: "cloud", type: "future_version" });
    expect(text).toContain("newer version");
    expect(text).toContain("isn't damaged");
    expect(text).toContain("everyone it's shared with");
  });

  it("scopes a local project's delete to this browser only, never 'everyone'", () => {
    const text = describeUnloadableDelete({ source: "local", type: "validation" });
    expect(text).toContain("this browser");
    expect(text).not.toContain("everyone");
  });

  it("treats a cloud error with no source recorded as local-scoped (never overstates reach)", () => {
    // Defensive: an undefined source must not produce the all-members wording.
    const text = describeUnloadableDelete({ source: undefined, type: "validation" });
    expect(text).toContain("this browser");
    expect(text).not.toContain("everyone");
  });
});
