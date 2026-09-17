import * as XLSX from "xlsx-js-style";
import { BORDER, ST } from "./excel";
import {
  sumMonthlySummaryRows,
  sumSalaryLedgerRows,
  type MonthlySummaryRow,
  type SalaryLedgerRow,
} from "./attendanceSalary";

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

/* ---------- Salary ledger (matches the reference "MANZA TEXTILE MILLS" format) ---------- */

const SALARY_HEADERS = [
  "S#",
  "Name",
  "Designation",
  "Per Month Salary",
  "Days of Month",
  "Leave",
  "Deduction days",
  "Per Day Rate Base on 30",
  "Gross Salary",
  "Over time",
  "Total Advance",
  "Deduction in this Month",
  "Bal Advance",
  "Mess Allowance",
  "Net Salary",
  "Short Time Deduction",
  "Final Salary",
];
const SALARY_LAST_COL = SALARY_HEADERS.length - 1;

function writeSalaryRow(
  put: ReturnType<typeof sheetBuilder>["put"],
  r: number,
  row: SalaryLedgerRow,
): void {
  put(r, 0, row.sNo, ST.value, "n");
  put(r, 1, row.employeeName, TEXT, "s");
  put(r, 2, row.designation || "—", TEXT, "s");
  put(r, 3, round(row.perMonthSalary), ST.value, "n");
  put(r, 4, row.daysOfMonth, ST.value, "n");
  put(r, 5, row.leaveDays, ST.value, "n");
  put(r, 6, round(row.deductionDays), ST.value, "n");
  put(r, 7, round(row.perDayRate), ST.value, "n");
  put(r, 8, round(row.grossSalary), ST.value, "n");
  put(r, 9, round(row.overtimeAmount), ST.value, "n");
  put(r, 10, round(row.totalAdvance), ST.value, "n");
  put(r, 11, round(row.deductionThisMonth), ST.value, "n");
  put(r, 12, round(row.balAdvance), ST.value, "n");
  put(r, 13, round(row.messAllowance), ST.value, "n");
  put(r, 14, round(row.netSalary), ST.value, "n");
  put(r, 15, round(row.shortTimeDeduction), ST.value, "n");
  put(r, 16, round(row.finalSalary), ST.valueBold, "n");
}

function writeSalaryTotalsRow(
  put: ReturnType<typeof sheetBuilder>["put"],
  r: number,
  label: string,
  rows: SalaryLedgerRow[],
): void {
  const t = sumSalaryLedgerRows(rows);
  put(r, 0, "", ST.valueBold, "s");
  put(r, 1, label, COL_HEADER, "s");
  put(r, 2, "", ST.valueBold, "s");
  put(r, 3, round(t.perMonthSalary), ST.valueBold, "n");
  put(r, 4, "", ST.valueBold, "s");
  put(r, 5, t.leaveDays, ST.valueBold, "n");
  put(r, 6, round(t.deductionDays), ST.valueBold, "n");
  put(r, 7, "", ST.valueBold, "s");
  put(r, 8, round(t.grossSalary), ST.valueBold, "n");
  put(r, 9, round(t.overtimeAmount), ST.valueBold, "n");
  put(r, 10, round(t.totalAdvance), ST.valueBold, "n");
  put(r, 11, round(t.deductionThisMonth), ST.valueBold, "n");
  put(r, 12, round(t.balAdvance), ST.valueBold, "n");
  put(r, 13, round(t.messAllowance), ST.valueBold, "n");
  put(r, 14, round(t.netSalary), ST.valueBold, "n");
  put(r, 15, round(t.shortTimeDeduction), ST.valueBold, "n");
  put(r, 16, round(t.finalSalary), ST.valueBold, "n");
}

export function downloadSalaryLedgerExcel(
  monthLabel: string,
  office: SalaryLedgerRow[],
  labour: SalaryLedgerRow[],
): void {
  const { put, titleBlock, finish } = sheetBuilder();

  titleBlock("MANZA TEXTILE MILLS", `FOR THE MONTH OF ${monthLabel.toUpperCase()}`, SALARY_LAST_COL);
  let r = 3;

  function writeSection(title: string, rows: SalaryLedgerRow[]) {
    if (rows.length === 0) return;
    put(r, 0, title, TITLE_ROW, "s");
    r += 1;
    SALARY_HEADERS.forEach((h, c) => put(r, c, h, COL_HEADER, "s"));
    r += 1;
    for (const row of rows) {
      writeSalaryRow(put, r, row);
      r += 1;
    }
    writeSalaryTotalsRow(put, r, `${title} Subtotal`, rows);
    r += 2;
  }

  writeSection("Office Staff", office);
  writeSection("Labour Staff", labour);
  writeSalaryTotalsRow(put, r, "Grand Total", [...office, ...labour]);

  const ws = finish([
    { wch: 5 },
    { wch: 20 },
    { wch: 16 },
    { wch: 13 },
    { wch: 8 },
    { wch: 7 },
    { wch: 9 },
    { wch: 12 },
    { wch: 12 },
    { wch: 10 },
    { wch: 12 },
    { wch: 12 },
    { wch: 11 },
    { wch: 10 },
    { wch: 11 },
    { wch: 12 },
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
const ATTENDANCE_LAST_COL = ATTENDANCE_HEADERS.length - 1;

function writeAttendanceRow(
  put: ReturnType<typeof sheetBuilder>["put"],
  r: number,
  row: AttendanceExportRow,
): void {
  put(r, 0, `#${row.employeeCode} ${row.employeeName}`, TEXT, "s");
  put(r, 1, row.designation || "—", TEXT, "s");
  put(r, 2, row.status, TEXT, "s");
  put(r, 3, row.checkIn || "—", TEXT, "s");
  put(r, 4, row.checkOut || "—", TEXT, "s");
  put(r, 5, row.shift || "—", TEXT, "s");
}

export function downloadAttendanceExcel(
  dateLabel: string,
  office: AttendanceExportRow[],
  labour: AttendanceExportRow[],
): void {
  const { put, titleBlock, finish } = sheetBuilder();

  titleBlock("MANZA TEXTILE MILLS", `Attendance — ${dateLabel}`, ATTENDANCE_LAST_COL);
  let r = 3;

  function writeSection(title: string, rows: AttendanceExportRow[]) {
    if (rows.length === 0) return;
    put(r, 0, title, TITLE_ROW, "s");
    r += 1;
    ATTENDANCE_HEADERS.forEach((h, c) => put(r, c, h, COL_HEADER, "s"));
    r += 1;
    for (const row of rows) {
      writeAttendanceRow(put, r, row);
      r += 1;
    }
    r += 1;
  }

  writeSection("Office Staff", office);
  writeSection("Labour Staff", labour);

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

/* ---------- Monthly attendance summary ---------- */

const SUMMARY_HEADERS = [
  "Employee",
  "Designation",
  "Present",
  "Absent",
  "Leave",
  "Half day",
  "Late (min)",
  "OT (min)",
  "Short time",
  "Overtime",
];
const SUMMARY_LAST_COL = SUMMARY_HEADERS.length - 1;

function writeSummaryRow(
  put: ReturnType<typeof sheetBuilder>["put"],
  r: number,
  row: MonthlySummaryRow,
): void {
  put(r, 0, row.employeeName, TEXT, "s");
  put(r, 1, row.designation || "—", TEXT, "s");
  put(r, 2, row.present, ST.value, "n");
  put(r, 3, row.absent, ST.value, "n");
  put(r, 4, row.leave, ST.value, "n");
  put(r, 5, row.halfDay, ST.value, "n");
  put(r, 6, row.lateMinutes, ST.value, "n");
  put(r, 7, row.overtimeMinutes, ST.value, "n");
  put(r, 8, round(row.shortTimeAmount), ST.value, "n");
  put(r, 9, round(row.overtimeAmount), ST.value, "n");
}

function writeSummaryTotalsRow(
  put: ReturnType<typeof sheetBuilder>["put"],
  r: number,
  label: string,
  rows: MonthlySummaryRow[],
): void {
  const t = sumMonthlySummaryRows(rows);
  put(r, 0, label, COL_HEADER, "s");
  put(r, 1, "", ST.valueBold, "s");
  put(r, 2, t.present, ST.valueBold, "n");
  put(r, 3, t.absent, ST.valueBold, "n");
  put(r, 4, t.leave, ST.valueBold, "n");
  put(r, 5, t.halfDay, ST.valueBold, "n");
  put(r, 6, t.lateMinutes, ST.valueBold, "n");
  put(r, 7, t.overtimeMinutes, ST.valueBold, "n");
  put(r, 8, round(t.shortTimeAmount), ST.valueBold, "n");
  put(r, 9, round(t.overtimeAmount), ST.valueBold, "n");
}

export function downloadMonthlySummaryExcel(
  monthLabel: string,
  office: MonthlySummaryRow[],
  labour: MonthlySummaryRow[],
): void {
  const { put, titleBlock, finish } = sheetBuilder();

  titleBlock("MANZA TEXTILE MILLS", `Monthly Attendance Summary — ${monthLabel}`, SUMMARY_LAST_COL);
  let r = 3;

  function writeSection(title: string, rows: MonthlySummaryRow[]) {
    if (rows.length === 0) return;
    put(r, 0, title, TITLE_ROW, "s");
    r += 1;
    SUMMARY_HEADERS.forEach((h, c) => put(r, c, h, COL_HEADER, "s"));
    r += 1;
    for (const row of rows) {
      writeSummaryRow(put, r, row);
      r += 1;
    }
    writeSummaryTotalsRow(put, r, `${title} Subtotal`, rows);
    r += 2;
  }

  writeSection("Office Staff", office);
  writeSection("Labour Staff", labour);

  const ws = finish([
    { wch: 20 },
    { wch: 16 },
    { wch: 8 },
    { wch: 8 },
    { wch: 8 },
    { wch: 8 },
    { wch: 9 },
    { wch: 8 },
    { wch: 10 },
    { wch: 10 },
  ]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Monthly Summary");
  XLSX.writeFile(wb, `${filenameSafe(`Monthly Summary ${monthLabel}`)}.xlsx`);
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
