export type CurrencyCode = "PKR" | "USD" | "EUR" | "GBP";
export const CURRENCIES: CurrencyCode[] = ["PKR", "USD", "EUR", "GBP"];

export type SheetStatus = "draft" | "archived";

export type FabricType = "imported" | "local";
export const FABRIC_UNITS = ["meter", "kg", "yard"];

export const FABRIC_CATEGORIES: { type: FabricType; title: string }[] = [
  { type: "imported", title: "Imported fabric" },
  { type: "local", title: "Local fabric" },
];

export interface Size {
  id: string;
  name: string;
  sort_order: number;
  is_active: boolean;
  created_at: string;
}

export interface Product {
  id: string;
  name: string;
  cutting_rate: number;
  stitching_rate: number;
  threading_rate: number;
  packing_rate: number;
  is_active: boolean;
  sort_order: number;
  created_at: string;
}

/** The four cost fields a product carries, in the order they apply. */
export const PRODUCT_COST_FIELDS = [
  { key: "cutting_rate", label: "Cutting" },
  { key: "stitching_rate", label: "Stitching" },
  { key: "threading_rate", label: "Threading" },
  { key: "packing_rate", label: "Packing" },
] as const;

export interface ExchangeRate {
  id: string;
  currency_code: CurrencyCode;
  rate_to_pkr: number;
  updated_at: string;
}

export interface CostSheet {
  id: string;
  serial_number: number;
  title: string;
  customer_name: string | null;
  order_ref: string | null;
  display_currency: CurrencyCode;
  status: SheetStatus;
  notes: string | null;
  imported_fabric_unit: string;
  local_fabric_unit: string;
  created_at: string;
  updated_at: string;
}

/** A single cost component inside a fabric category's build-up ledger. */
export interface CostSheetRawMaterial {
  id: string;
  cost_sheet_id: string;
  name: string;
  rate: number;
  sort_order: number;
  fabric_type: FabricType;
}

/** One consumption figure per (sheet, fabric category, size). */
export interface CostSheetFabricConsumption {
  id: string;
  cost_sheet_id: string;
  fabric_type: FabricType;
  size_id: string;
  consumption: number;
}

export interface CostSheetItem {
  id: string;
  cost_sheet_id: string;
  source_item_id: string | null;
  name: string;
  unit: string;
  rate: number;
  sort_order: number;
}
