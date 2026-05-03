export const CURRENCIES = [
  "USD","EUR","GBP","JPY","IDR","SGD","AUD","CAD","CNY","INR","KRW","THB","MYR","PHP","BRL","MXN","CHF","SEK","NOK","NZD"
] as const;

export type CurrencyCode = (typeof CURRENCIES)[number];

export const SIMOLEON_BASE_RATE = 11.5;

const fallbackRates: Record<CurrencyCode, number> = {
  USD: 1,
  EUR: 0.91,
  GBP: 0.78,
  JPY: 152,
  IDR: 16200,
  SGD: 1.34,
  AUD: 1.53,
  CAD: 1.39,
  CNY: 7.22,
  INR: 83.5,
  KRW: 1380,
  THB: 36.7,
  MYR: 4.52,
  PHP: 57.3,
  BRL: 5.24,
  MXN: 18.1,
  CHF: 0.89,
  SEK: 10.6,
  NOK: 10.9,
  NZD: 1.69
};

export async function getRates(base: CurrencyCode) {
  try {
    const res = await fetch(`https://api.frankfurter.dev/v1/latest?base=${base}`);
    if (!res.ok) throw new Error("Rate API unavailable");
    const json = await res.json() as { rates: Record<string, number> };
    return json.rates;
  } catch {
    const baseToUsd = 1 / fallbackRates[base];
    return Object.fromEntries(
      CURRENCIES.map((code) => [code, fallbackRates[code] * baseToUsd])
    );
  }
}

export function toSimoleon(amount: number, fromRate: number) {
  const usd = amount / fromRate;
  return usd * SIMOLEON_BASE_RATE;
}

export function fromSimoleon(simoleon: number, toRate: number) {
  const usd = simoleon / SIMOLEON_BASE_RATE;
  return usd * toRate;
}

export function formatCurrency(value: number, code: string) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: code, maximumFractionDigits: 2 }).format(value);
}
