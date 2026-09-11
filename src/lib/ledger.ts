import { isPercentUnit, type SizeCost } from "./costing";
import { FABRIC_CATEGORIES, type FabricType } from "./types";

/** A fabric category's cost build-up ("COSTING OF ... FABRIC PER ..."), shown once per sheet. */
export interface LedgerCategory {
  type: FabricType;
  /** "IMPORTED" / "LOCAL" */
  label: string;
  /** reference unit, upper-cased: "METER" */
  unit: string;
  components: { name: string; rate: number }[];
  totalPerUnit: number;
}

export interface LedgerFabricPair {
  /** "IMPORTED" / "LOCAL" — always shown, per category */
  label: string;
  /** consumption quantity for this size, in the category's unit */
  consumption: number;
  /** total-per-unit x consumption — the material cost contribution, PKR */
  fabricRate: number;
}

export interface LedgerSizeBlock {
  sizeName: string;
  /** created_at as DD.MM.YYYY */
  dateStr: string;
  title: string;
  fabricPairs: LedgerFabricPair[];
  /** one per value-add item: caps name + value (rate, or computed amount for percent items) */
  items: { name: string; value: number }[];
  /** material + all items, PKR */
  totalPkr: number;
  /** the sheet's own display_currency code, e.g. "PKR" / "USD" / any custom currency */
  displayCurrency: string;
  /** totalPkr converted with the sheet's display_currency rate — what the "TOTAL" row shows */
  totalDisplay: number;
  /** always EUR, regardless of display_currency — what the "EURO." row shows */
  eurRate: number;
  totalEur: number;
}

/** "unified" = one table, sizes as columns. "per-size" = one block per size, the original format. */
export type LedgerLayout = "unified" | "per-size";

export interface LedgerData {
  /** only the fabric categories actually used on the sheet (for the right tables) */
  categories: LedgerCategory[];
  /** one block per active size */
  blocks: LedgerSizeBlock[];
}

/** Unified layout paginates/tabs past this many size columns — never shrinks to fit. */
export const UNIFIED_GROUP_SIZE = 5;

export interface LedgerSizeGroup {
  blocks: LedgerSizeBlock[];
  /** e.g. "Sizes 1-5" */
  label: string;
  /** true for the first group only — that's where the shared fabric tables render */
  isFirst: boolean;
}

/** Split size blocks into fixed-size groups for the unified (sizes-as-columns) layout. */
export function groupBlocksForUnified(
  blocks: LedgerSizeBlock[],
  groupSize: number = UNIFIED_GROUP_SIZE,
): LedgerSizeGroup[] {
  const groups: LedgerSizeGroup[] = [];
  for (let i = 0; i < blocks.length; i += groupSize) {
    const chunk = blocks.slice(i, i + groupSize);
    groups.push({
      blocks: chunk,
      label: `Sizes ${i + 1}-${i + chunk.length}`,
      isFirst: i === 0,
    });
  }
  return groups;
}

export interface LedgerInput {
  createdAt: string | null;
  title: string;
  sizes: { id: string; name: string }[];
  fabric: { name: string; rate: number; fabricType: FabricType }[];
  fabricUnit: Record<FabricType, string>;
  fabricConsumption: Record<FabricType, Record<string, number>>;
  categoryTotal: Record<FabricType, number>;
  items: { name: string; unit: string; rate: number }[];
  /** aligned with `sizes`; totalDisplay already reflects the sheet's display_currency rate */
  sizeCosts: SizeCost[];
  rates: { currency_code: string; rate_to_pkr: number }[];
  /** the sheet's own display_currency, e.g. "PKR" / "USD" — drives the "TOTAL" row */
  displayCurrency: string;
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

export function formatDdMmYyyy(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()}`;
}

export function buildLedger(input: LedgerInput): LedgerData {
  const eurRate =
    input.rates.find((r) => r.currency_code === "EUR")?.rate_to_pkr ?? 0;

  const usedTypes = FABRIC_CATEGORIES.filter(
    (c) => input.categoryTotal[c.type] !== 0,
  ).map((c) => c.type);

  const categories: LedgerCategory[] = usedTypes.map((type) => ({
    type,
    label: type.toUpperCase(),
    unit: (input.fabricUnit[type] || "unit").toUpperCase(),
    components: input.fabric
      .filter((f) => f.fabricType === type)
      .map((f) => ({ name: f.name || "Untitled", rate: f.rate })),
    totalPerUnit: input.categoryTotal[type],
  }));

  const dateStr = formatDdMmYyyy(input.createdAt);

  const blocks: LedgerSizeBlock[] = input.sizes.map((s, i) => {
    const sc = input.sizeCosts[i];
    const fabricPairs: LedgerFabricPair[] = usedTypes.map((type) => ({
      label: type.toUpperCase(),
      consumption: input.fabricConsumption[type][s.id] ?? 0,
      fabricRate: type === "imported" ? sc.importedCost : sc.localCost,
    }));

    const items = input.items.map((it, idx) => ({
      name: (it.name || "Untitled").toUpperCase(),
      value: isPercentUnit(it.unit)
        ? sc.itemContributions[idx]?.amount ?? 0
        : it.rate,
    }));

    return {
      sizeName: s.name,
      dateStr,
      title: input.title || "Untitled cost sheet",
      fabricPairs,
      items,
      totalPkr: sc.totalPkr,
      displayCurrency: input.displayCurrency,
      totalDisplay: sc.totalDisplay,
      eurRate,
      totalEur: eurRate > 0 ? sc.totalPkr / eurRate : 0,
    };
  });

  return { categories, blocks };
}
