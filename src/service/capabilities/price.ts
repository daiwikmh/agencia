export async function coinPrice(ids: string, vs: string) {
  const coins = (ids || "bitcoin,ethereum,hedera-hashgraph")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)
    .slice(0, 25)
    .join(",");
  const quote = (vs || "usd").toLowerCase();
  const res = await fetch(
    `https://api.coingecko.com/api/v3/simple/price?ids=${encodeURIComponent(coins)}&vs_currencies=${encodeURIComponent(quote)}&include_24hr_change=true`,
    { signal: AbortSignal.timeout(8000) },
  );
  if (!res.ok) throw new Error(`coingecko ${res.status}`);
  const data = (await res.json()) as Record<string, Record<string, number>>;
  return {
    vs: quote,
    prices: Object.entries(data).map(([id, row]) => ({
      id,
      price: row[quote] ?? null,
      change24h: row[`${quote}_24h_change`] ?? null,
    })),
    at: new Date().toISOString(),
  };
}

export async function hbarPrice(vs: string) {
  const quote = (vs || "usd").toLowerCase();
  const res = await fetch(
    `https://api.coingecko.com/api/v3/simple/price?ids=hedera-hashgraph&vs_currencies=${encodeURIComponent(quote)}&include_market_cap=true&include_24hr_change=true&include_last_updated_at=true`,
    { signal: AbortSignal.timeout(8000) },
  );
  if (!res.ok) throw new Error(`coingecko ${res.status}`);
  const data = (await res.json()) as Record<string, Record<string, number>>;
  const row = data["hedera-hashgraph"];
  if (!row || row[quote] == null) throw new Error(`no HBAR price for ${quote}`);
  return {
    asset: "HBAR",
    vs: quote,
    price: row[quote],
    marketCap: row[`${quote}_market_cap`] ?? null,
    change24h: row[`${quote}_24h_change`] ?? null,
    at: new Date().toISOString(),
  };
}
