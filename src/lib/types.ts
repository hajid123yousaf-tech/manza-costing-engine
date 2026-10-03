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
  /** Scopes this size to one cost sheet. Legacy rows with null are unused leftovers. */
  cost_sheet_id: string | null;
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
  /** When true, this item's rate differs per size — see CostSheetItemSizeRate. */
  varies_by_size: boolean;
}

/** One (item, size) rate override, used only when the item's varies_by_size is true. */
export interface CostSheetItemSizeRate {
  id: string;
  cost_sheet_item_id: string;
  size_id: string;
  rate: number;
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
  /** "HH:MM:SS", or null to use the company policy shift. */
  shift_start: string | null;
  /** "HH:MM:SS", or null to use the company policy shift. */
  shift_end: string | null;
  time_tracking_enabled: boolean;
  /** Daily grace period, in minutes, before a late check-in counts toward short-time deduction. */
  grace_minutes: number;
  /** Whether Sunday work counts as overtime for this employee. */
  sunday_overtime: boolean;
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

/** "repaid" is the DB/internal value (unchanged); user-facing copy always calls it a salary deduction, never a repayment — the employee doesn't pay cash back. */
export const ADVANCE_TYPES: { value: AdvanceType; label: string }[] = [
  { value: "given", label: "Given" },
  { value: "repaid", label: "Deducted" },
];

/* ---------- Company duty time policy ---------- */

export type UndertimeMode = "ignore_if_within" | "excess_only";
export type SundayMode = "hourly_ot" | "extra_day" | "beyond_threshold";

/** Single-row table (id = 1) holding the company-wide duty time rules. */
export interface CompanyPolicy {
  id: number;
  /** "HH:MM:SS" */
  shift_start: string;
  /** "HH:MM:SS" */
  shift_end: string;
  standard_hours: number;
  overtime_threshold_hours: number;
  overtime_multiplier: number;
  undertime_tolerance_minutes: number;
  undertime_mode: UndertimeMode;
  sunday_paid_leave: boolean;
  sunday_mode: SundayMode;
  days_basis: number;
  updated_at: string;
}

/** Used when the company_policy row (id = 1) is missing. */
export const DEFAULT_COMPANY_POLICY: CompanyPolicy = {
  id: 1,
  shift_start: "08:00:00",
  shift_end: "17:00:00",
  standard_hours: 9,
  overtime_threshold_hours: 9,
  overtime_multiplier: 1.5,
  undertime_tolerance_minutes: 30,
  undertime_mode: "ignore_if_within",
  sunday_paid_leave: true,
  sunday_mode: "hourly_ot",
  days_basis: 30,
  updated_at: "",
};

export const UNDERTIME_MODES: { value: UndertimeMode; label: string }[] = [
  {
    value: "ignore_if_within",
    label: "Ignore if within tolerance, deduct full shortfall if exceeded",
  },
  {
    value: "excess_only",
    label: "Ignore the first N minutes, deduct only the excess",
  },
];

export const SUNDAY_MODES: { value: SundayMode; label: string }[] = [
  { value: "hourly_ot", label: "All Sunday hours as overtime" },
  { value: "extra_day", label: "One extra day at daily rate" },
  { value: "beyond_threshold", label: "Only hours beyond the threshold as overtime" },
];
