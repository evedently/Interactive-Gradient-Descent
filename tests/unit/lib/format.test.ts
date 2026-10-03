import { describe, expect, it } from "vitest";
import { formatLoss } from "../../../src/lib/format";

describe("formatLoss", () => {
  it("formatLoss_finite_sixDecimals", () => expect(formatLoss(1.23456789)).toBe("1.234568"));
  it("formatLoss_zero_sixDecimals", () => expect(formatLoss(0)).toBe("0.000000"));
  it("formatLoss_nan_printedAsIs", () => expect(formatLoss(Number.NaN)).toBe("NaN"));
  it("formatLoss_infinity_printedAsIs", () => expect(formatLoss(Number.POSITIVE_INFINITY)).toBe("Infinity"));
});
