/** Any 3-letter code present in the exchange_rates table. PKR is always the fixed base. */
export type CurrencyCode = string;

/** The original four, kept only to fix their display order ahead of any newly added currencies. */
const LEGACY_CURRENCY_ORDER = ["PKR", "USD", "EUR", "GBP"];

/** Sorts currency codes: the original PKR/USD/EUR/GBP order first, then any others alphabetically. */
export function sortCurrencyCodes(codes: CurrencyCode[]): CurrencyCode[] {
  return Array.from(new Set(codes)).sort((a, b) => {
    const ia = LEGACY_CURRENCY_ORDER.indexOf(a);
    const ib = LEGACY_CURRENCY_ORDER.indexOf(b);
    if (ia !== -1 || ib !== -1) {
      if (ia === -1) return 1;
      if (ib === -1) return -1;
      return ia - ib;
    }
    return a.localeCompare(b);
  });
}

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

/* ---------- Attendance & Salary ---------- */

export type PayType = "monthly" | "daily";
export type StaffCategory = "office" | "labour";
export type AttendanceStatus = "present" | "absent" | "leave" | "half_day";
export type Shift = "day" | "night";
export type AdvanceType = "given" | "repaid";
export type SalaryPeriodStatus = "draft" | "finalized";

export interface Employee {
  id: string;
  employee_code: number;
  name: string;
  designation: string | null;
  pay_type: PayType;
  monthly_salary: number | null;
  daily_wage: number | null;
  staff_category: StaffCategory;
  /** "HH:MM:SS" */
  shift_start: string;
  /** "HH:MM:SS" */
  shift_end: string;
  time_tracking_enabled: boolean;
  is_active: boolean;
  created_at: string;
}

export interface AttendanceRecord {
  id: string;
  employee_id: string;
  /** ISO date, "YYYY-MM-DD" */
  date: string;
  status: AttendanceStatus;
  check_in: string | null;
  check_out: string | null;
  shift: Shift | null;
  notes: string | null;
  created_at: string;
}

export interface AdvanceTransaction {
  id: string;
  employee_id: string;
  date: string;
  type: AdvanceType;
  amount: number;
  notes: string | null;
  created_at: string;
}

export interface SalaryPeriod {
  id: string;
  /** First-of-month date, "YYYY-MM-01" */
  period_month: string;
  status: SalaryPeriodStatus;
  created_at: string;
}

export interface SalaryLine {
  id: string;
  period_id: string;
  employee_id: string;
  base_pay: number;
  per_day_rate: number;
  leave_days: number;
  deduction_days: number;
  gross_salary: number;
  overtime_amount: number;
  mess_allowance: number;
  advance_repayment: number;
  short_time_deduction: number;
  net_salary: number;
  final_salary: number;
  remarks: string | null;
}

export const STAFF_CATEGORIES: { value: StaffCategory; label: string }[] = [
  { value: "office", label: "Office" },
  { value: "labour", label: "Labour" },
];

export const PAY_TYPES: { value: PayType; label: string }[] = [
  { value: "monthly", label: "Monthly" },
  { value: "daily", label: "Daily" },
];

export const ATTENDANCE_STATUSES: { value: AttendanceStatus; label: string }[] = [
  { value: "present", label: "Present" },
  { value: "absent", label: "Absent" },
  { value: "leave", label: "Leave" },
  { value: "half_day", label: "Half Day" },
];

export const SHIFTS: { value: Shift; label: string }[] = [
  { value: "day", label: "Day" },
  { value: "night", label: "Night" },
];

export const ADVANCE_TYPES: { value: AdvanceType; label: string }[] = [
  { value: "given", label: "Given" },
  { value: "repaid", label: "Repaid" },
];

/** Default shift times per staff category — editable per employee. */
export const DEFAULT_SHIFT_TIMES: Record<
  StaffCategory,
  { start: string; end: string }
> = {
  office: { start: "08:30", end: "18:00" },
  labour: { start: "08:00", end: "18:00" },
};
