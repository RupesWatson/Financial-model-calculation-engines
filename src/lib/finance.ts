export type DcfInputs = {
  revenue: number;
  ebitMargin: number;
  taxRate: number;
  depreciationPctRevenue: number;
  capexPctRevenue: number;
  changeNwcPctRevenue: number;
  revenueGrowth: number[];
  wacc: number;
  terminalGrowth: number;
  netDebt: number;
  sharesOutstanding: number;
};

export type DcfYear = { year: number; revenue: number; ebit: number; nopat: number; unleveredFcf: number; discountFactor: number; presentValue: number };
export type DcfResult = { enterpriseValue: number; equityValue: number; valuePerShare: number; terminalValue: number; terminalValueShare: number; projections: DcfYear[] };

const finite = (value: number, label: string) => {
  if (!Number.isFinite(value)) throw new Error(`${label} must be a finite number.`);
  return value;
};

export function costOfEquity(riskFreeRate: number, beta: number, marketRiskPremium: number) {
  return finite(riskFreeRate + beta * marketRiskPremium, "Cost of equity");
}

export function calculateWacc(input: { marketCap: number; debt: number; costOfEquity: number; costOfDebt: number; taxRate: number }) {
  const totalCapital = input.marketCap + input.debt;
  if (totalCapital <= 0) throw new Error("Market capitalisation plus debt must be positive.");
  return (input.marketCap / totalCapital) * input.costOfEquity + (input.debt / totalCapital) * input.costOfDebt * (1 - input.taxRate);
}

export function discountedCashFlow(input: DcfInputs): DcfResult {
  if (input.revenue <= 0) throw new Error("Revenue must be positive.");
  if (input.sharesOutstanding <= 0) throw new Error("Shares outstanding must be positive.");
  if (input.revenueGrowth.length === 0) throw new Error("At least one forecast year is required.");
  if (input.wacc <= input.terminalGrowth) throw new Error("WACC must be greater than terminal growth.");
  let revenue = input.revenue;
  const projections = input.revenueGrowth.map((growth, index) => {
    revenue *= 1 + growth;
    const ebit = revenue * input.ebitMargin;
    const nopat = ebit * (1 - input.taxRate);
    const unleveredFcf = nopat + revenue * input.depreciationPctRevenue - revenue * input.capexPctRevenue - revenue * input.changeNwcPctRevenue;
    const discountFactor = 1 / Math.pow(1 + input.wacc, index + 1);
    return { year: index + 1, revenue, ebit, nopat, unleveredFcf, discountFactor, presentValue: unleveredFcf * discountFactor };
  });
  const finalFcf = projections.at(-1)!.unleveredFcf;
  const terminalValue = (finalFcf * (1 + input.terminalGrowth)) / (input.wacc - input.terminalGrowth);
  const terminalPresentValue = terminalValue / Math.pow(1 + input.wacc, projections.length);
  const enterpriseValue = projections.reduce((sum, year) => sum + year.presentValue, 0) + terminalPresentValue;
  const equityValue = enterpriseValue - input.netDebt;
  return {
    enterpriseValue,
    equityValue,
    valuePerShare: equityValue / input.sharesOutstanding,
    terminalValue,
    terminalValueShare: enterpriseValue === 0 ? 0 : terminalPresentValue / enterpriseValue,
    projections
  };
}

export function reverseDcfGrowth(input: Omit<DcfInputs, "revenueGrowth">, targetPrice: number, years = 5) {
  if (targetPrice <= 0) throw new Error("Target price must be positive.");
  let low = -0.95;
  let high = 2;
  for (let iteration = 0; iteration < 160; iteration += 1) {
    const mid = (low + high) / 2;
    const price = discountedCashFlow({ ...input, revenueGrowth: Array(years).fill(mid) }).valuePerShare;
    if (price < targetPrice) low = mid;
    else high = mid;
  }
  return (low + high) / 2;
}

export function dcfSensitivity(input: DcfInputs, waccValues: number[], growthValues: number[]) {
  return waccValues.map((wacc) => growthValues.map((terminalGrowth) => {
    if (wacc <= terminalGrowth) return null;
    return discountedCashFlow({ ...input, wacc, terminalGrowth }).valuePerShare;
  }));
}

export function gordonGrowthDividendValue(dividendPerShare: number, dividendGrowth: number, requiredReturn: number) {
  if (requiredReturn <= dividendGrowth) throw new Error("Required return must be greater than dividend growth.");
  return (dividendPerShare * (1 + dividendGrowth)) / (requiredReturn - dividendGrowth);
}

export function comparableValue(metricPerShare: number, selectedMultiple: number) {
  if (metricPerShare < 0 || selectedMultiple < 0) throw new Error("Metric and multiple cannot be negative.");
  return metricPerShare * selectedMultiple;
}

export type BondInputs = { faceValue: number; couponRate: number; marketPrice: number; yearsToMaturity: number; paymentsPerYear: number };
export type BondResult = { yieldToMaturity: number; macaulayDuration: number; modifiedDuration: number; convexity: number; dv01: number; currentYield: number };

function bondPriceAtYield(input: BondInputs, annualYield: number) {
  const periods = Math.max(1, Math.round(input.yearsToMaturity * input.paymentsPerYear));
  const coupon = input.faceValue * input.couponRate / input.paymentsPerYear;
  const periodicYield = annualYield / input.paymentsPerYear;
  let price = 0;
  for (let period = 1; period <= periods; period += 1) {
    const cashFlow = coupon + (period === periods ? input.faceValue : 0);
    price += cashFlow / Math.pow(1 + periodicYield, period);
  }
  return price;
}

export function analyseBond(input: BondInputs): BondResult {
  if (input.faceValue <= 0 || input.marketPrice <= 0 || input.yearsToMaturity <= 0 || input.paymentsPerYear <= 0) throw new Error("Bond values must be positive.");
  let low = -0.99;
  let high = 10;
  for (let iteration = 0; iteration < 180; iteration += 1) {
    const mid = (low + high) / 2;
    if (bondPriceAtYield(input, mid) > input.marketPrice) low = mid;
    else high = mid;
  }
  const yieldToMaturity = (low + high) / 2;
  const periods = Math.max(1, Math.round(input.yearsToMaturity * input.paymentsPerYear));
  const coupon = input.faceValue * input.couponRate / input.paymentsPerYear;
  const periodicYield = yieldToMaturity / input.paymentsPerYear;
  let weightedTime = 0;
  let convexityNumerator = 0;
  for (let period = 1; period <= periods; period += 1) {
    const cashFlow = coupon + (period === periods ? input.faceValue : 0);
    const presentValue = cashFlow / Math.pow(1 + periodicYield, period);
    const timeYears = period / input.paymentsPerYear;
    weightedTime += timeYears * presentValue;
    convexityNumerator += presentValue * period * (period + 1);
  }
  const macaulayDuration = weightedTime / input.marketPrice;
  const modifiedDuration = macaulayDuration / (1 + periodicYield);
  const convexity = convexityNumerator / (input.marketPrice * Math.pow(1 + periodicYield, 2) * Math.pow(input.paymentsPerYear, 2));
  return {
    yieldToMaturity,
    macaulayDuration,
    modifiedDuration,
    convexity,
    dv01: modifiedDuration * input.marketPrice * 0.0001,
    currentYield: input.faceValue * input.couponRate / input.marketPrice
  };
}

export type PortfolioAsset = { name: string; weight: number; expectedReturn: number; volatility: number };
export function analysePortfolio(assets: PortfolioAsset[], correlations: number[][], riskFreeRate = 0.04, confidenceZ = 1.645) {
  if (assets.length === 0 || correlations.length !== assets.length || correlations.some((row) => row.length !== assets.length)) throw new Error("Correlation matrix must match the asset list.");
  const weightTotal = assets.reduce((sum, asset) => sum + asset.weight, 0);
  if (Math.abs(weightTotal - 1) > 0.0001) throw new Error("Portfolio weights must sum to 100%.");
  const expectedReturn = assets.reduce((sum, asset) => sum + asset.weight * asset.expectedReturn, 0);
  let variance = 0;
  for (let i = 0; i < assets.length; i += 1) {
    for (let j = 0; j < assets.length; j += 1) {
      variance += assets[i].weight * assets[j].weight * assets[i].volatility * assets[j].volatility * correlations[i][j];
    }
  }
  const volatility = Math.sqrt(Math.max(0, variance));
  return {
    expectedReturn,
    volatility,
    sharpeRatio: volatility === 0 ? null : (expectedReturn - riskFreeRate) / volatility,
    annualValueAtRisk: confidenceZ * volatility - expectedReturn
  };
}
