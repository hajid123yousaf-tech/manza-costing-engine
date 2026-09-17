"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import {
  compactPrintFontSize,
  currentMonthInput,
  daysInMonth,
  generateSalaryLine,
  monthInputToPeriod,
  monthLabel,
  monthRange,
  recalcSalaryLine,
  round2,
  sumSalaryLedgerRows,
  todayIso,
  type EditableSalaryFields,
  type SalaryLedgerRow,
} from "@/lib/attendanceSalary";
import { downloadSalaryLedgerExcel } from "@/lib/attendanceSalaryExcel";
import { formatMoney, formatNumber } from "@/lib/format";
import type {
  AdvanceTransaction,
  AttendanceRecord,
  Employee,
  SalaryLine,
  SalaryPeriod,
} from "@/lib/types";
import {
  Button,
  Card,
  ErrorNote,
  PageHeader,
  Pill,
  Spinner,
  SuccessNote,
  cn,
} from "@/components/ui";

interface LineDraft extends EditableSalaryFields {
  employee_id: string;
  leave_days: number;
  gross_salary: number;
  net_salary: number;
  final_salary: number;
  remarks: string;
}

const numOrZero = (v: string) => (v === "" ? 0 : Number(v));
const editValue = (n: number) => (n === 0 ? "" : n);

function toDraft(line: SalaryLine): LineDraft {
  return {
    employee_id: line.employee_id,
    base_pay: Number(line.base_pay),
    per_day_rate: Number(line.per_day_rate),
    leave_days: line.leave_days,
    deduction_days: Number(line.deduction_days),
    gross_salary: Number(line.gross_salary),
    overtime_amount: Number(line.overtime_amount),
    mess_allowance: Number(line.mess_allowance),
    advance_repayment: Number(line.advance_repayment),
    short_time_deduction: Number(line.short_time_deduction),
    net_salary: Number(line.net_salary),
    final_salary: Number(line.final_salary),
    remarks: line.remarks ?? "",
  };
}

export default function SalaryPage() {
  const [monthInput, setMonthInput] = useState(currentMonthInput());
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [period, setPeriod] = useState<SalaryPeriod | null>(null);
  const [employees, setEmployees] = useState<Record<string, Employee>>({});
  const [lines, setLines] = useState<Record<string, LineDraft>>({});
  const [transactions, setTransactions] = useState<AdvanceTransaction[]>([]);
  const [dirty, setDirty] = useState(false);
  const [confirmingFinalize, setConfirmingFinalize] = useState(false);

  const periodDate = monthInputToPeriod(monthInput);
  const finalized = period?.status === "finalized";

  const load = useCallback(async (forPeriod: string) => {
    setLoading(true);
    setError(null);
    setSuccess(null);
    setDirty(false);
    setConfirmingFinalize(false);

    const { end: periodEnd } = monthRange(forPeriod);
    const [empRes, periodRes, txnRes] = await Promise.all([
      supabase.from("employees").select("*"),
      supabase.from("salary_periods").select("*").eq("period_month", forPeriod).maybeSingle(),
      supabase.from("advance_transactions").select("*").lte("date", periodEnd),
    ]);
    if (empRes.error || periodRes.error || txnRes.error) {
      setError(
        empRes.error?.message || periodRes.error?.message || txnRes.error?.message || "Failed to load.",
      );
      setLoading(false);
      return;
    }
    const empMap: Record<string, Employee> = {};
    for (const e of (empRes.data ?? []) as Employee[]) empMap[e.id] = e;
    setEmployees(empMap);
    setTransactions((txnRes.data ?? []) as AdvanceTransaction[]);

    const periodRow = (periodRes.data ?? null) as SalaryPeriod | null;
    setPeriod(periodRow);

    if (!periodRow) {
      setLines({});
      setLoading(false);
      return;
    }

    const { data: lineRows, error: lineError } = await supabase
      .from("salary_lines")
      .select("*")
      .eq("period_id", periodRow.id);
    if (lineError) {
      setError(lineError.message);
      setLoading(false);
      return;
    }
    const lineMap: Record<string, LineDraft> = {};
    for (const l of (lineRows ?? []) as SalaryLine[]) lineMap[l.employee_id] = toDraft(l);
    setLines(lineMap);
    setLoading(false);
  }, []);

  useEffect(() => {
    void (async () => {
      await load(periodDate);
    })();
  }, [periodDate, load]);

  /**
   * Rows shown/saved reflect each employee's current time_tracking_enabled
   * flag, not just what's stored — so toggling it off on the Employees page
   * self-heals a line generated before the toggle changed, without requiring
   * a Regenerate.
   */
  const rows = useMemo(
    () =>
      Object.values(lines)
        .map((line) => {
          const employee = employees[line.employee_id];
          if (!employee) return null;
          const editable: EditableSalaryFields = employee.time_tracking_enabled
            ? line
            : { ...line, short_time_deduction: 0, overtime_amount: 0 };
          const derived = recalcSalaryLine(editable, employee.pay_type === "monthly");
          return { line: { ...line, ...editable, ...derived }, employee };
        })
        .filter((r): r is { line: LineDraft; employee: Employee } => !!r)
        .sort((a, b) => a.employee.employee_code - b.employee.employee_code),
    [lines, employees],
  );

  /** Per employee, given/repaid summed from transactions dated on or before this period's last day. */
  const advanceByEmployee = useMemo(() => {
    const map = new Map<string, { given: number; repaid: number }>();
    for (const t of transactions) {
      const entry = map.get(t.employee_id) ?? { given: 0, repaid: 0 };
      if (t.type === "given") entry.given += Number(t.amount);
      else entry.repaid += Number(t.amount);
      map.set(t.employee_id, entry);
    }
    return map;
  }, [transactions]);

  const periodDim = daysInMonth(periodDate);

  /**
   * The reference "MANZA TEXTILE MILLS" ledger's Office/Labour rows. Bal
   * Advance = cumulative given - cumulative repaid (both already filtered to
   * this period's month-end above) - this period's own repayment, which is
   * only added separately while still a draft: once finalized, the finalize
   * step has posted that exact amount as a 'repaid' transaction (usually
   * dated within the period), so it's already inside advanceByEmployee's
   * repaid total and must not be subtracted twice.
   */
  const ledger = useMemo(() => {
    const withRow = rows.map(({ line, employee }) => {
      const adv = advanceByEmployee.get(employee.id) ?? { given: 0, repaid: 0 };
      const totalAdvance = adv.given;
      const balAdvance = round2(adv.given - adv.repaid - (finalized ? 0 : line.advance_repayment));
      const perMonthSalary =
        employee.pay_type === "monthly"
          ? Number(employee.monthly_salary) || 0
          : Number(employee.daily_wage) || 0;
      const row: SalaryLedgerRow = {
        sNo: 0,
        employeeName: employee.name,
        designation: employee.designation ?? "",
        payType: employee.pay_type,
        perMonthSalary,
        daysOfMonth: periodDim,
        leaveDays: line.leave_days,
        deductionDays: line.deduction_days,
        perDayRate: line.per_day_rate,
        grossSalary: line.gross_salary,
        overtimeAmount: line.overtime_amount,
        totalAdvance,
        deductionThisMonth: line.advance_repayment,
        balAdvance,
        messAllowance: line.mess_allowance,
        netSalary: line.net_salary,
        shortTimeDeduction: line.short_time_deduction,
        finalSalary: line.final_salary,
      };
      return { row, employee };
    });
    const office = withRow
      .filter(({ employee }) => employee.staff_category === "office")
      .map(({ row }, i) => ({ ...row, sNo: i + 1 }));
    const labour = withRow
      .filter(({ employee }) => employee.staff_category === "labour")
      .map(({ row }, i) => ({ ...row, sNo: i + 1 }));
    return { office, labour };
  }, [rows, advanceByEmployee, finalized, periodDim]);

  const totals = useMemo(() => {
    const init = {
      base_pay: 0,
      gross_salary: 0,
      short_time_deduction: 0,
      overtime_amount: 0,
      mess_allowance: 0,
      advance_repayment: 0,
      net_salary: 0,
      final_salary: 0,
    };
    for (const { line } of rows) {
      init.base_pay += line.base_pay;
      init.gross_salary += line.gross_salary;
      init.short_time_deduction += line.short_time_deduction;
      init.overtime_amount += line.overtime_amount;
      init.mess_allowance += line.mess_allowance;
      init.advance_repayment += line.advance_repayment;
      init.net_salary += line.net_salary;
      init.final_salary += line.final_salary;
    }
    return init;
  }, [rows]);

  function patch(employeeId: string, key: keyof EditableSalaryFields, value: number) {
    setLines((prev) => {
      const current = prev[employeeId];
      if (!current) return prev;
      const employee = employees[employeeId];
      const updatedEditable: EditableSalaryFields = { ...current, [key]: value };
      const derived = recalcSalaryLine(updatedEditable, employee?.pay_type === "monthly");
      return {
        ...prev,
        [employeeId]: { ...current, ...updatedEditable, ...derived },
      };
    });
    setDirty(true);
  }

  function patchRemarks(employeeId: string, remarks: string) {
    setLines((prev) => ({ ...prev, [employeeId]: { ...prev[employeeId], remarks } }));
    setDirty(true);
  }

  function rowsToUpsert(periodId: string) {
    return rows.map(({ line }) => ({
      period_id: periodId,
      employee_id: line.employee_id,
      base_pay: line.base_pay,
      per_day_rate: line.per_day_rate,
      leave_days: line.leave_days,
      deduction_days: line.deduction_days,
      gross_salary: line.gross_salary,
      overtime_amount: line.overtime_amount,
      mess_allowance: line.mess_allowance,
      advance_repayment: line.advance_repayment,
      short_time_deduction: line.short_time_deduction,
      net_salary: line.net_salary,
      final_salary: line.final_salary,
      remarks: line.remarks.trim() || null,
    }));
  }

  async function generate() {
    setBusy(true);
    setError(null);
    setSuccess(null);

    let periodRow = period;
    if (!periodRow) {
      const { data, error } = await supabase
        .from("salary_periods")
        .insert({ period_month: periodDate, status: "draft" })
        .select("*")
        .single();
      if (error) {
        setError(error.message);
        setBusy(false);
        return;
      }
      periodRow = data as SalaryPeriod;
      setPeriod(periodRow);
    } else if (periodRow.status === "finalized") {
      setBusy(false);
      return;
    }

    const activeEmployees = Object.values(employees).filter((e) => e.is_active);
    const { start, end } = monthRange(periodDate);
    const { data: recordRows, error: recError } = await supabase
      .from("attendance_records")
      .select("*")
      .gte("date", start)
      .lte("date", end)
      .in(
        "employee_id",
        activeEmployees.map((e) => e.id),
      );
    if (recError) {
      setError(recError.message);
      setBusy(false);
      return;
    }
    const records = (recordRows ?? []) as AttendanceRecord[];
    const recordsByEmployee = new Map<string, AttendanceRecord[]>();
    for (const r of records) {
      const list = recordsByEmployee.get(r.employee_id) ?? [];
      list.push(r);
      recordsByEmployee.set(r.employee_id, list);
    }

    const generated = activeEmployees.map((e) =>
      generateSalaryLine(e, periodDate, recordsByEmployee.get(e.id) ?? []),
    );

    const { error: upsertError } = await supabase.from("salary_lines").upsert(
      generated.map((g) => ({
        period_id: periodRow!.id,
        employee_id: g.employee_id,
        base_pay: g.base_pay,
        per_day_rate: g.per_day_rate,
        leave_days: g.leave_days,
        deduction_days: g.deduction_days,
        gross_salary: g.gross_salary,
        overtime_amount: g.overtime_amount,
        mess_allowance: g.mess_allowance,
        advance_repayment: g.advance_repayment,
        short_time_deduction: g.short_time_deduction,
        net_salary: g.net_salary,
        final_salary: g.final_salary,
      })),
      { onConflict: "period_id,employee_id" },
    );
    setBusy(false);
    if (upsertError) {
      setError(upsertError.message);
      return;
    }
    setSuccess(`Generated salary for ${generated.length} employee${generated.length === 1 ? "" : "s"}.`);
    await load(periodDate);
  }

  async function saveChanges() {
    if (!period) return;
    setBusy(true);
    setError(null);
    setSuccess(null);
    const { error } = await supabase
      .from("salary_lines")
      .upsert(rowsToUpsert(period.id), { onConflict: "period_id,employee_id" });
    setBusy(false);
    if (error) {
      setError(error.message);
      return;
    }
    setSuccess("Changes saved.");
    setDirty(false);
    await load(periodDate);
  }

  async function finalize() {
    if (!period || finalized) return;
    if (!confirmingFinalize) {
      setConfirmingFinalize(true);
      return;
    }
    setConfirmingFinalize(false);
    setBusy(true);
    setError(null);
    setSuccess(null);

    const { error: saveError } = await supabase
      .from("salary_lines")
      .upsert(rowsToUpsert(period.id), { onConflict: "period_id,employee_id" });
    if (saveError) {
      setError(saveError.message);
      setBusy(false);
      return;
    }

    const repayments = Object.values(lines).filter((l) => l.advance_repayment > 0);
    if (repayments.length > 0) {
      const { error: repayError } = await supabase.from("advance_transactions").insert(
        repayments.map((l) => ({
          employee_id: l.employee_id,
          date: todayIso(),
          type: "repaid" as const,
          amount: l.advance_repayment,
          notes: `Salary repayment — ${monthLabel(periodDate)}`,
        })),
      );
      if (repayError) {
        setError(repayError.message);
        setBusy(false);
        return;
      }
    }

    const { error: finalizeError } = await supabase
      .from("salary_periods")
      .update({ status: "finalized" })
      .eq("id", period.id);
    setBusy(false);
    if (finalizeError) {
      setError(finalizeError.message);
      return;
    }
    setSuccess(`Salary for ${monthLabel(periodDate)} finalized.`);
    await load(periodDate);
  }

  return (
    <>
      <div className="print:hidden">
      <PageHeader
        title="Salary"
        description="Generate, review and finalize monthly salary for every active employee."
      >
        <div className="flex items-center gap-3">
          <input
            type="month"
            className="field max-w-[10rem]"
            value={monthInput}
            onChange={(e) => setMonthInput(e.target.value)}
          />
          {period ? (
            <Pill tone={finalized ? "mint" : "neutral"}>
              {finalized ? "Finalized" : "Draft"}
            </Pill>
          ) : null}
          {rows.length > 0 ? (
            <>
              <Button onClick={() => window.print()}>Print</Button>
              <Button
                onClick={() =>
                  downloadSalaryLedgerExcel(monthLabel(periodDate), ledger.office, ledger.labour)
                }
              >
                Download Excel
              </Button>
            </>
          ) : null}
        </div>
      </PageHeader>

      {error ? <ErrorNote message={error} /> : null}
      {success ? <SuccessNote message={success} /> : null}

      {loading ? (
        <Spinner label="Loading salary…" />
      ) : !period ? (
        <Card className="p-10 text-center">
          <p className="text-[1.05rem] font-medium text-ink">
            No salary period for {monthLabel(periodDate)} yet
          </p>
          <p className="mx-auto mt-1 max-w-md text-[0.9rem] text-ink-soft">
            Generate pre-fills a line per active employee from this month&apos;s attendance —
            you can adjust every figure before finalizing.
          </p>
          <div className="mt-5 flex justify-center">
            <Button variant="primary" disabled={busy} onClick={generate}>
              {busy ? "Generating…" : "Generate"}
            </Button>
          </div>
        </Card>
      ) : (
        <>
          <div className="mb-4 flex flex-wrap items-center justify-end gap-2">
            {!finalized ? (
              <>
                <Button disabled={busy} onClick={generate}>
                  {busy ? "Regenerating…" : "Regenerate"}
                </Button>
                <Button variant="primary" disabled={busy || !dirty} onClick={saveChanges}>
                  Save changes
                </Button>
                {confirmingFinalize ? (
                  <>
                    <span className="text-[0.85rem] text-ink-soft">
                      Locks the period and logs advance repayments — sure?
                    </span>
                    <Button disabled={busy} onClick={() => setConfirmingFinalize(false)}>
                      Cancel
                    </Button>
                    <Button variant="danger" disabled={busy} onClick={finalize}>
                      {busy ? "Finalizing…" : "Confirm finalize"}
                    </Button>
                  </>
                ) : (
                  <Button variant="danger" disabled={busy} onClick={finalize}>
                    Finalize
                  </Button>
                )}
              </>
            ) : null}
          </div>

          <Card className="overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-[0.85rem]">
                <thead>
                  <tr className="border-b border-hairline text-[0.78rem] font-medium text-ink-soft">
                    <th className="px-3 py-3 font-medium">Employee</th>
                    <th className="px-3 py-3 text-right font-medium">Base pay</th>
                    <th className="px-3 py-3 text-right font-medium">Per day</th>
                    <th className="px-3 py-3 text-right font-medium">Leave days</th>
                    <th className="px-3 py-3 text-right font-medium">Deduct days</th>
                    <th className="px-3 py-3 text-right font-medium">Gross</th>
                    <th className="px-3 py-3 text-right font-medium">Short time</th>
                    <th className="px-3 py-3 text-right font-medium">Overtime</th>
                    <th className="px-3 py-3 text-right font-medium">Mess</th>
                    <th className="px-3 py-3 text-right font-medium">Advance</th>
                    <th className="px-3 py-3 text-right font-medium">Net</th>
                    <th className="px-3 py-3 text-right font-medium">Final</th>
                    <th className="px-3 py-3 font-medium">Remarks</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(({ line, employee }) => {
                    const isMonthly = employee.pay_type === "monthly";
                    return (
                      <tr key={line.employee_id} className="border-b border-hairline last:border-0">
                        <td className="px-3 py-2">
                          <p className="font-medium text-ink">{employee.name}</p>
                          <p className="text-[0.75rem] text-ink-soft">
                            #{employee.employee_code} · {isMonthly ? "Monthly" : "Daily"}
                          </p>
                        </td>
                        <td className="px-3 py-2 text-right">
                          <input
                            type="number"
                            step="0.01"
                            disabled={finalized}
                            className="field min-w-[6rem] text-right"
                            value={editValue(line.base_pay)}
                            onChange={(e) => patch(line.employee_id, "base_pay", numOrZero(e.target.value))}
                          />
                        </td>
                        <td className="px-3 py-2 text-right">
                          <input
                            type="number"
                            step="0.01"
                            disabled={finalized || !isMonthly}
                            className={cn("field min-w-[5rem] text-right", !isMonthly && "opacity-40")}
                            value={isMonthly ? editValue(line.per_day_rate) : ""}
                            onChange={(e) =>
                              patch(line.employee_id, "per_day_rate", numOrZero(e.target.value))
                            }
                          />
                        </td>
                        <td className="px-3 py-2 text-right text-ink-soft">{line.leave_days}</td>
                        <td className="px-3 py-2 text-right">
                          <input
                            type="number"
                            step="0.5"
                            disabled={finalized || !isMonthly}
                            className={cn("field min-w-[5rem] text-right", !isMonthly && "opacity-40")}
                            value={isMonthly ? editValue(line.deduction_days) : ""}
                            onChange={(e) =>
                              patch(line.employee_id, "deduction_days", numOrZero(e.target.value))
                            }
                          />
                        </td>
                        <td className="px-3 py-2 text-right font-medium text-ink">
                          {formatMoney(line.gross_salary, "PKR")}
                        </td>
                        <td className="px-3 py-2 text-right">
                          {employee.time_tracking_enabled ? (
                            <input
                              type="number"
                              step="0.01"
                              disabled={finalized}
                              className="field min-w-[6rem] text-right"
                              value={editValue(line.short_time_deduction)}
                              onChange={(e) =>
                                patch(line.employee_id, "short_time_deduction", numOrZero(e.target.value))
                              }
                            />
                          ) : (
                            <span className="text-[0.75rem] text-ink-soft">
                              Not tracked for this employee
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-right">
                          {employee.time_tracking_enabled ? (
                            <input
                              type="number"
                              step="0.01"
                              disabled={finalized}
                              className="field min-w-[5rem] text-right"
                              value={editValue(line.overtime_amount)}
                              onChange={(e) =>
                                patch(line.employee_id, "overtime_amount", numOrZero(e.target.value))
                              }
                            />
                          ) : (
                            <span className="text-[0.75rem] text-ink-soft">
                              Not tracked for this employee
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-right">
                          <input
                            type="number"
                            step="0.01"
                            disabled={finalized}
                            className="field min-w-[5rem] text-right"
                            value={editValue(line.mess_allowance)}
                            onChange={(e) =>
                              patch(line.employee_id, "mess_allowance", numOrZero(e.target.value))
                            }
                          />
                        </td>
                        <td className="px-3 py-2 text-right">
                          <input
                            type="number"
                            step="0.01"
                            disabled={finalized}
                            className="field min-w-[5rem] text-right"
                            value={editValue(line.advance_repayment)}
                            onChange={(e) =>
                              patch(line.employee_id, "advance_repayment", numOrZero(e.target.value))
                            }
                          />
                        </td>
                        <td className="px-3 py-2 text-right font-medium text-ink">
                          {formatMoney(line.net_salary, "PKR")}
                        </td>
                        <td className="px-3 py-2 text-right font-bold text-ink">
                          {formatMoney(line.final_salary, "PKR")}
                        </td>
                        <td className="px-3 py-2">
                          <input
                            disabled={finalized}
                            className="field min-w-[8rem]"
                            value={line.remarks}
                            onChange={(e) => patchRemarks(line.employee_id, e.target.value)}
                          />
                        </td>
                      </tr>
                    );
                  })}
                  {rows.length === 0 ? (
                    <tr>
                      <td colSpan={13} className="px-4 py-8 text-center text-[0.9rem] text-ink-soft">
                        No salary lines. Generate to pre-fill from attendance.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
                {rows.length > 0 ? (
                  <tfoot>
                    <tr className="bg-canvas font-bold text-ink">
                      <td className="px-3 py-3">Total</td>
                      <td className="px-3 py-3 text-right">{formatMoney(totals.base_pay, "PKR")}</td>
                      <td className="px-3 py-3" />
                      <td className="px-3 py-3" />
                      <td className="px-3 py-3" />
                      <td className="px-3 py-3 text-right">{formatMoney(totals.gross_salary, "PKR")}</td>
                      <td className="px-3 py-3 text-right">
                        {formatMoney(totals.short_time_deduction, "PKR")}
                      </td>
                      <td className="px-3 py-3 text-right">{formatMoney(totals.overtime_amount, "PKR")}</td>
                      <td className="px-3 py-3 text-right">{formatMoney(totals.mess_allowance, "PKR")}</td>
                      <td className="px-3 py-3 text-right">
                        {formatMoney(totals.advance_repayment, "PKR")}
                      </td>
                      <td className="px-3 py-3 text-right">{formatMoney(totals.net_salary, "PKR")}</td>
                      <td className="px-3 py-3 text-right">{formatMoney(totals.final_salary, "PKR")}</td>
                      <td className="px-3 py-3" />
                    </tr>
                  </tfoot>
                ) : null}
              </table>
            </div>
          </Card>
        </>
      )}
      </div>
      <SalaryLedgerPrintView
        monthLabel={monthLabel(periodDate)}
        office={ledger.office}
        labour={ledger.labour}
      />
    </>
  );
}

function SalaryLedgerSection({ title, rows }: { title: string; rows: SalaryLedgerRow[] }) {
  if (rows.length === 0) return null;
  const num = (n: number) => formatNumber(n, 2);
  const t = sumSalaryLedgerRows(rows);
  return (
    <>
      <p className="pp-section">{title}</p>
      <table>
        <thead>
          <tr>
            <th>S#</th>
            <th>Name</th>
            <th>Designation</th>
            <th className="v">Per Month Salary</th>
            <th className="v">Days of Month</th>
            <th className="v">Leave</th>
            <th className="v">Deduction days</th>
            <th className="v">Per Day Rate Base on 30</th>
            <th className="v">Gross Salary</th>
            <th className="v">Over time</th>
            <th className="v">Total Advance</th>
            <th className="v">Deduction in this Month</th>
            <th className="v">Bal Advance</th>
            <th className="v">Mess Allowance</th>
            <th className="v">Net Salary</th>
            <th className="v">Short Time Deduction</th>
            <th className="v">Final Salary</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.sNo + r.employeeName}>
              <td>{r.sNo}</td>
              <td>{r.employeeName}</td>
              <td>{r.designation || "—"}</td>
              <td className="v">{num(r.perMonthSalary)}</td>
              <td className="v">{r.daysOfMonth}</td>
              <td className="v">{r.leaveDays}</td>
              <td className="v">{num(r.deductionDays)}</td>
              <td className="v">{num(r.perDayRate)}</td>
              <td className="v">{num(r.grossSalary)}</td>
              <td className="v">{num(r.overtimeAmount)}</td>
              <td className="v">{num(r.totalAdvance)}</td>
              <td className="v">{num(r.deductionThisMonth)}</td>
              <td className="v">{num(r.balAdvance)}</td>
              <td className="v">{num(r.messAllowance)}</td>
              <td className="v">{num(r.netSalary)}</td>
              <td className="v">{num(r.shortTimeDeduction)}</td>
              <td className="v b">{num(r.finalSalary)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <th colSpan={3}>{title} Subtotal</th>
            <th className="v">{num(t.perMonthSalary)}</th>
            <th className="v" />
            <th className="v">{t.leaveDays}</th>
            <th className="v">{num(t.deductionDays)}</th>
            <th className="v" />
            <th className="v">{num(t.grossSalary)}</th>
            <th className="v">{num(t.overtimeAmount)}</th>
            <th className="v">{num(t.totalAdvance)}</th>
            <th className="v">{num(t.deductionThisMonth)}</th>
            <th className="v">{num(t.balAdvance)}</th>
            <th className="v">{num(t.messAllowance)}</th>
            <th className="v">{num(t.netSalary)}</th>
            <th className="v">{num(t.shortTimeDeduction)}</th>
            <th className="v">{num(t.finalSalary)}</th>
          </tr>
        </tfoot>
      </table>
    </>
  );
}

function SalaryLedgerPrintView({
  monthLabel,
  office,
  labour,
}: {
  monthLabel: string;
  office: SalaryLedgerRow[];
  labour: SalaryLedgerRow[];
}) {
  const all = [...office, ...labour];
  if (all.length === 0) return null;
  const num = (n: number) => formatNumber(n, 2);
  const grand = sumSalaryLedgerRows(all);
  const fontSize = compactPrintFontSize(all.length + 6);
  return (
    <div
      className="print-plain landscape hidden print:block"
      style={{ "--pp-font-size": `${fontSize}px` } as React.CSSProperties}
    >
      <p className="pp-hdr">MANZA TEXTILE MILLS</p>
      <p className="pp-sub">FOR THE MONTH OF {monthLabel.toUpperCase()}</p>
      <SalaryLedgerSection title="Office Staff" rows={office} />
      <SalaryLedgerSection title="Labour Staff" rows={labour} />
      <table>
        <tbody>
          <tr>
            <th colSpan={3}>Grand Total</th>
            <th className="v">{num(grand.perMonthSalary)}</th>
            <th className="v" />
            <th className="v">{grand.leaveDays}</th>
            <th className="v">{num(grand.deductionDays)}</th>
            <th className="v" />
            <th className="v">{num(grand.grossSalary)}</th>
            <th className="v">{num(grand.overtimeAmount)}</th>
            <th className="v">{num(grand.totalAdvance)}</th>
            <th className="v">{num(grand.deductionThisMonth)}</th>
            <th className="v">{num(grand.balAdvance)}</th>
            <th className="v">{num(grand.messAllowance)}</th>
            <th className="v">{num(grand.netSalary)}</th>
            <th className="v">{num(grand.shortTimeDeduction)}</th>
            <th className="v">{num(grand.finalSalary)}</th>
          </tr>
        </tbody>
      </table>
    </div>
  );
}
