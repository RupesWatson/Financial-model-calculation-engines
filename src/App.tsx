import { FormEvent, useMemo, useState } from "react";
import { analyseBond, analysePortfolio, calculateWacc, costOfEquity, discountedCashFlow, gordonGrowthDividendValue, reverseDcfGrowth, type DcfInputs } from "./lib/finance";
import { getYahooSnapshot, searchYahoo, type YahooEquitySnapshot, type YahooSearchResult } from "./lib/yahoo";

type Tab = "equity" | "bond" | "portfolio";
const money = new Intl.NumberFormat("en-GB", { style: "currency", currency: "USD", maximumFractionDigits: 2 });
const compact = new Intl.NumberFormat("en-GB", { notation: "compact", maximumFractionDigits: 2 });
const percent = (value: number) => `${(value * 100).toFixed(2)}%`;
const number = (value: string) => Number(value) || 0;

function NumberField({ label, value, onChange, suffix, step = "0.01" }: { label: string; value: number; onChange: (value: number) => void; suffix?: string; step?: string }) {
  return <label className="field"><span>{label}</span><div className="input-wrap"><input type="number" step={step} value={value} onChange={(event) => onChange(number(event.target.value))} />{suffix && <b>{suffix}</b>}</div></label>;
}

const initialDcf: DcfInputs = {
  revenue: 1000, ebitMargin: 0.18, taxRate: 0.25, depreciationPctRevenue: 0.035,
  capexPctRevenue: 0.05, changeNwcPctRevenue: 0.01, revenueGrowth: [0.08, 0.08, 0.07, 0.06, 0.05],
  wacc: 0.09, terminalGrowth: 0.025, netDebt: 100, sharesOutstanding: 100
};

function EquityWorkbench() {
  const [query, setQuery] = useState("");
  const [matches, setMatches] = useState<YahooSearchResult[]>([]);
  const [snapshot, setSnapshot] = useState<YahooEquitySnapshot | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [dcf, setDcf] = useState(initialDcf);
  const [riskFree] = useState(0.043);
  const [marketPremium] = useState(0.055);
  const [debtCost] = useState(0.055);
  const [dividendGrowth, setDividendGrowth] = useState(0.03);
  const [requiredReturn, setRequiredReturn] = useState(0.09);

  const result = useMemo(() => { try { return { value: discountedCashFlow(dcf), error: "" }; } catch (caught) { return { value: null, error: caught instanceof Error ? caught.message : "Invalid inputs." }; } }, [dcf]);
  const reverseGrowth = useMemo(() => { if (!snapshot?.price) return null; try { const { revenueGrowth: _, ...base } = dcf; return reverseDcfGrowth(base, snapshot.price); } catch { return null; } }, [dcf, snapshot]);
  const dividendValue = useMemo(() => { if (!snapshot?.dividendRate) return null; try { return gordonGrowthDividendValue(snapshot.dividendRate, dividendGrowth, requiredReturn); } catch { return null; } }, [snapshot, dividendGrowth, requiredReturn]);

  const runSearch = async (event: FormEvent) => {
    event.preventDefault(); setLoading(true); setError("");
    try { setMatches(await searchYahoo(query)); } catch (caught) { setError(caught instanceof Error ? caught.message : "Search failed."); }
    finally { setLoading(false); }
  };

  const loadSymbol = async (symbol: string) => {
    setLoading(true); setError(""); setMatches([]);
    try {
      const next = await getYahooSnapshot(symbol); setSnapshot(next); setQuery(next.symbol);
      const revenue = next.revenue ? next.revenue / 1_000_000 : dcf.revenue;
      const ebitMargin = next.revenue && next.ebitda ? Math.min(0.8, Math.max(-0.5, next.ebitda / next.revenue)) : dcf.ebitMargin;
      const marketCap = next.marketCap ? next.marketCap / 1_000_000 : 0;
      const debt = next.totalDebt ? next.totalDebt / 1_000_000 : 0;
      const beta = next.beta ?? 1;
      const equityCost = costOfEquity(riskFree, beta, marketPremium);
      const wacc = marketCap + debt > 0 ? calculateWacc({ marketCap, debt, costOfEquity: equityCost, costOfDebt: debtCost, taxRate: dcf.taxRate }) : dcf.wacc;
      setDcf((current) => ({ ...current, revenue, ebitMargin, sharesOutstanding: next.sharesOutstanding ? next.sharesOutstanding / 1_000_000 : current.sharesOutstanding, netDebt: ((next.totalDebt ?? 0) - (next.totalCash ?? 0)) / 1_000_000, wacc }));
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Could not load ticker."); }
    finally { setLoading(false); }
  };

  return <div className="stack">
    <section className="panel lookup"><div><p className="eyebrow">Live market inputs</p><h2>Yahoo Finance company lookup</h2><p>Search a listed company and use available public data to seed the valuation model.</p></div>
      <form onSubmit={runSearch}><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Ticker or company, e.g. AAPL" /><button disabled={loading}>{loading ? "Loading…" : "Search"}</button></form>
      {error && <p className="error">{error}</p>}
      {matches.length > 0 && <div className="matches">{matches.map((match) => <button key={match.symbol} onClick={() => loadSymbol(match.symbol)}><strong>{match.symbol}</strong><span>{match.name}</span><small>{match.exchange}</small></button>)}</div>}
      {snapshot && <div className="snapshot"><div><span>Company</span><strong>{snapshot.name}</strong></div><div><span>Price</span><strong>{snapshot.price ? money.format(snapshot.price) : "—"}</strong></div><div><span>Market cap</span><strong>{snapshot.marketCap ? compact.format(snapshot.marketCap) : "—"}</strong></div><div><span>Sector</span><strong>{snapshot.sector ?? "—"}</strong></div></div>}
    </section>

    <div className="model-grid">
      <section className="panel"><p className="eyebrow">Assumptions</p><h2>Discounted cash flow</h2><div className="fields">
        <NumberField label="Revenue" value={dcf.revenue} onChange={(revenue) => setDcf({ ...dcf, revenue })} suffix="m" />
        <NumberField label="EBIT margin" value={dcf.ebitMargin * 100} onChange={(value) => setDcf({ ...dcf, ebitMargin: value / 100 })} suffix="%" />
        <NumberField label="Tax rate" value={dcf.taxRate * 100} onChange={(value) => setDcf({ ...dcf, taxRate: value / 100 })} suffix="%" />
        <NumberField label="D&A / revenue" value={dcf.depreciationPctRevenue * 100} onChange={(value) => setDcf({ ...dcf, depreciationPctRevenue: value / 100 })} suffix="%" />
        <NumberField label="Capex / revenue" value={dcf.capexPctRevenue * 100} onChange={(value) => setDcf({ ...dcf, capexPctRevenue: value / 100 })} suffix="%" />
        <NumberField label="Change NWC / revenue" value={dcf.changeNwcPctRevenue * 100} onChange={(value) => setDcf({ ...dcf, changeNwcPctRevenue: value / 100 })} suffix="%" />
        <NumberField label="WACC" value={dcf.wacc * 100} onChange={(value) => setDcf({ ...dcf, wacc: value / 100 })} suffix="%" />
        <NumberField label="Terminal growth" value={dcf.terminalGrowth * 100} onChange={(value) => setDcf({ ...dcf, terminalGrowth: value / 100 })} suffix="%" />
        <NumberField label="Net debt" value={dcf.netDebt} onChange={(netDebt) => setDcf({ ...dcf, netDebt })} suffix="m" />
        <NumberField label="Shares outstanding" value={dcf.sharesOutstanding} onChange={(sharesOutstanding) => setDcf({ ...dcf, sharesOutstanding })} suffix="m" />
      </div><h3>Revenue growth by year</h3><div className="growth-row">{dcf.revenueGrowth.map((growth, index) => <NumberField key={index} label={`Year ${index + 1}`} value={growth * 100} onChange={(value) => { const revenueGrowth = [...dcf.revenueGrowth]; revenueGrowth[index] = value / 100; setDcf({ ...dcf, revenueGrowth }); }} suffix="%" />)}</div></section>

      <aside className="panel result-card"><p className="eyebrow">Model output</p><h2>Implied valuation</h2>{result.error ? <p className="error">{result.error}</p> : result.value && <>
        <div className="hero-number"><span>Value per share</span><strong>{money.format(result.value.valuePerShare)}</strong></div>
        <dl><div><dt>Enterprise value</dt><dd>{money.format(result.value.enterpriseValue)}m</dd></div><div><dt>Equity value</dt><dd>{money.format(result.value.equityValue)}m</dd></div><div><dt>Terminal value share</dt><dd>{percent(result.value.terminalValueShare)}</dd></div>{snapshot?.price && <div><dt>Market price</dt><dd>{money.format(snapshot.price)}</dd></div>}</dl>
        {reverseGrowth !== null && <div className="callout"><span>Growth implied by market price</span><strong>{percent(reverseGrowth)}</strong><small>Constant five-year revenue growth, holding all other assumptions fixed.</small></div>}
      </>}</aside>
    </div>

    <section className="panel"><p className="eyebrow">Forecast audit trail</p><h2>Free cash flow projection</h2><div className="table-wrap"><table><thead><tr><th>Year</th><th>Revenue</th><th>EBIT</th><th>NOPAT</th><th>Unlevered FCF</th><th>Present value</th></tr></thead><tbody>{result.value?.projections.map((year) => <tr key={year.year}><td>{year.year}</td><td>{year.revenue.toFixed(1)}</td><td>{year.ebit.toFixed(1)}</td><td>{year.nopat.toFixed(1)}</td><td>{year.unleveredFcf.toFixed(1)}</td><td>{year.presentValue.toFixed(1)}</td></tr>)}</tbody></table></div></section>

    <section className="panel"><p className="eyebrow">Dividend cross-check</p><h2>Gordon growth model</h2><div className="inline-model"><NumberField label="Dividend growth" value={dividendGrowth * 100} onChange={(value) => setDividendGrowth(value / 100)} suffix="%" /><NumberField label="Required return" value={requiredReturn * 100} onChange={(value) => setRequiredReturn(value / 100)} suffix="%" /><div className="mini-result"><span>Dividend value</span><strong>{dividendValue === null ? "Load a dividend payer" : money.format(dividendValue)}</strong></div></div></section>
  </div>;
}

function BondWorkbench() {
  const [faceValue, setFaceValue] = useState(1000); const [couponRate, setCouponRate] = useState(5); const [marketPrice, setMarketPrice] = useState(950); const [years, setYears] = useState(7); const [frequency, setFrequency] = useState(2);
  const result = useMemo(() => { try { return analyseBond({ faceValue, couponRate: couponRate / 100, marketPrice, yearsToMaturity: years, paymentsPerYear: frequency }); } catch { return null; } }, [faceValue, couponRate, marketPrice, years, frequency]);
  return <div className="model-grid"><section className="panel"><p className="eyebrow">Fixed income engine</p><h2>Bond analytics</h2><div className="fields"><NumberField label="Face value" value={faceValue} onChange={setFaceValue} /><NumberField label="Coupon rate" value={couponRate} onChange={setCouponRate} suffix="%" /><NumberField label="Market price" value={marketPrice} onChange={setMarketPrice} /><NumberField label="Years to maturity" value={years} onChange={setYears} /><NumberField label="Payments per year" value={frequency} onChange={setFrequency} step="1" /></div></section><aside className="panel result-card"><p className="eyebrow">Model output</p><h2>Rate and risk measures</h2>{result && <dl><div><dt>Yield to maturity</dt><dd>{percent(result.yieldToMaturity)}</dd></div><div><dt>Current yield</dt><dd>{percent(result.currentYield)}</dd></div><div><dt>Macaulay duration</dt><dd>{result.macaulayDuration.toFixed(3)} yrs</dd></div><div><dt>Modified duration</dt><dd>{result.modifiedDuration.toFixed(3)} yrs</dd></div><div><dt>Convexity</dt><dd>{result.convexity.toFixed(3)}</dd></div><div><dt>DV01</dt><dd>{money.format(result.dv01)}</dd></div></dl>}</aside></div>;
}

function PortfolioWorkbench() {
  const [riskFree, setRiskFree] = useState(4); const [equityWeight, setEquityWeight] = useState(60); const [equityReturn, setEquityReturn] = useState(9); const [equityVol, setEquityVol] = useState(18); const [bondReturn, setBondReturn] = useState(5); const [bondVol, setBondVol] = useState(7); const [correlation, setCorrelation] = useState(0.2);
  const result = useMemo(() => analysePortfolio([{ name: "Equities", weight: equityWeight / 100, expectedReturn: equityReturn / 100, volatility: equityVol / 100 }, { name: "Bonds", weight: 1 - equityWeight / 100, expectedReturn: bondReturn / 100, volatility: bondVol / 100 }], [[1, correlation], [correlation, 1]], riskFree / 100), [riskFree, equityWeight, equityReturn, equityVol, bondReturn, bondVol, correlation]);
  return <div className="model-grid"><section className="panel"><p className="eyebrow">Portfolio risk engine</p><h2>Two-asset portfolio</h2><div className="fields"><NumberField label="Equity weight" value={equityWeight} onChange={setEquityWeight} suffix="%" /><NumberField label="Equity return" value={equityReturn} onChange={setEquityReturn} suffix="%" /><NumberField label="Equity volatility" value={equityVol} onChange={setEquityVol} suffix="%" /><NumberField label="Bond return" value={bondReturn} onChange={setBondReturn} suffix="%" /><NumberField label="Bond volatility" value={bondVol} onChange={setBondVol} suffix="%" /><NumberField label="Correlation" value={correlation} onChange={setCorrelation} step="0.05" /><NumberField label="Risk-free rate" value={riskFree} onChange={setRiskFree} suffix="%" /></div></section><aside className="panel result-card"><p className="eyebrow">Model output</p><h2>Risk / return</h2><div className="hero-number"><span>Expected return</span><strong>{percent(result.expectedReturn)}</strong></div><dl><div><dt>Volatility</dt><dd>{percent(result.volatility)}</dd></div><div><dt>Sharpe ratio</dt><dd>{result.sharpeRatio?.toFixed(2) ?? "—"}</dd></div><div><dt>95% annual VaR</dt><dd>{percent(result.annualValueAtRisk)}</dd></div></dl></aside></div>;
}

export default function App() {
  const [tab, setTab] = useState<Tab>("equity");
  return <><header><div className="brand"><div className="mark">FM</div><div><strong>Financial Model</strong><span>Calculation Engines</span></div></div><nav>{(["equity", "bond", "portfolio"] as Tab[]).map((item) => <button key={item} className={tab === item ? "active" : ""} onClick={() => setTab(item)}>{item === "equity" ? "Equity valuation" : item === "bond" ? "Fixed income" : "Portfolio risk"}</button>)}</nav></header><main><div className="intro"><p className="eyebrow">Standalone analyst workbench</p><h1>{tab === "equity" ? "Equity valuation" : tab === "bond" ? "Fixed-income analytics" : "Portfolio risk"}</h1><p>Reusable financial calculation engines separated from application-specific data, permissions and workflow.</p></div>{tab === "equity" ? <EquityWorkbench /> : tab === "bond" ? <BondWorkbench /> : <PortfolioWorkbench />}</main><footer>For analytical and educational use. Validate assumptions and outputs independently before making investment decisions.</footer></>;
}
