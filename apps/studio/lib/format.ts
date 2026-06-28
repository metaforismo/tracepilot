export function formatPercent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

export function formatUsd(value: number): string {
  return new Intl.NumberFormat("en-US", {
    currency: "USD",
    maximumFractionDigits: 6,
    minimumFractionDigits: 6,
    style: "currency"
  }).format(value);
}

export function formatUsdCompact(value: number): string {
  return `$${value.toFixed(6)}`;
}

export function formatNumber(value: number): string {
  return new Intl.NumberFormat("en-US").format(value);
}

export function formatInteger(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

export function yesNo(value: boolean): string {
  return value ? "yes" : "no";
}

export function shortDate(value: string): string {
  return value.slice(0, 10);
}