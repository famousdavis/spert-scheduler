// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

/**
 * FRAME26 stage 4 (v0.88.0): an address no route matches stays inside the frame (contract §7, "Errors"). Until v0.88.0
 * React Router's own error page showed, with no frame. The route table's catch-all is pinned by reading it, because the
 * real router is a browser router built at import.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect, afterEach } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { NotFoundPage } from "./NotFoundPage";

afterEach(cleanup);

describe("FRAME26: the 404", () => {
  it("is a heading row, 'Page not found', one sentence, and a link back to Projects", () => {
    render(
      <MemoryRouter initialEntries={["/nope"]}>
        <Routes>
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </MemoryRouter>,
    );
    const h1s = screen.getAllByRole("heading", { level: 1 });
    expect(h1s.map((h) => h.textContent)).toEqual(["Page not found"]);
    expect(h1s[0]!.closest('[data-sf="headrow"]')).not.toBeNull();
    expect(screen.getByText("There's no page at this address.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Back to Projects" })).toHaveAttribute("href", "/projects");
  });

  it("is the router's catch-all, inside the Layout route, after every named route", () => {
    const router = readFileSync(join(process.cwd(), "src", "app", "router.tsx"), "utf8");
    const children = router.slice(router.indexOf("children: ["), router.indexOf("],", router.indexOf("children: [")));
    const paths = [...children.matchAll(/path: "([^"]+)"/g)].map((m) => m[1]);
    expect(paths).toEqual(["projects", "project/:id", "calendar", "settings", "about", "changelog", "*"]);
    expect(children).toMatch(/\{ path: "\*", element: <NotFoundPage \/> \}/);
  });
});
