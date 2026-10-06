// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { useRef } from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

// CopyImageButton decides at MODULE LOAD whether this browser can copy images, from
// ClipboardItem and navigator.clipboard.write. jsdom has neither, so both must exist
// before that module is evaluated, or the button renders disabled and a click does
// nothing. html2canvas cannot run under jsdom; the mock stands in for it.
const { html2canvasMock, clipboardWrite } = vi.hoisted(() => {
  const write = vi.fn();
  vi.stubGlobal("ClipboardItem", class { constructor(readonly items: Record<string, Blob>) {} });
  Object.defineProperty(navigator, "clipboard", { value: { write }, configurable: true });
  return { html2canvasMock: vi.fn(), clipboardWrite: write };
});
vi.mock("html2canvas", () => ({ default: html2canvasMock }));

import { CopyImageButton } from "./CopyImageButton";

/**
 * The copy-image buttons can be seen in both themes (WI-103).
 *
 * The idle icon and the copying spinner stroke `currentColor`, so they take the button's own
 * text colour. Before WI-103 the button set none and nothing above it sets one either, so both
 * inherited the page's default black in BOTH themes — invisible on the dark header bars. jsdom
 * applies no Tailwind CSS, so these tests pin the classes and the strokes; the colours they
 * produce were measured in a real browser.
 */

function CopySite() {
  const ref = useRef<HTMLDivElement>(null);
  return (
    <>
      <CopyImageButton targetRef={ref} title="Copy table as image" />
      <div ref={ref}>table</div>
    </>
  );
}

const button = () => screen.getByRole("button", { name: "Copy table as image" });
/** The button draws one icon at a time: the idle pages, the spinner, the tick or the cross. */
const icon = () => button().querySelector("svg") as SVGSVGElement;

const fakeCanvas = () => ({
  toBlob: (done: BlobCallback) => done(new Blob(["png"], { type: "image/png" })),
});

/** A promise this file settles itself, so a test can look at the button while it is pending. */
function pendingRender() {
  let settle!: (canvas: ReturnType<typeof fakeCanvas>) => void;
  const promise = new Promise<ReturnType<typeof fakeCanvas>>((resolve) => {
    settle = resolve;
  });
  return { promise, settle };
}

beforeEach(() => {
  clipboardWrite.mockReset();
  clipboardWrite.mockResolvedValue(undefined);
  html2canvasMock.mockReset();
});

describe("CopyImageButton — its icon can be seen in both themes (WI-103)", () => {
  it("sets its own icon colour in both themes, and the idle icon strokes that colour", () => {
    render(<CopySite />);

    expect(button()).toHaveClass("text-black", "dark:text-white");
    expect(icon().querySelector("rect")).not.toBeNull(); // the premise: this is the idle icon
    expect(icon()).toHaveAttribute("stroke", "currentColor");
  });

  it("draws the copying spinner in the button's colour, then the success tick in #059669", async () => {
    const rendering = pendingRender();
    html2canvasMock.mockImplementation(() => rendering.promise);
    render(<CopySite />);

    fireEvent.click(button());

    expect(icon()).toHaveClass("animate-spin"); // copying, until the render settles
    expect(icon()).toHaveAttribute("stroke", "currentColor");

    rendering.settle(fakeCanvas());
    await waitFor(() => expect(icon().querySelector("polyline")).not.toBeNull());
    expect(clipboardWrite).toHaveBeenCalledTimes(1); // the copy really succeeded
    expect(icon()).toHaveAttribute("stroke", "#059669");
  });

  it("draws the error cross in #ef4444 after a copy fails, as before", async () => {
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      html2canvasMock.mockRejectedValue(new Error("html2canvas failed"));
      render(<CopySite />);

      fireEvent.click(button());

      await waitFor(() => expect(icon().querySelectorAll("line")).toHaveLength(2));
      expect(errorLog).toHaveBeenCalledWith("CopyImageButton: copy failed", expect.any(Error));
      expect(icon()).toHaveAttribute("stroke", "#ef4444");
    } finally {
      errorLog.mockRestore();
    }
  });
});
