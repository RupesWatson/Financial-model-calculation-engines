# Financial Model Calculation Engines

A standalone analyst workbench containing the reusable calculation logic from the **Analyst** area of the Cairn family-office workspace. It is deliberately separated from Cairn's application shell, database, authentication, family data, research records and permissions.

## What is included

- Equity valuation: five-year unlevered DCF, WACC, reverse DCF and Gordon growth dividend valuation
- Fixed income: yield to maturity, current yield, Macaulay and modified duration, convexity and DV01
- Portfolio risk: expected return, covariance-based volatility, Sharpe ratio and parametric 95% annual value at risk
- Yahoo Finance lookup: company search and public market/fundamental data used to prefill the equity model
- Unit tests around the core calculation engines

## Architecture

The browser contains only the user interface and deterministic calculation functions. Yahoo Finance requests run through the small Express server because Yahoo's endpoints require server-side cookie/CORS handling.

```
React / Vite UI ── /api/yahoo/* ── Express server ── yahoo-finance2 ── Yahoo Finance
       │
       └── pure TypeScript calculation engines
```

## Run locally

Requires Node.js 20 or later.

```bash
npm install
npm run dev
```

Open [http://localhost:5173](http://localhost:5173). The Express API runs on port 8787 and Vite proxies `/api` calls to it.

## Build and test

```bash
npm test
npm run typecheck
npm run build
npm start
```

After `npm run build`, `npm start` serves the compiled UI and API together at [http://localhost:8787](http://localhost:8787).

## Important implementation notes

- All rates in the calculation layer are decimals: `0.09` means 9%.
- DCF monetary inputs must use one consistent unit. The interface uses millions for revenue, net debt and shares, which naturally produces a per-share value in whole currency units.
- Yahoo fields are not guaranteed for every ticker. Missing data remains editable and is not silently replaced with invented figures.
- `yahoo-finance2` is an unofficial community client for Yahoo Finance. Yahoo can change or restrict its endpoints, so treat the integration as a convenience rather than a guaranteed market-data service.
- Outputs are analytical aids, not investment advice. Validate model assumptions and results independently.

## Separation from Cairn

This repository is an adapted extraction, not a linked package or submodule. It contains no imports from the Cairn codebase and changing it cannot change the family-office application.

No licence has been assigned. Copyright remains with the repository owner.
