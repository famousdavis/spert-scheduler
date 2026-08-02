// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import "@testing-library/jest-dom/vitest";

import { installResizeObserverStub, installMatchMediaStub } from "./test-stubs";

// Browser APIs jsdom does not implement. This file runs for EVERY test file, so the stub
// state below is per-file and needs no manual reset.
//
// ⚠️ The implementations live in test-stubs.ts, beside test-stubs.test.ts, which proves
// each one can fail — the ResizeObserver callback actually fires, the matchMedia result
// actually changes. That proof deliberately does NOT live in a consumer's test file: a
// stub whose only evidence sits somewhere unrelated drifts the first time either side is
// edited, and this is shared infrastructure where a silent no-op would make every test
// built on it pass vacuously.
installResizeObserverStub();
installMatchMediaStub();
