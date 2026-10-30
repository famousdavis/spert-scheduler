// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { useRef } from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";

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

/**
 * The busy state comes first, and is heard (WI-143).
 *
 * html2canvas copies the page synchronously inside its call, and nothing paints until it is done,
 * so a spinner set in the same task showed only when the copy was mostly over — over a second
 * after the click on the sample project. The button now sets its busy state, lets a frame paint
 * it, and only then copies; it stays focusable while busy (`aria-disabled`, not `disabled`, which
 * dropped focus to the page); and a status beside it says the copy started and finished.
 */
describe("CopyImageButton — the busy state comes first, and is heard (WI-143)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  /** Hold every animation frame until the test runs it, as a page does between two frames. */
  function holdFrames(): () => void {
    const frames: FrameRequestCallback[] = [];
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((frame) => {
      frames.push(frame);
      return frames.length;
    });
    return () => act(() => frames.splice(0).forEach((frame) => frame(performance.now())));
  }

  const status = () => screen.getByRole("status");

  it("shows the busy state, and lets a frame paint it, before html2canvas starts", async () => {
    const runFrame = holdFrames();
    const seenAtStart: string[] = [];
    html2canvasMock.mockImplementation(() => {
      seenAtStart.push(`spinner ${icon().classList.contains("animate-spin")}, aria-disabled ${button().getAttribute("aria-disabled")}`);
      return Promise.resolve(fakeCanvas());
    });
    render(<CopySite />);

    fireEvent.click(button());

    // The busy state is on the page, and nothing has been copied: the copy waits for the frame.
    expect(icon()).toHaveClass("animate-spin");
    expect(html2canvasMock).not.toHaveBeenCalled();

    runFrame();
    // Well inside the wait's own limit, so it is the frame that let the copy start.
    await act(() => new Promise((done) => setTimeout(done, 20)));
    expect(html2canvasMock).toHaveBeenCalledTimes(1);
    expect(seenAtStart).toEqual(["spinner true, aria-disabled true"]);
  });

  it("still copies when no frame comes, as in a hidden tab", async () => {
    holdFrames(); // and never run them
    html2canvasMock.mockResolvedValue(fakeCanvas());
    render(<CopySite />);

    fireEvent.click(button());

    expect(html2canvasMock).not.toHaveBeenCalled();
    await waitFor(() => expect(icon().querySelector("polyline")).not.toBeNull());
    expect(html2canvasMock).toHaveBeenCalledTimes(1);
  });

  it("keeps focus while busy, and a second click starts no second copy", async () => {
    const rendering = pendingRender();
    html2canvasMock.mockImplementation(() => rendering.promise);
    render(<CopySite />);
    button().focus();

    fireEvent.click(button());
    fireEvent.click(button()); // before the copy has started
    await waitFor(() => expect(html2canvasMock).toHaveBeenCalledTimes(1));
    fireEvent.click(button()); // while it renders

    expect(button()).toHaveAttribute("aria-disabled", "true");
    expect(button()).not.toBeDisabled(); // a disabled button would lose focus
    expect(button()).toHaveFocus();

    rendering.settle(fakeCanvas());
    await waitFor(() => expect(icon().querySelector("polyline")).not.toBeNull());
    expect(html2canvasMock).toHaveBeenCalledTimes(1);
    expect(clipboardWrite).toHaveBeenCalledTimes(1);
    expect(button()).not.toHaveAttribute("aria-disabled");
    expect(button()).toHaveFocus();
  });

  it("says the copy started and that it finished, in a status the eye does not see, beside the button", async () => {
    const rendering = pendingRender();
    html2canvasMock.mockImplementation(() => rendering.promise);
    render(<CopySite />);

    expect(status()).toHaveClass("sr-only");
    expect(button()).not.toContainElement(status()); // a button's content is not read out
    expect(status()).toHaveTextContent(/^$/);

    fireEvent.click(button());
    expect(status()).toHaveTextContent("Copying image to clipboard…");

    rendering.settle(fakeCanvas());
    await waitFor(() => expect(status()).toHaveTextContent("Image copied to clipboard"));
  });

  it("leaves a failure to the error toast: the status says nothing", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    html2canvasMock.mockRejectedValue(new Error("html2canvas failed"));
    render(<CopySite />);

    fireEvent.click(button());

    await waitFor(() => expect(icon().querySelectorAll("line")).toHaveLength(2));
    expect(status()).toHaveTextContent(/^$/);
  });
});
