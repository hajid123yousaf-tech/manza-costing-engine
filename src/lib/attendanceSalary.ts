import type { AdvanceTransaction, AttendanceRecord, Employee } from "./types";

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

export function shiftHours(
  employee: Pick<Employee, "shift_start" | "shift_end">,
): number {
  const start = timeToMinutes(employee.shift_start) ?? 0;
  const end = timeToMinutes(employee.shift_end) ?? 0;
  return Math.max(0, end - start) / 60;
}

/** Running balance for one employee: sum(given) - sum(repaid). */
export function advanceBalance(transactions: AdvanceTransaction[]): number {
  return transactions.reduce(
    (sum, t) => sum + (t.type === "given" ? Number(t.amount) : -Number(t.amount)),
    0,
  );
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
 * (informational), and short-time deduction are computed; deduction days,
 * overtime, mess allowance and advance repayment start at 0 for manual entry.
 */
export function generateSalaryLine(
  employee: Employee,
  period: string,
  records: AttendanceRecord[],
): GeneratedSalaryLine {
  const isMonthly = employee.pay_type === "monthly";
  const dim = daysInMonth(period);

  const present = records.filter((r) => r.status === "present").length;
  const halfDays = records.filter((r) => r.status === "half_day").length;
  const absentDays = records.filter((r) => r.status === "absent").length;

  const monthlySalary = Number(employee.monthly_salary) || 0;
  const dailyWage = Number(employee.daily_wage) || 0;

  const base_pay = isMonthly
    ? monthlySalary
    : dailyWage * (present + 0.5 * halfDays);
  const per_day_rate = isMonthly && dim > 0 ? base_pay / dim : 0;

  let short_time_deduction = 0;
  if (employee.time_tracking_enabled) {
    const hours = shiftHours(employee);
    const shiftStartMin = timeToMinutes(employee.shift_start) ?? 0;
    const lateMinutes = records.reduce((sum, r) => {
      const ci = timeToMinutes(r.check_in);
      return ci === null ? sum : sum + Math.max(0, ci - shiftStartMin);
    }, 0);
    const basis = isMonthly ? monthlySalary : dailyWage * dim;
    const perMinuteRate = hours > 0 ? basis / (30 * hours * 60) : 0;
    short_time_deduction = round2(lateMinutes * perMinuteRate);
  }

  const editable: EditableSalaryFields = {
    base_pay: round2(base_pay),
    per_day_rate: round2(per_day_rate),
    deduction_days: 0,
    overtime_amount: 0,
    mess_allowance: 0,
    advance_repayment: 0,
    short_time_deduction,
  };

  return {
    employee_id: employee.id,
    leave_days: absentDays,
    ...editable,
    ...recalcSalaryLine(editable, isMonthly),
  };
}
