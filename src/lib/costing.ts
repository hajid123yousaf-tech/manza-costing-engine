import type { CurrencyCode } from "./types";

/** A value-add / cost item as used by the calculator. */
export interface CalcItem {
  id: string;
  name: string;
  unit: string;
  rate: number;
  sort_order: number;
  /** When true, use `sizeRates[sizeId]` (default 0) instead of the flat `rate`. */
  variesBySize?: boolean;
  sizeRates?: Record<string, number>;
}

/** The rate an item contributes for a specific size, honoring variesBySize. */
export function rateForSize(item: CalcItem, sizeId: string): number {
  if (!item.variesBySize) return item.rate;
  return item.sizeRates?.[sizeId] ?? 0;
}

/**
 * A fabric category (imported or local) reduced to what the calculator needs:
 * a total cost per reference unit (sum of its build-up component rates) and a
 * consumption quantity per size.
 */
export interface FabricCategoryCost {
  /** sum of the category's cost-component rates, in PKR per unit */
  totalPerUnit: number;
  /** consumption[sizeId] = quantity in this category's unit */
  consumption: Record<string, number>;
}

export interface ItemContribution {
  id: string;
  name: string;
  unit: string;
  rate: number;
  /** Amount added to the running subtotal for this size, in PKR. */
  amount: number;
}

export interface SizeCost {
  sizeId: string;
  /** imported total per unit x imported consumption for this size */
  importedCost: number;
  /** local total per unit x local consumption for this size */
  localCost: number;
  /** importedCost + localCost */
  materialCost: number;
  /** value-add contributions applied in sort_order */
  itemContributions: ItemContribution[];
  /** materialCost + every value-add amount */
  totalPkr: number;
  /** totalPkr / rate_to_pkr[displayCurrency] */
  totalDisplay: number;
}

export function isPercentUnit(unit: string): boolean {
  return unit.trim().toLowerCase() === "percent";
}

export function sumRates(components: { rate: number }[]): number {
  return components.reduce((s, c) => s + (Number(c.rate) || 0), 0);
}

/**
 * Compute the full cost of one size.
 *
 * material_cost(size) =
 *   (imported total per unit x imported consumption[size])
 * + (local total per unit x local consumption[size])
 *
 * Then apply value-add items in sort_order:
 *   - unit "percent": add (rate / 100) x running subtotal
 *   - otherwise: add rate as a flat amount
 * total_cost_pkr(size)     = material_cost + all value-add amounts
 * total_cost_display(size) = total_cost_pkr / rate_to_pkr[displayCurrency]
 */
export function computeSizeCost(
  sizeId: string,
  imported: FabricCategoryCost,
  local: FabricCategoryCost,
  items: CalcItem[],
  rateToPkr: number,
): SizeCost {
  const importedCost =
    imported.totalPerUnit * (imported.consumption[sizeId] ?? 0);
  const localCost = local.totalPerUnit * (local.consumption[sizeId] ?? 0);
  const materialCost = importedCost + localCost;

  const ordered = [...items].sort((a, b) => a.sort_order - b.sort_order);
  let running = materialCost;
  const itemContributions: ItemContribution[] = ordered.map((it) => {
    const rate = rateForSize(it, sizeId);
    const amount = isPercentUnit(it.unit) ? (rate / 100) * running : rate;
    running += amount;
    return { id: it.id, name: it.name, unit: it.unit, rate, amount };
  });

  const totalPkr = running;
  const safeRate = rateToPkr > 0 ? rateToPkr : 1;

  return {
    sizeId,
    importedCost,
    localCost,
    materialCost,
    itemContributions,
    totalPkr,
    totalDisplay: totalPkr / safeRate,
  };
}

export function rateForCurrency(
  rates: { currency_code: string; rate_to_pkr: number }[],
  currency: CurrencyCode,
): number {
  if (currency === "PKR") return 1;
  return rates.find((r) => r.currency_code === currency)?.rate_to_pkr ?? 1;
}
