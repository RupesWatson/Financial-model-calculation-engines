import cors from "cors";
import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import YahooFinance from "yahoo-finance2";

const app = express();
const yahooFinance = new YahooFinance({ suppressNotices: ["yahooSurvey"] });
const port = Number(process.env.PORT ?? 8787);

app.use(cors());
app.use(express.json());

const numberOrUndefined = (value: unknown) => typeof value === "number" && Number.isFinite(value) ? value : undefined;
const stringOrUndefined = (value: unknown) => typeof value === "string" && value.length > 0 ? value : undefined;

app.get("/api/health", (_request, response) => response.json({ ok: true, provider: "yahoo-finance2" }));

app.get("/api/yahoo/search", async (request, response, next) => {
  try {
    const query = String(request.query.q ?? "").trim();
    if (query.length < 1) return response.status(400).json({ error: "Enter a company name or ticker." });
    const result = await yahooFinance.search(query, { quotesCount: 10, newsCount: 0 });
    const quotes = result.quotes
      .filter((item) => "symbol" in item && typeof item.symbol === "string")
      .map((item) => ({
        symbol: item.symbol,
        name: "longname" in item ? stringOrUndefined(item.longname) ?? ("shortname" in item ? stringOrUndefined(item.shortname) : undefined) ?? item.symbol : item.symbol,
        exchange: "exchange" in item ? stringOrUndefined(item.exchange) : undefined,
        type: "quoteType" in item ? stringOrUndefined(item.quoteType) : undefined
      }));
    return response.json(quotes);
  } catch (error) { return next(error); }
});

app.get("/api/yahoo/equity/:symbol", async (request, response, next) => {
  try {
    const symbol = request.params.symbol.toUpperCase().trim();
    const [quote, summary] = await Promise.all([
      yahooFinance.quote(symbol),
      yahooFinance.quoteSummary(symbol, { modules: ["assetProfile", "financialData", "defaultKeyStatistics", "summaryDetail"] })
    ]);
    const profile = summary.assetProfile;
    const financial = summary.financialData;
    const stats = summary.defaultKeyStatistics;
    const detail = summary.summaryDetail;
    return response.json({
      symbol: quote.symbol,
      name: quote.longName ?? quote.shortName ?? quote.symbol,
      currency: quote.currency,
      exchange: quote.fullExchangeName ?? quote.exchange,
      price: numberOrUndefined(quote.regularMarketPrice),
      marketCap: numberOrUndefined(quote.marketCap),
      sharesOutstanding: numberOrUndefined(stats?.sharesOutstanding),
      totalDebt: numberOrUndefined(financial?.totalDebt),
      totalCash: numberOrUndefined(financial?.totalCash),
      revenue: numberOrUndefined(financial?.totalRevenue),
      ebitda: numberOrUndefined(financial?.ebitda),
      beta: numberOrUndefined(stats?.beta),
      dividendRate: numberOrUndefined(detail?.dividendRate),
      trailingEps: numberOrUndefined(quote.epsTrailingTwelveMonths),
      forwardPe: numberOrUndefined(quote.forwardPE),
      sector: stringOrUndefined(profile?.sector),
      industry: stringOrUndefined(profile?.industry),
      summary: stringOrUndefined(profile?.longBusinessSummary)
    });
  } catch (error) { return next(error); }
});

app.use((error: unknown, _request: express.Request, response: express.Response, _next: express.NextFunction) => {
  const message = error instanceof Error ? error.message : "Unexpected Yahoo Finance error.";
  response.status(502).json({ error: message });
});

const directory = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.resolve(directory, "../dist");
app.use(express.static(webRoot));
app.get("/{*splat}", (_request, response) => response.sendFile(path.join(webRoot, "index.html")));

app.listen(port, () => console.log(`Analyst workbench server listening on http://localhost:${port}`));
