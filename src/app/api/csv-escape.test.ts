// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

// BR-1/BR-2 (v0.79.x security audit): the one shared CSV escaper, used by every CSV writer.

import { describe, it, expect } from "vitest";
import { escapeCsvField } from "./csv-escape";

describe("escapeCsvField", () => {
  it("returns a plain value unchanged", () => {
    expect(escapeCsvField("hello")).toBe("hello");
    expect(escapeCsvField("1.0.0")).toBe("1.0.0");
  });

  it("stringifies a number", () => {
    expect(escapeCsvField(10000)).toBe("10000");
  });

  it("quotes and doubles internal double-quotes", () => {
    expect(escapeCsvField('a "b" c')).toBe('"a ""b"" c"');
  });

  it("quotes a value containing a comma or a newline", () => {
    expect(escapeCsvField("a,b")).toBe('"a,b"');
    expect(escapeCsvField("a\nb")).toBe('"a\nb"');
  });

  it("BR-2: quotes a value with a carriage return ANYWHERE, not only at the start", () => {
    // Pre-fix the quoting condition omitted \r, so a mid-value CR passed through unquoted and
    // could split the row in a CR/CRLF-parsing spreadsheet.
    expect(escapeCsvField("a\rb")).toBe('"a\rb"');
  });

  it("OWASP guard: prefixes a cell starting with a formula character with a single quote", () => {
    expect(escapeCsvField("=SUM(A:A)")).toBe("'=SUM(A:A)");
    expect(escapeCsvField("+1")).toBe("'+1");
    expect(escapeCsvField("@x")).toBe("'@x");
    expect(escapeCsvField("-2+3")).toBe("'-2+3");
    expect(escapeCsvField("\tx")).toBe("'\tx");
  });

  it("a formula that also contains a comma is prefixed AND quoted", () => {
    expect(escapeCsvField('=HYPERLINK("http://evil","go")')).toBe('"\'=HYPERLINK(""http://evil"",""go"")"');
  });
});
