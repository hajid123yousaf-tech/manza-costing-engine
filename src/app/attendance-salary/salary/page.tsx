"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import {
  currentMonthInput,
  generateSalaryLine,
  monthInputToPeriod,
  monthLabel,
  monthRange,
  recalcSalaryLine,
  todayIso,
  type EditableSalaryFields,
} from "@/lib/attendanceSalary";
import { downloadSalaryExcel } from "@/lib/attendanceSalaryExcel";
import { formatMoney, formatNumber } from "@/lib/format";
import type { AttendanceRecord, Employee, SalaryLine, SalaryPeriod } from "@/lib/types";
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

    const [empRes, periodRes] = await Promise.all([
      supabase.from("employees").select("*"),
      supabase.from("salary_periods").select("*").eq("period_month", forPeriod).maybeSingle(),
    ]);
    if (empRes.error || periodRes.error) {
      setError(empRes.error?.message || periodRes.error?.message || "Failed to load.");
      setLoading(false);
      return;
    }
    const empMap: Record<string, Employee> = {};
    for (const e of (empRes.data ?? []) as Employee[]) empMap[e.id] = e;
    setEmployees(empMap);

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
                  downloadSalaryExcel(
                    monthLabel(periodDate),
                    rows.map(({ line, employee }) => ({
                      employeeCode: employee.employee_code,
                      employeeName: employee.name,
                      payType: employee.pay_type,
                      timeTrackingEnabled: employee.time_tracking_enabled,
                      base_pay: line.base_pay,
                      per_day_rate: line.per_day_rate,
                      leave_days: line.leave_days,
                      deduction_days: line.deduction_days,
                      gross_salary: line.gross_salary,
                      short_time_deduction: line.short_time_deduction,
                      overtime_amount: line.overtime_amount,
                      mess_allowance: line.mess_allowance,
                      advance_repayment: line.advance_repayment,
                      net_salary: line.net_salary,
                      final_salary: line.final_salary,
                    })),
                  )
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
      <SalaryPrintView monthLabel={monthLabel(periodDate)} rows={rows} totals={totals} />
    </>
  );
}

function SalaryPrintView({
  monthLabel,
  rows,
  totals,
}: {
  monthLabel: string;
  rows: { line: LineDraft; employee: Employee }[];
  totals: {
    base_pay: number;
    gross_salary: number;
    short_time_deduction: number;
    overtime_amount: number;
    mess_allowance: number;
    advance_repayment: number;
    net_salary: number;
    final_salary: number;
  };
}) {
  if (rows.length === 0) return null;
  const num = (n: number) => formatNumber(n, 2);
  return (
    <div className="print-plain hidden print:block">
      <p className="pp-hdr">MANZA TEXTILE MILLS</p>
      <p className="pp-sub">Salary — {monthLabel}</p>
      <table>
        <thead>
          <tr>
            <th>Employee</th>
            <th className="v">Base pay</th>
            <th className="v">Per day</th>
            <th className="v">Leave days</th>
            <th className="v">Deduct days</th>
            <th className="v">Gross</th>
            <th className="v">Short time</th>
            <th className="v">Overtime</th>
            <th className="v">Mess</th>
            <th className="v">Advance</th>
            <th className="v">Net</th>
            <th className="v">Final</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ line, employee }) => {
            const isMonthly = employee.pay_type === "monthly";
            return (
              <tr key={line.employee_id}>
                <td>
                  #{employee.employee_code} {employee.name}
                </td>
                <td className="v">{num(line.base_pay)}</td>
                <td className="v">{isMonthly ? num(line.per_day_rate) : "—"}</td>
                <td className="v">{line.leave_days}</td>
                <td className="v">{isMonthly ? num(line.deduction_days) : "—"}</td>
                <td className="v">{num(line.gross_salary)}</td>
                <td className="v">
                  {employee.time_tracking_enabled ? num(line.short_time_deduction) : "—"}
                </td>
                <td className="v">
                  {employee.time_tracking_enabled ? num(line.overtime_amount) : "—"}
                </td>
                <td className="v">{num(line.mess_allowance)}</td>
                <td className="v">{num(line.advance_repayment)}</td>
                <td className="v">{num(line.net_salary)}</td>
                <td className="v b">{num(line.final_salary)}</td>
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr>
            <th>Total</th>
            <th className="v">{num(totals.base_pay)}</th>
            <th className="v" />
            <th className="v" />
            <th className="v" />
            <th className="v">{num(totals.gross_salary)}</th>
            <th className="v">{num(totals.short_time_deduction)}</th>
            <th className="v">{num(totals.overtime_amount)}</th>
            <th className="v">{num(totals.mess_allowance)}</th>
            <th className="v">{num(totals.advance_repayment)}</th>
            <th className="v">{num(totals.net_salary)}</th>
            <th className="v">{num(totals.final_salary)}</th>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
