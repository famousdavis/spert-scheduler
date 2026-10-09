// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, within, cleanup } from "@testing-library/react";

/**
 * WI-110's second path: a press inside a tile's delete confirmation reached the tile's DRAG listener.
 * The confirmation is a Radix dialog in a portal, a React child of the tile, so its pointerdown bubbled
 * to the tile root's `{...listeners}`. Measured in Chromium 153 at b45f981: pressing on the dialog's
 * text and moving 40 px dragged the tile behind the open dialog, and with two tiles a drag there
 * reordered the Dashboard.
 *
 * dnd-kit's sensors need real layout, which jsdom does not have, so `useSortable` is replaced here by
 * a spy listener and the test asks the one question the tile answers: does a press reach the drag
 * listener? The tile and its confirmation are real.
 */
const drag = vi.hoisted(() => ({ onPointerDown: vi.fn() }));

vi.mock("@dnd-kit/sortable", () => ({
  useSortable: () => ({
    listeners: { onPointerDown: drag.onPointerDown },
    setNodeRef: () => {},
    transform: null,
    transition: undefined,
    isDragging: false,
  }),
}));

import { ProjectTile } from "./ProjectTile";
import { createProject } from "@app/api/project-service";

afterEach(() => {
  cleanup();
  drag.onPointerDown.mockClear();
});

describe("WI-110: a press inside a tile's delete confirmation does not reach the tile's drag listener", () => {
  it("a press on the confirmation's text starts no drag; a press on the tile still does", async () => {
    render(
      <ProjectTile
        project={createProject("Arthur Dent Survey", "2026-10-05")}
        onNavigate={() => {}}
        onDelete={() => {}}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Delete project" }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.pointerDown(within(dialog).getByText("Arthur Dent Survey"), { button: 0, isPrimary: true });
    expect(drag.onPointerDown).toHaveBeenCalledTimes(0);

    // The control: a press on the tile's own text, the dialog still open, does reach it.
    fireEvent.pointerDown(screen.getByText("1 scenario"), { button: 0, isPrimary: true });
    expect(drag.onPointerDown).toHaveBeenCalledTimes(1);
  });
});
