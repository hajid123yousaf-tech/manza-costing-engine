import { supabase } from "./supabase";
import {
  DEFAULT_COMPANY_POLICY,
  type AdvanceTransaction,
  type AttendanceRecord,
  type AttendanceStatus,
  type CompanyPolicy,
  type Employee,
} from "./types";

/** Round to 2dp, avoiding float noise (e.g. 12.000000000000002). */
export function round2(n: number): number {
  return Math.round((Number.isFinite(n) ? n : 0) * 100) / 100;
}

/** "YYYY-MM" (from an `<input type="month">`) -> first-of-month ISO date. */
export function monthInputToPeriod(monthInput: string): string {
  return `${monthInput}-01`;
}

/** First-of-month ISO date -> "YYYY-MM" for an `<input type="month">`. */
export function periodToMonthInput(period: string): string {
  return period.slice(0, 7);
}

export function currentMonthInput(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function daysInMonth(period: string): number {
  const [y, m] = period.split("-").map(Number);
  return new Date(y, m, 0).getDate();
}

/** Inclusive [start, end] ISO date range covering the whole period month. */
export function monthRange(period: string): { start: string; end: string } {
  const [y, m] = period.split("-").map(Number);
  const start = period.slice(0, 10);
  const end = `${y}-${String(m).padStart(2, "0")}-${String(daysInMonth(period)).padStart(2, "0")}`;
  return { start, end };
}

export function monthLabel(period: string): string {
  const [y, m] = period.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("en-GB", {
    month: "long",
    year: "numeric",
  });
}

/** "YYYY-MM-DD" -> "17 Sep 2026", built from date parts (not `new Date(iso)`) to avoid UTC-parse/local-render off-by-one. */
export function dateLabel(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

/** "HH:MM" or "HH:MM:SS" -> minutes since midnight. Null-safe. */
export function timeToMinutes(t: string | null | undefined): number | null {
  if (!t) return null;
  const [h, m] = t.split(":").map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return null;
  return h * 60 + m;
}

/** DB "HH:MM:SS" -> value an `<input type="time">` accepts. */
export function toTimeInputValue(t: string | null | undefined): string {
  return (t ?? "").slice(0, 5);
}

/** `<input type="time">` value ("HH:MM") -> DB "HH:MM:SS". Leaves an already-full value alone. */
export function fromTimeInputValue(t: string): string {
  return t.length === 5 ? `${t}:00` : t;
}

export interface Time12 {
  /** 1-12 */
  hour: number;
  /** 0-59 */
  minute: number;
  ampm: "AM" | "PM";
}

/** "HH:MM" or "HH:MM:SS" (24-hour) -> 12-hour parts. Null-safe. */
export function to12Hour(t: string | null | undefined): Time12 | null {
  const mins = timeToMinutes(t);
  if (mins === null) return null;
  const h24 = Math.floor(mins / 60);
  const minute = mins % 60;
  const ampm: "AM" | "PM" = h24 >= 12 ? "PM" : "AM";
  const hour = h24 % 12 === 0 ? 12 : h24 % 12;
  return { hour, minute, ampm };
}

/** 12-hour parts -> "HH:MM" (24-hour) — the same shape `fromTimeInputValue`/time inputs use. */
export function from12Hour(hour: number, minute: number, ampm: "AM" | "PM"): string {
  const h24 = (hour % 12) + (ampm === "PM" ? 12 : 0);
  return `${String(h24).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

/** "HH:MM"/"HH:MM:SS" -> "8:20 AM" for read-only display. Null-safe (returns ""). */
export function formatTime12(t: string | null | undefined): string {
  const parts = to12Hour(t);
  if (!parts) return "";
  return `${parts.hour}:${String(parts.minute).padStart(2, "0")} ${parts.ampm}`;
}

/** "YYYY-MM-DD" -> true for Sunday, built from date parts (no UTC-parse off-by-one). */
export function isSundayIso(iso: string): boolean {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).getDay() === 0;
}

/**
 * Fetches the single company_policy row (id = 1), falling back to
 * DEFAULT_COMPANY_POLICY if the row is missing or the query fails.
 */
export async function fetchCompanyPolicy(): Promise<{
  policy: CompanyPolicy;
  error: string | null;
}> {
  const { data, error } = await supabase
    .from("company_policy")
    .select("*")
    .eq("id", 1)
    .maybeSingle();
  if (error) return { policy: DEFAULT_COMPANY_POLICY, error: error.message };
  return { policy: (data as CompanyPolicy | null) ?? DEFAULT_COMPANY_POLICY, error: null };
}

/**
 * Effective shift for an employee: their own override if set, otherwise the
 * company policy shift. Only used for lateness/early-leave detection — the
 * hourly rate is derived from the policy's standard_hours/days_basis instead.
 */
export function effectiveShiftMinutes(
  employee: Pick<Employee, "shift_start" | "shift_end">,
  policy: Pick<CompanyPolicy, "shift_start" | "shift_end">,
): { startMin: number; endMin: number } {
  const startMin = timeToMinutes(employee.shift_start) ?? timeToMinutes(policy.shift_start) ?? 0;
  const endMin = timeToMinutes(employee.shift_end) ?? timeToMinutes(policy.shift_end) ?? 0;
  return { startMin, endMin };
}

/** Hourly rate = monthly_salary / days_basis / standard_hours (daily_wage / standard_hours for daily wage). */
export function getHourlyRate(
  employee: Pick<Employee, "pay_type" | "monthly_salary" | "daily_wage">,
  policy: Pick<CompanyPolicy, "standard_hours" | "days_basis">,
): number {
  const standardHours = Number(policy.standard_hours) || 0;
  if (standardHours <= 0) return 0;
  if (employee.pay_type === "daily") {
    return (Number(employee.daily_wage) || 0) / standardHours;
  }
  const daysBasis = Number(policy.days_basis) || 0;
  if (daysBasis <= 0) return 0;
  return (Number(employee.monthly_salary) || 0) / daysBasis / standardHours;
}

/** One full day's pay at the policy's days_basis rate — used for the "extra_day" Sunday mode. */
function getPolicyDailyRate(
  employee: Pick<Employee, "pay_type" | "monthly_salary" | "daily_wage">,
  policy: Pick<CompanyPolicy, "standard_hours" | "days_basis">,
): number {
  if (employee.pay_type === "daily") return Number(employee.daily_wage) || 0;
  return getHourlyRate(employee, policy) * (Number(policy.standard_hours) || 0);
}

export interface DayFlags {
  isSunday: boolean;
  /** max(0, check_in - effective shift start - grace_minutes). */
  lateMinutes: number;
  /** max(0, effective shift end - check_out). */
  earlyLeaveMinutes: number;
  /** lateMinutes + earlyLeaveMinutes, before the undertime tolerance is applied. */
  shortfallMinutes: number;
  /** shortfallMinutes after applying the policy's undertime_mode/tolerance. */
  countedShortfallMinutes: number;
  /** max(0, worked_minutes - overtime_threshold_hours*60); 0 unless both check_in/out exist and status is present/half_day. */
  overtimeMinutes: number;
  workedMinutes: number | null;
}

const blankDayFlags = (isSunday: boolean): DayFlags => ({
  isSunday,
  lateMinutes: 0,
  earlyLeaveMinutes: 0,
  shortfallMinutes: 0,
  countedShortfallMinutes: 0,
  overtimeMinutes: 0,
  workedMinutes: null,
});

/**
 * One day's lateness/early-leave/overtime flags for a tracked, non-Sunday
 * employee day — the shared basis for both the Attendance daily view's
 * per-row flags and computeMonthlyAttendanceStats, so the two never drift.
 * Returns all-zero flags for Sundays or when time tracking is disabled.
 */
export function computeDayFlags(
  employee: Pick<Employee, "shift_start" | "shift_end" | "time_tracking_enabled" | "grace_minutes">,
  policy: CompanyPolicy,
  date: string,
  record: Pick<AttendanceRecord, "status" | "check_in" | "check_out"> | null | undefined,
): DayFlags {
  const isSunday = isSundayIso(date);
  if (!record || isSunday || !employee.time_tracking_enabled) return blankDayFlags(isSunday);

  const { startMin, endMin } = effectiveShiftMinutes(employee, policy);
  const grace = Number(employee.grace_minutes) || 0;
  const ci = timeToMinutes(record.check_in);
  const co = timeToMinutes(record.check_out);

  const lateMinutes = ci !== null ? Math.max(0, ci - startMin - grace) : 0;
  const earlyLeaveMinutes = co !== null ? Math.max(0, endMin - co) : 0;
  const shortfallMinutes = lateMinutes + earlyLeaveMinutes;
  const tolerance = Number(policy.undertime_tolerance_minutes) || 0;
  const countedShortfallMinutes =
    policy.undertime_mode === "excess_only"
      ? Math.max(0, shortfallMinutes - tolerance)
      : shortfallMinutes <= tolerance
        ? 0
        : shortfallMinutes;

  let workedMinutes: number | null = null;
  let overtimeMinutes = 0;
  const statusNeedsTime: AttendanceStatus[] = ["present", "half_day"];
  if (ci !== null && co !== null && statusNeedsTime.includes(record.status)) {
    workedMinutes = co - ci;
    const otThresholdMin = (Number(policy.overtime_threshold_hours) || 0) * 60;
    overtimeMinutes = Math.max(0, workedMinutes - otThresholdMin);
  }

  return {
    isSunday,
    lateMinutes,
    earlyLeaveMinutes,
    shortfallMinutes,
    countedShortfallMinutes,
    overtimeMinutes,
    workedMinutes,
  };
}

/** Running balance for one employee: sum(given) - sum(repaid). */
export function advanceBalance(transactions: AdvanceTransaction[]): number {
  return transactions.reduce(
    (sum, t) => sum + (t.type === "given" ? Number(t.amount) : -Number(t.amount)),
    0,
  );
}

/** Splits employees (or any per-employee row) into office/labour groups, office first. */
export function splitByCategory<T extends { staff_category: Employee["staff_category"] }>(
  rows: T[],
): { office: T[]; labour: T[] } {
  return {
    office: rows.filter((r) => r.staff_category === "office"),
    labour: rows.filter((r) => r.staff_category === "labour"),
  };
}

/**
 * Print font-size (px) for a compact ledger table: shrinks as row count
 * grows so a report with many employees still targets ~1-2 printed pages
 * instead of spilling onto a third. Thresholds are a tuned heuristic, not a
 * guaranteed page-fit — CSS print pagination can't be measured in advance.
 */
export function compactPrintFontSize(rowCount: number): number {
  if (rowCount <= 22) return 11;
  if (rowCount <= 36) return 9.5;
  if (rowCount <= 55) return 8;
  return 6.5;
}

export interface EditableSalaryFields {
  base_pay: number;
  per_day_rate: number;
  deduction_days: number;
  overtime_amount: number;
  mess_allowance: number;
  advance_repayment: number;
  short_time_deduction: number;
}

/**
 * Derives gross/net/final from the editable fields — the single formula used
 * both at generation time and on every inline edit, so the two never drift.
 */
export function recalcSalaryLine(
  line: EditableSalaryFields,
  isMonthly: boolean,
): { gross_salary: number; net_salary: number; final_salary: number } {
  const gross_salary = isMonthly
    ? line.base_pay - line.deduction_days * line.per_day_rate
    : line.base_pay;
  const net_salary =
    gross_salary +
    line.overtime_amount +
    line.mess_allowance -
    line.advance_repayment;
  const final_salary = net_salary - line.short_time_deduction;
  return {
    gross_salary: round2(gross_salary),
    net_salary: round2(net_salary),
    final_salary: round2(final_salary),
  };
}

export interface MonthlyAttendanceStats {
  present: number;
  absent: number;
  leave: number;
  halfDay: number;
  /** Summed per day via computeDayFlags — grace and tolerance apply daily, not once a month. */
  lateMinutes: number;
  /** Weekday overtime minutes plus Sunday-overtime minutes (modes hourly_ot/beyond_threshold only). */
  overtimeMinutes: number;
  shortTimeAmount: number;
  /** Weekday overtime amount plus Sunday-overtime amount (all three sunday_mode variants). */
  overtimeAmount: number;
}

const blankStats = (): MonthlyAttendanceStats => ({
  present: 0,
  absent: 0,
  leave: 0,
  halfDay: 0,
  lateMinutes: 0,
  overtimeMinutes: 0,
  shortTimeAmount: 0,
  overtimeAmount: 0,
});

/**
 * One employee's attendance-derived stats for a period month — the shared
 * basis for both salary generation and the Monthly Summary report, so the
 * two figures never drift apart.
 *
 * Present/absent/leave/half-day counts come straight from attendance
 * records, except that on a Sunday (when the policy's sunday_paid_leave is
 * true) an absent/leave record is never counted — Sunday is a paid day off.
 * Late/short-time/weekday-overtime are computed per day via computeDayFlags
 * (which already excludes Sundays and untracked employees). Sunday overtime
 * is computed separately below, independent of time_tracking_enabled, for
 * employees with sunday_overtime = true.
 */
export function computeMonthlyAttendanceStats(
  employee: Employee,
  policy: CompanyPolicy,
  period: string,
  records: AttendanceRecord[],
): MonthlyAttendanceStats {
  const stats = blankStats();

  for (const r of records) {
    const sunday = isSundayIso(r.date);
    if (sunday && policy.sunday_paid_leave) {
      if (r.status === "present") stats.present += 1;
      else if (r.status === "half_day") stats.halfDay += 1;
      continue;
    }
    if (r.status === "present") stats.present += 1;
    else if (r.status === "half_day") stats.halfDay += 1;
    else if (r.status === "absent") stats.absent += 1;
    else if (r.status === "leave") stats.leave += 1;
  }

  const hourlyRate = getHourlyRate(employee, policy);
  const multiplier = Number(policy.overtime_multiplier) || 0;

  for (const r of records) {
    if (isSundayIso(r.date)) continue;
    const flags = computeDayFlags(employee, policy, r.date, r);
    stats.lateMinutes += flags.lateMinutes;
    stats.shortTimeAmount += (flags.countedShortfallMinutes / 60) * hourlyRate;
    stats.overtimeMinutes += flags.overtimeMinutes;
    stats.overtimeAmount += (flags.overtimeMinutes / 60) * hourlyRate * multiplier;
  }

  if (employee.sunday_overtime) {
    const otThresholdMin = (Number(policy.overtime_threshold_hours) || 0) * 60;
    for (const r of records) {
      if (!isSundayIso(r.date)) continue;
      const ci = timeToMinutes(r.check_in);
      const co = timeToMinutes(r.check_out);
      if (ci === null || co === null) continue;
      const workedMinutes = Math.max(0, co - ci);

      if (policy.sunday_mode === "hourly_ot") {
        stats.overtimeMinutes += workedMinutes;
        stats.overtimeAmount += (workedMinutes / 60) * hourlyRate * multiplier;
      } else if (policy.sunday_mode === "extra_day") {
        stats.overtimeAmount += getPolicyDailyRate(employee, policy);
      } else {
        const excess = Math.max(0, workedMinutes - otThresholdMin);
        stats.overtimeMinutes += excess;
        stats.overtimeAmount += (excess / 60) * hourlyRate * multiplier;
      }
    }
  }

  stats.shortTimeAmount = round2(stats.shortTimeAmount);
  stats.overtimeAmount = round2(stats.overtimeAmount);
  return stats;
}

export interface GeneratedSalaryLine extends EditableSalaryFields {
  employee_id: string;
  leave_days: number;
  gross_salary: number;
  net_salary: number;
  final_salary: number;
}

/**
 * Pre-fills one employee's salary line for a period from their attendance
 * that month, per the Salary page spec: base pay, per-day rate, leave days
 * (informational — actually a count of 'absent' records, not 'leave'; kept
 * as-is), short-time deduction and overtime are computed; deduction days,
 * mess allowance and the advance salary-deduction start at 0 for manual entry.
 */
export function generateSalaryLine(
  employee: Employee,
  policy: CompanyPolicy,
  period: string,
  records: AttendanceRecord[],
): GeneratedSalaryLine {
  const isMonthly = employee.pay_type === "monthly";
  const dim = daysInMonth(period);
  const stats = computeMonthlyAttendanceStats(employee, policy, period, records);

  const monthlySalary = Number(employee.monthly_salary) || 0;
  const dailyWage = Number(employee.daily_wage) || 0;

  const base_pay = isMonthly
    ? monthlySalary
    : dailyWage * (stats.present + 0.5 * stats.halfDay);
  const per_day_rate = isMonthly && dim > 0 ? base_pay / dim : 0;

  const editable: EditableSalaryFields = {
    base_pay: round2(base_pay),
    per_day_rate: round2(per_day_rate),
    deduction_days: 0,
    overtime_amount: stats.overtimeAmount,
    mess_allowance: 0,
    advance_repayment: 0,
    short_time_deduction: stats.shortTimeAmount,
  };

  return {
    employee_id: employee.id,
    leave_days: stats.absent,
    ...editable,
    ...recalcSalaryLine(editable, isMonthly),
  };
}

/* ---------- Salary ledger report (print + Excel share this shape) ---------- */

/** One row of the "MANZA TEXTILE MILLS" salary ledger format — print and Excel both consume this. */
export interface SalaryLedgerRow {
  sNo: number;
  employeeName: string;
  designation: string;
  payType: "monthly" | "daily";
  perMonthSalary: number;
  daysOfMonth: number;
  leaveDays: number;
  deductionDays: number;
  perDayRate: number;
  grossSalary: number;
  overtimeAmount: number;
  /** Cumulative 'given' advance_transactions up to and including this period. */
  totalAdvance: number;
  /** salary_lines.advance_repayment for this period. */
  deductionThisMonth: number;
  /** Cumulative given minus cumulative repaid, including this month's repayment. */
  balAdvance: number;
  messAllowance: number;
  netSalary: number;
  shortTimeDeduction: number;
  finalSalary: number;
}

export interface SalaryLedgerTotals {
  perMonthSalary: number;
  leaveDays: number;
  deductionDays: number;
  grossSalary: number;
  overtimeAmount: number;
  totalAdvance: number;
  deductionThisMonth: number;
  balAdvance: number;
  messAllowance: number;
  netSalary: number;
  shortTimeDeduction: number;
  finalSalary: number;
}

export function sumSalaryLedgerRows(rows: SalaryLedgerRow[]): SalaryLedgerTotals {
  const t: SalaryLedgerTotals = {
    perMonthSalary: 0,
    leaveDays: 0,
    deductionDays: 0,
    grossSalary: 0,
    overtimeAmount: 0,
    totalAdvance: 0,
    deductionThisMonth: 0,
    balAdvance: 0,
    messAllowance: 0,
    netSalary: 0,
    shortTimeDeduction: 0,
    finalSalary: 0,
  };
  for (const r of rows) {
    t.perMonthSalary += r.perMonthSalary;
    t.leaveDays += r.leaveDays;
    t.deductionDays += r.deductionDays;
    t.grossSalary += r.grossSalary;
    t.overtimeAmount += r.overtimeAmount;
    t.totalAdvance += r.totalAdvance;
    t.deductionThisMonth += r.deductionThisMonth;
    t.balAdvance += r.balAdvance;
    t.messAllowance += r.messAllowance;
    t.netSalary += r.netSalary;
    t.shortTimeDeduction += r.shortTimeDeduction;
    t.finalSalary += r.finalSalary;
  }
  return t;
}

/* ---------- Monthly attendance summary report ---------- */

export interface MonthlySummaryRow {
  employeeName: string;
  designation: string;
  present: number;
  absent: number;
  leave: number;
  halfDay: number;
  lateMinutes: number;
  overtimeMinutes: number;
  shortTimeAmount: number;
  overtimeAmount: number;
}

export interface MonthlySummaryTotals {
  present: number;
  absent: number;
  leave: number;
  halfDay: number;
  lateMinutes: number;
  overtimeMinutes: number;
  shortTimeAmount: number;
  overtimeAmount: number;
}

export function sumMonthlySummaryRows(rows: MonthlySummaryRow[]): MonthlySummaryTotals {
  const t: MonthlySummaryTotals = {
    present: 0,
    absent: 0,
    leave: 0,
    halfDay: 0,
    lateMinutes: 0,
    overtimeMinutes: 0,
    shortTimeAmount: 0,
    overtimeAmount: 0,
  };
  for (const r of rows) {
    t.present += r.present;
    t.absent += r.absent;
    t.leave += r.leave;
    t.halfDay += r.halfDay;
    t.lateMinutes += r.lateMinutes;
    t.overtimeMinutes += r.overtimeMinutes;
    t.shortTimeAmount += r.shortTimeAmount;
    t.overtimeAmount += r.overtimeAmount;
  }
  return t;
}
