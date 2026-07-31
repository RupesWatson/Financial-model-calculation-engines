export type YahooSearchResult = { symbol: string; name: string; exchange?: string; type?: string };
export type YahooEquitySnapshot = {
  symbol: string;
  name: string;
  currency?: string;
  exchange?: string;
  price?: number;
  marketCap?: number;
  sharesOutstanding?: number;
  totalDebt?: number;
  totalCash?: number;
  revenue?: number;
  ebitda?: number;
  beta?: number;
  dividendRate?: number;
  trailingEps?: number;
  forwardPe?: number;
  sector?: string;
  industry?: string;
  summary?: string;
};

async function getJson<T>(url: string): Promise<T> {
  const response = await fetch(url);
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error((payload as { error?: string }).error ?? `Request failed with status ${response.status}.`);
  return payload as T;
}

export const searchYahoo = (query: string) => getJson<YahooSearchResult[]>(`/api/yahoo/search?q=${encodeURIComponent(query)}`);
export const getYahooSnapshot = (symbol: string) => getJson<YahooEquitySnapshot>(`/api/yahoo/equity/${encodeURIComponent(symbol)}`);
