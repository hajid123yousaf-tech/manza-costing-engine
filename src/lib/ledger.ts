import { isPercentUnit, type SizeCost } from "./costing";
import { FABRIC_CATEGORIES, type FabricType } from "./types";

/** A fabric category's cost build-up, as shown in a right-hand ledger table. */
export interface LedgerCategory {
  type: FabricType;
  /** "IMPORTED" / "LOCAL" */
  label: string;
  /** reference unit, upper-cased: "METER" */
  unit: string;
  components: { name: string; rate: number; isPercent: boolean }[];
  totalPerUnit: number;
}

export interface LedgerFabricPair {
  /** "" when only one category is used, otherwise "IMPORTED" / "LOCAL" */
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
  eurRate: number;
  totalEur: number;
}

export interface LedgerData {
  /** only the fabric categories actually used on the sheet (for the right tables) */
  categories: LedgerCategory[];
  /** one block per active size */
  blocks: LedgerSizeBlock[];
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
  /** aligned with `sizes` */
  sizeCosts: SizeCost[];
  rates: { currency_code: string; rate_to_pkr: number }[];
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

function isPercentComponent(name: string): boolean {
  return /wastage/i.test(name) || name.includes("%");
}

export function buildLedger(input: LedgerInput): LedgerData {
  const eurRate =
    input.rates.find((r) => r.currency_code === "EUR")?.rate_to_pkr ?? 0;

  const usedTypes = FABRIC_CATEGORIES.filter(
    (c) => input.categoryTotal[c.type] !== 0,
  ).map((c) => c.type);
  const both = usedTypes.length === 2;

  const categories: LedgerCategory[] = usedTypes.map((type) => ({
    type,
    label: type.toUpperCase(),
    unit: (input.fabricUnit[type] || "unit").toUpperCase(),
    components: input.fabric
      .filter((f) => f.fabricType === type)
      .map((f) => {
        const name = f.name || "Untitled";
        return { name, rate: f.rate, isPercent: isPercentComponent(name) };
      }),
    totalPerUnit: input.categoryTotal[type],
  }));

  const dateStr = formatDdMmYyyy(input.createdAt);

  const blocks: LedgerSizeBlock[] = input.sizes.map((s, i) => {
    const sc = input.sizeCosts[i];
    const fabricPairs: LedgerFabricPair[] = usedTypes.map((type) => ({
      label: both ? type.toUpperCase() : "",
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
      eurRate,
      totalEur: eurRate > 0 ? sc.totalPkr / eurRate : 0,
    };
  });

  return { categories, blocks };
}
