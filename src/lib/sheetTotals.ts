import { supabase } from "./supabase";
import {
  computeSizeCost,
  rateForCurrency,
  sumRates,
  type FabricCategoryCost,
} from "./costing";
import type { CurrencyCode, FabricType } from "./types";

export interface SheetTotal {
  /** Highest total across the sheet's sizes, in PKR. */
  maxTotalPkr: number;
  /** Same figure converted to the sheet's display currency. */
  maxTotalDisplay: number;
  /** Lowest total across sizes, in the display currency. */
  minTotalDisplay: number;
  currency: CurrencyCode;
  sizeCount: number;
}

/**
 * Load every dependency for a set of cost sheets in bulk and return the
 * computed cost range per sheet. Used by the dashboard and the list view.
 */
export async function loadSheetTotals(
  sheets: { id: string; display_currency: CurrencyCode }[],
): Promise<Record<string, SheetTotal>> {
  const ids = sheets.map((s) => s.id);
  const out: Record<string, SheetTotal> = {};
  for (const s of sheets) {
    out[s.id] = {
      maxTotalPkr: 0,
      maxTotalDisplay: 0,
      minTotalDisplay: 0,
      currency: s.display_currency,
      sizeCount: 0,
    };
  }
  if (ids.length === 0) return out;

  const [rmRes, consRes, itemRes, sizeRes, rateRes] = await Promise.all([
    supabase
      .from("cost_sheet_raw_materials")
      .select("cost_sheet_id, rate, fabric_type")
      .in("cost_sheet_id", ids),
    supabase
      .from("cost_sheet_fabric_consumption")
      .select("cost_sheet_id, fabric_type, size_id, consumption")
      .in("cost_sheet_id", ids),
    supabase
      .from("cost_sheet_items")
      .select("id, cost_sheet_id, name, unit, rate, sort_order, varies_by_size")
      .in("cost_sheet_id", ids),
    supabase.from("sizes").select("id, is_active").eq("is_active", true),
    supabase.from("exchange_rates").select("currency_code, rate_to_pkr"),
  ]);

  const components = rmRes.data ?? [];
  const fabricConsumption = consRes.data ?? [];
  const items = itemRes.data ?? [];
  const activeSizeIds = (sizeRes.data ?? []).map((s) => s.id as string);
  const rates = (rateRes.data ?? []) as {
    currency_code: string;
    rate_to_pkr: number;
  }[];

  const variesItemIds = items
    .filter((i) => i.varies_by_size)
    .map((i) => i.id as string);
  const sizeRateRes = variesItemIds.length
    ? await supabase
        .from("cost_sheet_item_size_rates")
        .select("cost_sheet_item_id, size_id, rate")
        .in("cost_sheet_item_id", variesItemIds)
    : { data: [] as { cost_sheet_item_id: string; size_id: string; rate: number }[] };
  const sizeRatesByItem = new Map<string, Record<string, number>>();
  for (const r of sizeRateRes.data ?? []) {
    const map = sizeRatesByItem.get(r.cost_sheet_item_id as string) ?? {};
    map[r.size_id as string] = Number(r.rate);
    sizeRatesByItem.set(r.cost_sheet_item_id as string, map);
  }

  for (const sheet of sheets) {
    const category = (type: FabricType): FabricCategoryCost => {
      const totalPerUnit = sumRates(
        components.filter(
          (c) => c.cost_sheet_id === sheet.id && c.fabric_type === type,
        ),
      );
      const consumption: Record<string, number> = {};
      for (const c of fabricConsumption) {
        if (c.cost_sheet_id === sheet.id && c.fabric_type === type) {
          consumption[c.size_id as string] = Number(c.consumption);
        }
      }
      return { totalPerUnit, consumption };
    };

    const imported = category("imported");
    const local = category("local");

    const sheetItems = items
      .filter((i) => i.cost_sheet_id === sheet.id)
      .map((i) => ({
        id: i.id as string,
        name: i.name as string,
        unit: i.unit as string,
        rate: Number(i.rate),
        sort_order: Number(i.sort_order),
        variesBySize: Boolean(i.varies_by_size),
        sizeRates: sizeRatesByItem.get(i.id as string) ?? {},
      }));

    const rateToPkr = rateForCurrency(rates, sheet.display_currency);

    const totals = activeSizeIds.map(
      (sizeId) =>
        computeSizeCost(sizeId, imported, local, sheetItems, rateToPkr).totalPkr,
    );

    const maxPkr = totals.length ? Math.max(...totals) : 0;
    const minPkr = totals.length ? Math.min(...totals) : 0;

    out[sheet.id] = {
      maxTotalPkr: maxPkr,
      maxTotalDisplay: maxPkr / (rateToPkr > 0 ? rateToPkr : 1),
      minTotalDisplay: minPkr / (rateToPkr > 0 ? rateToPkr : 1),
      currency: sheet.display_currency,
      sizeCount: totals.length,
    };
  }

  return out;
}
