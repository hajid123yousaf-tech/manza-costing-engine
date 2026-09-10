import type { CurrencyCode } from "./types";

const NBSP = " ";

export function formatMoney(
  amount: number,
  currency: CurrencyCode,
  opts: { decimals?: number } = {},
): string {
  const decimals = opts.decimals ?? (currency === "PKR" ? 0 : 2);
  const value = Number.isFinite(amount) ? amount : 0;
  const formatted = value.toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
  return `${currency}${NBSP}${formatted}`;
}

export function formatNumber(value: number, decimals = 2): string {
  const v = Number.isFinite(value) ? value : 0;
  return v.toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: decimals,
  });
}

export function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export function formatDateTime(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function serial(n: number): string {
  return `#${String(n).padStart(4, "0")}`;
}
