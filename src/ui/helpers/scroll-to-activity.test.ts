// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

// BR-4 (v0.79.x security audit): an activity id can hold a `"` (an AI create_activity takes p.id),
// so the selector this builds must be escaped or querySelector throws before the scroll runs.

import { describe, it, expect, vi } from "vitest";
import { scrollToActivity } from "./scroll-to-activity";

describe("scrollToActivity", () => {
  it("BR-4: does not throw on an id containing a double quote, and still runs revealGrid", () => {
    const reveal = vi.fn();
    expect(() => scrollToActivity('a"b', reveal)).not.toThrow();
    expect(reveal).toHaveBeenCalledTimes(1);
  });
});
