import * as XLSX from "xlsx-js-style";
import { BORDER, ST } from "./excel";

const round = (n: number) => Math.round((Number.isFinite(n) ? n : 0) * 100) / 100;

/** Broader than excel.ts's `Style` (which is narrowed to its own exact ST entries) — this file defines a few styles of its own. */
interface CellStyle {
  font?: { bold?: boolean; sz?: number };
  border?: typeof BORDER;
  fill?: { patternType?: string; fgColor?: { rgb: string } };
  alignment?: {
    horizontal?: "left" | "center" | "right";
    vertical?: "top" | "center" | "bottom";
    wrapText?: boolean;
  };
}

const COL_HEADER: CellStyle = {
  font: { bold: true },
  border: BORDER,
  alignment: { horizontal: "left", vertical: "center" },
};
const TEXT: CellStyle = {
  border: BORDER,
  alignment: { horizontal: "left", vertical: "center" },
};
const TITLE_ROW: CellStyle = {
  font: { bold: true, sz: 14 },
  alignment: { horizontal: "center" },
};
const SUBTITLE_ROW: CellStyle = { alignment: { horizontal: "center" } };

/** Small append-only worksheet builder shared by the three exports below. */
function sheetBuilder() {
  const ws: Record<string, unknown> = {};
  const merges: { s: { r: number; c: number }; e: { r: number; c: number } }[] = [];
  let maxR = 0;
  let maxC = 0;

  function put(
    r: number,
    c: number,
    v: string | number,
    s: CellStyle,
    t: "s" | "n" = typeof v === "number" ? "n" : "s",
  ) {
    ws[XLSX.utils.encode_cell({ r, c })] = { v, t, s };
    if (r > maxR) maxR = r;
    if (c > maxC) maxC = c;
  }

  function titleBlock(title: string, subtitle: string, lastCol: number) {
    put(0, 0, title, TITLE_ROW, "s");
    for (let c = 1; c <= lastCol; c++) put(0, c, "", TITLE_ROW, "s");
    if (lastCol > 0) merges.push({ s: { r: 0, c: 0 }, e: { r: 0, c: lastCol } });

    put(1, 0, subtitle, SUBTITLE_ROW, "s");
    for (let c = 1; c <= lastCol; c++) put(1, c, "", SUBTITLE_ROW, "s");
    if (lastCol > 0) merges.push({ s: { r: 1, c: 0 }, e: { r: 1, c: lastCol } });
  }

  function finish(cols: { wch: number }[]): XLSX.WorkSheet {
    ws["!ref"] = XLSX.utils.encode_range({
      s: { r: 0, c: 0 },
      e: { r: maxR, c: maxC },
    });
    if (merges.length) ws["!merges"] = merges;
    ws["!cols"] = cols;
    return ws as XLSX.WorkSheet;
  }

  return { put, titleBlock, finish };
}

function filenameSafe(name: string): string {
  return name.replace(/[^\w\- ]+/g, "").replace(/\s+/g, " ").trim();
}

/* ---------- Salary ---------- */

export interface SalaryExportRow {
  employeeCode: number;
  employeeName: string;
  payType: "monthly" | "daily";
  timeTrackingEnabled: boolean;
  base_pay: number;
  per_day_rate: number;
  leave_days: number;
  deduction_days: number;
  gross_salary: number;
  short_time_deduction: number;
  overtime_amount: number;
  mess_allowance: number;
  advance_repayment: number;
  net_salary: number;
  final_salary: number;
}

const SALARY_HEADERS = [
  "Employee",
  "Pay type",
  "Base pay",
  "Per day",
  "Leave days",
  "Deduct days",
  "Gross",
  "Short time",
  "Overtime",
  "Mess",
  "Advance",
  "Net",
  "Final",
];

export function downloadSalaryExcel(monthLabel: string, rows: SalaryExportRow[]): void {
  const { put, titleBlock, finish } = sheetBuilder();
  const lastCol = SALARY_HEADERS.length - 1;

  titleBlock("MANZA TEXTILE MILLS", `Salary — ${monthLabel}`, lastCol);

  let r = 3;
  SALARY_HEADERS.forEach((h, c) => put(r, c, h, COL_HEADER, "s"));
  r += 1;

  const totals = {
    base_pay: 0,
    gross_salary: 0,
    short_time_deduction: 0,
    overtime_amount: 0,
    mess_allowance: 0,
    advance_repayment: 0,
    net_salary: 0,
    final_salary: 0,
  };

  for (const row of rows) {
    put(r, 0, `#${row.employeeCode} ${row.employeeName}`, TEXT, "s");
    put(r, 1, row.payType === "monthly" ? "Monthly" : "Daily", TEXT, "s");
    put(r, 2, round(row.base_pay), ST.value, "n");
    put(r, 3, row.payType === "monthly" ? round(row.per_day_rate) : "", ST.value);
    put(r, 4, row.leave_days, ST.value, "n");
    put(r, 5, row.payType === "monthly" ? round(row.deduction_days) : "", ST.value);
    put(r, 6, round(row.gross_salary), ST.value, "n");
    put(r, 7, row.timeTrackingEnabled ? round(row.short_time_deduction) : "Not tracked", ST.value);
    put(r, 8, row.timeTrackingEnabled ? round(row.overtime_amount) : "Not tracked", ST.value);
    put(r, 9, round(row.mess_allowance), ST.value, "n");
    put(r, 10, round(row.advance_repayment), ST.value, "n");
    put(r, 11, round(row.net_salary), ST.value, "n");
    put(r, 12, round(row.final_salary), ST.value, "n");
    r += 1;

    totals.base_pay += row.base_pay;
    totals.gross_salary += row.gross_salary;
    totals.short_time_deduction += row.short_time_deduction;
    totals.overtime_amount += row.overtime_amount;
    totals.mess_allowance += row.mess_allowance;
    totals.advance_repayment += row.advance_repayment;
    totals.net_salary += row.net_salary;
    totals.final_salary += row.final_salary;
  }

  put(r, 0, "Total", COL_HEADER, "s");
  put(r, 1, "", TEXT, "s");
  put(r, 2, round(totals.base_pay), ST.valueBold, "n");
  put(r, 3, "", ST.valueBold, "s");
  put(r, 4, "", ST.valueBold, "s");
  put(r, 5, "", ST.valueBold, "s");
  put(r, 6, round(totals.gross_salary), ST.valueBold, "n");
  put(r, 7, round(totals.short_time_deduction), ST.valueBold, "n");
  put(r, 8, round(totals.overtime_amount), ST.valueBold, "n");
  put(r, 9, round(totals.mess_allowance), ST.valueBold, "n");
  put(r, 10, round(totals.advance_repayment), ST.valueBold, "n");
  put(r, 11, round(totals.net_salary), ST.valueBold, "n");
  put(r, 12, round(totals.final_salary), ST.valueBold, "n");

  const ws = finish([
    { wch: 22 },
    { wch: 10 },
    { wch: 11 },
    { wch: 10 },
    { wch: 10 },
    { wch: 11 },
    { wch: 11 },
    { wch: 11 },
    { wch: 10 },
    { wch: 9 },
    { wch: 10 },
    { wch: 11 },
    { wch: 11 },
  ]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Salary");
  XLSX.writeFile(wb, `${filenameSafe(`Salary ${monthLabel}`)}.xlsx`);
}

/* ---------- Attendance ---------- */

export interface AttendanceExportRow {
  employeeCode: number;
  employeeName: string;
  designation: string;
  status: string;
  checkIn: string;
  checkOut: string;
  shift: string;
}

const ATTENDANCE_HEADERS = ["Employee", "Designation", "Status", "Check in", "Check out", "Shift"];

export function downloadAttendanceExcel(dateLabel: string, rows: AttendanceExportRow[]): void {
  const { put, titleBlock, finish } = sheetBuilder();
  const lastCol = ATTENDANCE_HEADERS.length - 1;

  titleBlock("MANZA TEXTILE MILLS", `Attendance — ${dateLabel}`, lastCol);

  let r = 3;
  ATTENDANCE_HEADERS.forEach((h, c) => put(r, c, h, COL_HEADER, "s"));
  r += 1;

  for (const row of rows) {
    put(r, 0, `#${row.employeeCode} ${row.employeeName}`, TEXT, "s");
    put(r, 1, row.designation || "—", TEXT, "s");
    put(r, 2, row.status, TEXT, "s");
    put(r, 3, row.checkIn || "—", TEXT, "s");
    put(r, 4, row.checkOut || "—", TEXT, "s");
    put(r, 5, row.shift || "—", TEXT, "s");
    r += 1;
  }

  const ws = finish([
    { wch: 22 },
    { wch: 16 },
    { wch: 10 },
    { wch: 10 },
    { wch: 10 },
    { wch: 8 },
  ]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Attendance");
  XLSX.writeFile(wb, `${filenameSafe(`Attendance ${dateLabel}`)}.xlsx`);
}

/* ---------- Advances ---------- */

export interface AdvanceBalanceRow {
  employeeCode: number;
  employeeName: string;
  given: number;
  repaid: number;
  balance: number;
}

export interface AdvanceTransactionRow {
  date: string;
  employeeName: string;
  type: "given" | "repaid";
  amount: number;
  notes: string;
}

const BALANCE_HEADERS = ["Employee", "Given", "Repaid", "Balance"];
const TRANSACTION_HEADERS = ["Date", "Employee", "Type", "Amount", "Notes"];

export function downloadAdvancesExcel(
  scopeLabel: string,
  balances: AdvanceBalanceRow[],
  transactions: AdvanceTransactionRow[],
): void {
  const { put, titleBlock, finish } = sheetBuilder();
  const lastCol = Math.max(BALANCE_HEADERS.length, TRANSACTION_HEADERS.length) - 1;

  titleBlock("MANZA TEXTILE MILLS", `Advances — ${scopeLabel}`, lastCol);

  let r = 3;
  put(r, 0, "Balances", TITLE_ROW, "s");
  r += 1;
  BALANCE_HEADERS.forEach((h, c) => put(r, c, h, COL_HEADER, "s"));
  r += 1;
  for (const b of balances) {
    put(r, 0, `#${b.employeeCode} ${b.employeeName}`, TEXT, "s");
    put(r, 1, round(b.given), ST.value, "n");
    put(r, 2, round(b.repaid), ST.value, "n");
    put(r, 3, round(b.balance), ST.valueBold, "n");
    r += 1;
  }

  r += 1;
  put(r, 0, "Transactions", TITLE_ROW, "s");
  r += 1;
  TRANSACTION_HEADERS.forEach((h, c) => put(r, c, h, COL_HEADER, "s"));
  r += 1;
  for (const t of transactions) {
    put(r, 0, t.date, TEXT, "s");
    put(r, 1, t.employeeName, TEXT, "s");
    put(r, 2, t.type === "given" ? "Given" : "Repaid", TEXT, "s");
    put(r, 3, round(t.amount), ST.value, "n");
    put(r, 4, t.notes || "—", TEXT, "s");
    r += 1;
  }

  const ws = finish([
    { wch: 22 },
    { wch: 22 },
    { wch: 12 },
    { wch: 14 },
    { wch: 30 },
  ]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Advances");
  XLSX.writeFile(wb, `${filenameSafe(`Advances ${scopeLabel}`)}.xlsx`);
}
