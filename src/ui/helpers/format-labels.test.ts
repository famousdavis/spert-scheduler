import { describe, it, expect } from "vitest";
import {
  distributionLabel,
  distributionShortLabel,
  statusLabel,
} from "./format-labels";

describe("distributionLabel", () => {
  it("formats logNormal correctly", () => {
    expect(distributionLabel("logNormal")).toBe("LogNormal");
  });

  it("formats normal correctly", () => {
    expect(distributionLabel("normal")).toBe("T-Normal");
  });

  it("formats triangular correctly", () => {
    expect(distributionLabel("triangular")).toBe("Triangular");
  });

  it("formats uniform correctly", () => {
    expect(distributionLabel("uniform")).toBe("Uniform");
  });
});

describe("distributionShortLabel", () => {
  it("formats logNormal correctly", () => {
    expect(distributionShortLabel("logNormal")).toBe("LogN");
  });

  it("formats normal correctly", () => {
    expect(distributionShortLabel("normal")).toBe("Norm");
  });

  it("formats triangular correctly", () => {
    expect(distributionShortLabel("triangular")).toBe("Tri");
  });

  it("formats uniform correctly", () => {
    expect(distributionShortLabel("uniform")).toBe("Uni");
  });
});

describe("statusLabel", () => {
  it("formats planned correctly", () => {
    expect(statusLabel("planned")).toBe("Planned");
  });

  it("formats inProgress correctly", () => {
    expect(statusLabel("inProgress")).toBe("In Progress");
  });

  it("formats complete correctly", () => {
    expect(statusLabel("complete")).toBe("Complete");
  });
});
