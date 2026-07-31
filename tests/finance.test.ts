import { describe, expect, it } from "vitest";
import { analyseBond, analysePortfolio, calculateWacc, discountedCashFlow, gordonGrowthDividendValue, reverseDcfGrowth } from "../src/lib/finance";

describe("equity calculation engines", () => {
  const base = { revenue: 100, ebitMargin: 0.2, taxRate: 0.25, depreciationPctRevenue: 0, capexPctRevenue: 0, changeNwcPctRevenue: 0, revenueGrowth: [0], wacc: 0.1, terminalGrowth: 0, netDebt: 0, sharesOutstanding: 10 };
  it("discounts forecast and terminal cash flow", () => {
    const result = discountedCashFlow(base);
    expect(result.enterpriseValue).toBeCloseTo(150, 8);
    expect(result.valuePerShare).toBeCloseTo(15, 8);
  });
  it("solves market-implied growth", () => {
    const { revenueGrowth: _, ...inputs } = base;
    expect(reverseDcfGrowth(inputs, 15, 1)).toBeCloseTo(0, 7);
  });
  it("rejects terminal growth at or above WACC", () => {
    expect(() => discountedCashFlow({ ...base, terminalGrowth: 0.1 })).toThrow(/WACC/);
  });
  it("calculates WACC and Gordon growth value", () => {
    expect(calculateWacc({ marketCap: 80, debt: 20, costOfEquity: 0.1, costOfDebt: 0.05, taxRate: 0.25 })).toBeCloseTo(0.0875);
    expect(gordonGrowthDividendValue(2, 0.03, 0.08)).toBeCloseTo(41.2);
  });
});

describe("fixed-income and portfolio engines", () => {
  it("returns coupon rate as YTM for a par bond", () => {
    const result = analyseBond({ faceValue: 1000, couponRate: 0.05, marketPrice: 1000, yearsToMaturity: 5, paymentsPerYear: 2 });
    expect(result.yieldToMaturity).toBeCloseTo(0.05, 8);
    expect(result.modifiedDuration).toBeGreaterThan(4);
    expect(result.dv01).toBeGreaterThan(0);
  });
  it("uses covariance to calculate portfolio volatility", () => {
    const result = analysePortfolio([{ name: "A", weight: 0.5, expectedReturn: 0.1, volatility: 0.2 }, { name: "B", weight: 0.5, expectedReturn: 0.06, volatility: 0.1 }], [[1, 0], [0, 1]], 0.03);
    expect(result.expectedReturn).toBeCloseTo(0.08);
    expect(result.volatility).toBeCloseTo(Math.sqrt(0.0125));
    expect(result.sharpeRatio).toBeCloseTo(0.4472135955);
  });
});
