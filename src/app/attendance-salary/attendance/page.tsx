"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import {
  compactPrintFontSize,
  computeMonthlyAttendanceStats,
  currentMonthInput,
  dateLabel,
  fromTimeInputValue,
  monthInputToPeriod,
  monthLabel,
  monthRange,
  splitByCategory,
  sumMonthlySummaryRows,
  todayIso,
  toTimeInputValue,
  type MonthlySummaryRow,
} from "@/lib/attendanceSalary";
import { downloadAttendanceExcel, downloadMonthlySummaryExcel } from "@/lib/attendanceSalaryExcel";
import { formatNumber, formatMoney } from "@/lib/format";
import {
  ATTENDANCE_STATUSES,
  SHIFTS,
  type AttendanceRecord,
  type AttendanceStatus,
  type Employee,
  type Shift,
} from "@/lib/types";
import { Button, Card, ErrorNote, PageHeader, Spinner, SuccessNote, cn } from "@/components/ui";

const STATUS_LABEL: Record<AttendanceStatus, string> = {
  present: "Present",
  absent: "Absent",
  leave: "Leave",
  half_day: "Half Day",
};

interface Draft {
  status: AttendanceStatus;
  check_in: string;
  check_out: string;
  shift: Shift | "";
  notes: string;
}

const blankDraft = (staffCategory: Employee["staff_category"]): Draft => ({
  status: "present",
  check_in: "",
  check_out: "",
  shift: staffCategory === "labour" ? "day" : "",
  notes: "",
});

const timeNeeded = (status: AttendanceStatus) =>
  status === "present" || status === "half_day";

export default function AttendancePage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [date, setDate] = useState(todayIso());
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});

  const [view, setView] = useState<"daily" | "summary">("daily");
  const [summaryMonth, setSummaryMonth] = useState(currentMonthInput());
  const [summaryLoading, setSummaryLoading] = useState(true);
  const [summaryRows, setSummaryRows] = useState<
    { employee: Employee; row: MonthlySummaryRow }[]
  >([]);

  const load = useCallback(async (forDate: string) => {
    setLoading(true);
    setError(null);
    setSuccess(null);
    const [empRes, recRes] = await Promise.all([
      supabase
        .from("employees")
        .select("*")
        .eq("is_active", true)
        .order("employee_code", { ascending: true }),
      supabase.from("attendance_records").select("*").eq("date", forDate),
    ]);
    if (empRes.error || recRes.error) {
      setError(empRes.error?.message || recRes.error?.message || "Failed to load.");
      setLoading(false);
      return;
    }
    const emps = (empRes.data ?? []) as Employee[];
    const records = (recRes.data ?? []) as AttendanceRecord[];
    const byEmployee = new Map(records.map((r) => [r.employee_id, r]));

    const nextDrafts: Record<string, Draft> = {};
    for (const e of emps) {
      const r = byEmployee.get(e.id);
      nextDrafts[e.id] = r
        ? {
            status: r.status,
            check_in: toTimeInputValue(r.check_in),
            check_out: toTimeInputValue(r.check_out),
            shift: r.shift ?? (e.staff_category === "labour" ? "day" : ""),
            notes: r.notes ?? "",
          }
        : blankDraft(e.staff_category);
    }

    setEmployees(emps);
    setDrafts(nextDrafts);
    setLoading(false);
  }, []);

  useEffect(() => {
    void (async () => {
      await load(date);
    })();
  }, [date, load]);

  const loadSummary = useCallback(async (monthInput: string) => {
    setSummaryLoading(true);
    setError(null);
    const period = monthInputToPeriod(monthInput);
    const { start, end } = monthRange(period);
    const [empRes, recRes] = await Promise.all([
      supabase
        .from("employees")
        .select("*")
        .eq("is_active", true)
        .order("employee_code", { ascending: true }),
      supabase.from("attendance_records").select("*").gte("date", start).lte("date", end),
    ]);
    if (empRes.error || recRes.error) {
      setError(empRes.error?.message || recRes.error?.message || "Failed to load.");
      setSummaryLoading(false);
      return;
    }
    const emps = (empRes.data ?? []) as Employee[];
    const records = (recRes.data ?? []) as AttendanceRecord[];
    const recordsByEmployee = new Map<string, AttendanceRecord[]>();
    for (const r of records) {
      const list = recordsByEmployee.get(r.employee_id) ?? [];
      list.push(r);
      recordsByEmployee.set(r.employee_id, list);
    }
    setSummaryRows(
      emps.map((employee) => {
        const stats = computeMonthlyAttendanceStats(
          employee,
          period,
          recordsByEmployee.get(employee.id) ?? [],
        );
        return {
          employee,
          row: { employeeName: employee.name, designation: employee.designation ?? "", ...stats },
        };
      }),
    );
    setSummaryLoading(false);
  }, []);

  useEffect(() => {
    if (view !== "summary") return;
    void (async () => {
      await loadSummary(summaryMonth);
    })();
  }, [view, summaryMonth, loadSummary]);

  const summary = useMemo(() => {
    const withCategory = summaryRows.map(({ employee, row }) => ({
      ...row,
      staff_category: employee.staff_category,
    }));
    return splitByCategory(withCategory);
  }, [summaryRows]);

  function patch(employeeId: string, patchValue: Partial<Draft>) {
    setDrafts((prev) => ({
      ...prev,
      [employeeId]: { ...prev[employeeId], ...patchValue },
    }));
  }

  function shiftDate(days: number) {
    const d = new Date(`${date}T00:00:00`);
    d.setDate(d.getDate() + days);
    setDate(
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`,
    );
  }

  async function saveAll() {
    setSaving(true);
    setError(null);
    setSuccess(null);
    const rows = employees.map((e) => {
      const d = drafts[e.id];
      const needsTime = timeNeeded(d.status);
      return {
        employee_id: e.id,
        date,
        status: d.status,
        check_in: needsTime && d.check_in ? fromTimeInputValue(d.check_in) : null,
        check_out: needsTime && d.check_out ? fromTimeInputValue(d.check_out) : null,
        shift: e.staff_category === "labour" && d.shift ? d.shift : null,
        notes: d.notes.trim() || null,
      };
    });
    const { error } = await supabase
      .from("attendance_records")
      .upsert(rows, { onConflict: "employee_id,date" });
    setSaving(false);
    if (error) {
      setError(error.message);
      return;
    }
    setSuccess(`Saved attendance for ${employees.length} employee${employees.length === 1 ? "" : "s"}.`);
    await load(date);
  }

  return (
    <>
      <div className="print:hidden">
      <PageHeader
        title="Attendance"
        description={
          view === "daily"
            ? "Mark today's attendance, or step back to review and correct an earlier date."
            : "Days present, absent, leave, late minutes and overtime for every active employee this month."
        }
      >
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex gap-1 rounded-full border border-hairline bg-canvas p-1">
            {(["daily", "summary"] as const).map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => setView(v)}
                className={cn(
                  "rounded-full px-3.5 py-1.5 text-[0.85rem] font-medium transition-colors",
                  view === v ? "bg-ink text-white" : "text-ink-soft hover:text-ink",
                )}
              >
                {v === "daily" ? "Daily" : "Monthly Summary"}
              </button>
            ))}
          </div>

          {view === "daily" ? (
            <>
              <Button onClick={() => shiftDate(-1)} aria-label="Previous day">
                ←
              </Button>
              <input
                type="date"
                className="field max-w-[10rem]"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
              <Button onClick={() => shiftDate(1)} aria-label="Next day">
                →
              </Button>
              {date !== todayIso() ? (
                <Button onClick={() => setDate(todayIso())}>Today</Button>
              ) : null}
              {employees.length > 0 ? (
                <>
                  <Button onClick={() => window.print()}>Print</Button>
                  <Button
                    onClick={() => {
                      const rows = employees.map((e) => {
                        const d = drafts[e.id];
                        const needsTime = timeNeeded(d.status);
                        return {
                          employeeCode: e.employee_code,
                          employeeName: e.name,
                          designation: e.designation ?? "",
                          status: STATUS_LABEL[d.status],
                          checkIn: needsTime ? d.check_in : "",
                          checkOut: needsTime ? d.check_out : "",
                          shift: e.staff_category === "labour" ? d.shift : "",
                          staff_category: e.staff_category,
                        };
                      });
                      const { office, labour } = splitByCategory(rows);
                      downloadAttendanceExcel(dateLabel(date), office, labour);
                    }}
                  >
                    Download Excel
                  </Button>
                </>
              ) : null}
            </>
          ) : (
            <>
              <input
                type="month"
                className="field max-w-[10rem]"
                value={summaryMonth}
                onChange={(e) => setSummaryMonth(e.target.value)}
              />
              {summary.office.length + summary.labour.length > 0 ? (
                <>
                  <Button onClick={() => window.print()}>Print</Button>
                  <Button
                    onClick={() =>
                      downloadMonthlySummaryExcel(
                        monthLabel(monthInputToPeriod(summaryMonth)),
                        summary.office,
                        summary.labour,
                      )
                    }
                  >
                    Download Excel
                  </Button>
                </>
              ) : null}
            </>
          )}
        </div>
      </PageHeader>

      {error ? <ErrorNote message={error} /> : null}
      {success ? <SuccessNote message={success} /> : null}

      {view === "summary" ? (
        summaryLoading ? (
          <Spinner label="Loading summary…" />
        ) : (
          <AttendanceSummaryTables office={summary.office} labour={summary.labour} />
        )
      ) : loading ? (
        <Spinner label="Loading attendance…" />
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-[0.95rem]">
              <thead>
                <tr className="border-b border-hairline text-[0.8rem] font-medium text-ink-soft">
                  <th className="px-4 py-3 font-medium">Employee</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Check in</th>
                  <th className="px-4 py-3 font-medium">Check out</th>
                  <th className="px-4 py-3 font-medium">Shift</th>
                  <th className="px-4 py-3 font-medium">Notes</th>
                </tr>
              </thead>
              <tbody>
                {employees.map((e) => {
                  const d = drafts[e.id];
                  if (!d) return null;
                  const needsTime = timeNeeded(d.status);
                  const isLabour = e.staff_category === "labour";
                  return (
                    <tr key={e.id} className="border-b border-hairline last:border-0">
                      <td className="px-4 py-2">
                        <p className="font-medium text-ink">{e.name}</p>
                        <p className="text-[0.8rem] text-ink-soft">
                          #{e.employee_code} · {e.designation || "—"}
                        </p>
                      </td>
                      <td className="px-4 py-2">
                        <select
                          className="field min-w-[8.5rem]"
                          value={d.status}
                          onChange={(ev) =>
                            patch(e.id, { status: ev.target.value as AttendanceStatus })
                          }
                        >
                          {ATTENDANCE_STATUSES.map((s) => (
                            <option key={s.value} value={s.value}>
                              {s.label}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="px-4 py-2">
                        <input
                          type="time"
                          className={cn("field min-w-[7.5rem]", !needsTime && "opacity-40")}
                          disabled={!needsTime}
                          value={d.check_in}
                          onChange={(ev) => patch(e.id, { check_in: ev.target.value })}
                        />
                      </td>
                      <td className="px-4 py-2">
                        <input
                          type="time"
                          className={cn("field min-w-[7.5rem]", !needsTime && "opacity-40")}
                          disabled={!needsTime}
                          value={d.check_out}
                          onChange={(ev) => patch(e.id, { check_out: ev.target.value })}
                        />
                      </td>
                      <td className="px-4 py-2">
                        <select
                          className={cn("field min-w-[6.5rem]", !isLabour && "opacity-40")}
                          disabled={!isLabour}
                          value={isLabour ? d.shift || "day" : ""}
                          onChange={(ev) => patch(e.id, { shift: ev.target.value as Shift })}
                        >
                          {isLabour ? (
                            SHIFTS.map((s) => (
                              <option key={s.value} value={s.value}>
                                {s.label}
                              </option>
                            ))
                          ) : (
                            <option value="">—</option>
                          )}
                        </select>
                      </td>
                      <td className="px-4 py-2">
                        <input
                          className="field min-w-[9rem]"
                          value={d.notes}
                          onChange={(ev) => patch(e.id, { notes: ev.target.value })}
                        />
                      </td>
                    </tr>
                  );
                })}
                {employees.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-[0.9rem] text-ink-soft">
                      No active employees. Add some on the Employees page first.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
          {employees.length > 0 ? (
            <div className="flex justify-end border-t border-hairline px-4 py-3">
              <Button variant="primary" disabled={saving} onClick={saveAll}>
                {saving ? "Saving…" : "Save attendance"}
              </Button>
            </div>
          ) : null}
        </Card>
      )}
      </div>
      {view === "daily" ? (
        <AttendanceDailyPrintView date={date} employees={employees} drafts={drafts} />
      ) : (
        <MonthlySummaryPrintView
          monthLabel={monthLabel(monthInputToPeriod(summaryMonth))}
          office={summary.office}
          labour={summary.labour}
        />
      )}
    </>
  );
}

/** On-screen (non-print) read-only preview for the Monthly Summary tab. */
function AttendanceSummaryTables({
  office,
  labour,
}: {
  office: MonthlySummaryRow[];
  labour: MonthlySummaryRow[];
}) {
  if (office.length === 0 && labour.length === 0) {
    return (
      <Card className="p-10 text-center">
        <p className="text-[0.95rem] text-ink-soft">
          No active employees, or no attendance recorded for this month yet.
        </p>
      </Card>
    );
  }
  return (
    <div className="space-y-6">
      <SummarySection title="Office Staff" rows={office} />
      <SummarySection title="Labour Staff" rows={labour} />
    </div>
  );
}

function SummarySection({ title, rows }: { title: string; rows: MonthlySummaryRow[] }) {
  if (rows.length === 0) return null;
  const t = sumMonthlySummaryRows(rows);
  return (
    <Card className="overflow-hidden">
      <div className="border-b border-hairline px-4 py-3">
        <h2 className="text-[1rem] font-semibold text-ink">{title}</h2>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-[0.9rem]">
          <thead>
            <tr className="border-b border-hairline text-[0.78rem] font-medium text-ink-soft">
              <th className="px-3 py-2 font-medium">Employee</th>
              <th className="px-3 py-2 text-right font-medium">Present</th>
              <th className="px-3 py-2 text-right font-medium">Absent</th>
              <th className="px-3 py-2 text-right font-medium">Leave</th>
              <th className="px-3 py-2 text-right font-medium">Half day</th>
              <th className="px-3 py-2 text-right font-medium">Late (min)</th>
              <th className="px-3 py-2 text-right font-medium">OT (min)</th>
              <th className="px-3 py-2 text-right font-medium">Short time</th>
              <th className="px-3 py-2 text-right font-medium">Overtime</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.employeeName + r.designation} className="border-b border-hairline last:border-0">
                <td className="px-3 py-2">
                  <p className="font-medium text-ink">{r.employeeName}</p>
                  <p className="text-[0.75rem] text-ink-soft">{r.designation || "—"}</p>
                </td>
                <td className="px-3 py-2 text-right">{r.present}</td>
                <td className="px-3 py-2 text-right">{r.absent}</td>
                <td className="px-3 py-2 text-right">{r.leave}</td>
                <td className="px-3 py-2 text-right">{r.halfDay}</td>
                <td className="px-3 py-2 text-right">{r.lateMinutes}</td>
                <td className="px-3 py-2 text-right">{r.overtimeMinutes}</td>
                <td className="px-3 py-2 text-right">{formatMoney(r.shortTimeAmount, "PKR")}</td>
                <td className="px-3 py-2 text-right">{formatMoney(r.overtimeAmount, "PKR")}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="bg-canvas font-bold text-ink">
              <td className="px-3 py-3">Total</td>
              <td className="px-3 py-3 text-right">{t.present}</td>
              <td className="px-3 py-3 text-right">{t.absent}</td>
              <td className="px-3 py-3 text-right">{t.leave}</td>
              <td className="px-3 py-3 text-right">{t.halfDay}</td>
              <td className="px-3 py-3 text-right">{t.lateMinutes}</td>
              <td className="px-3 py-3 text-right">{t.overtimeMinutes}</td>
              <td className="px-3 py-3 text-right">{formatMoney(t.shortTimeAmount, "PKR")}</td>
              <td className="px-3 py-3 text-right">{formatMoney(t.overtimeAmount, "PKR")}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </Card>
  );
}

function AttendanceDailyPrintSection({
  title,
  employees,
  drafts,
}: {
  title: string;
  employees: Employee[];
  drafts: Record<string, Draft>;
}) {
  if (employees.length === 0) return null;
  return (
    <>
      <p className="pp-section">{title}</p>
      <table>
        <thead>
          <tr>
            <th>Employee</th>
            <th>Designation</th>
            <th>Status</th>
            <th>Check in</th>
            <th>Check out</th>
            <th>Shift</th>
          </tr>
        </thead>
        <tbody>
          {employees.map((e) => {
            const d = drafts[e.id];
            if (!d) return null;
            const needsTime = timeNeeded(d.status);
            const isLabour = e.staff_category === "labour";
            return (
              <tr key={e.id}>
                <td>
                  #{e.employee_code} {e.name}
                </td>
                <td>{e.designation || "—"}</td>
                <td>{STATUS_LABEL[d.status]}</td>
                <td>{needsTime && d.check_in ? d.check_in : "—"}</td>
                <td>{needsTime && d.check_out ? d.check_out : "—"}</td>
                <td>{isLabour && d.shift ? (d.shift === "day" ? "Day" : "Night") : "—"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </>
  );
}

function AttendanceDailyPrintView({
  date,
  employees,
  drafts,
}: {
  date: string;
  employees: Employee[];
  drafts: Record<string, Draft>;
}) {
  if (employees.length === 0) return null;
  const { office, labour } = splitByCategory(employees);
  return (
    <div className="print-plain hidden print:block">
      <p className="pp-hdr">MANZA TEXTILE MILLS</p>
      <p className="pp-sub">Attendance — {dateLabel(date)}</p>
      <AttendanceDailyPrintSection title="Office Staff" employees={office} drafts={drafts} />
      <AttendanceDailyPrintSection title="Labour Staff" employees={labour} drafts={drafts} />
    </div>
  );
}

function MonthlySummarySection({ title, rows }: { title: string; rows: MonthlySummaryRow[] }) {
  if (rows.length === 0) return null;
  const t = sumMonthlySummaryRows(rows);
  return (
    <>
      <p className="pp-section">{title}</p>
      <table>
        <thead>
          <tr>
            <th>Employee</th>
            <th>Designation</th>
            <th className="v">Present</th>
            <th className="v">Absent</th>
            <th className="v">Leave</th>
            <th className="v">Half day</th>
            <th className="v">Late (min)</th>
            <th className="v">OT (min)</th>
            <th className="v">Short time</th>
            <th className="v">Overtime</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.employeeName + r.designation}>
              <td>{r.employeeName}</td>
              <td>{r.designation || "—"}</td>
              <td className="v">{r.present}</td>
              <td className="v">{r.absent}</td>
              <td className="v">{r.leave}</td>
              <td className="v">{r.halfDay}</td>
              <td className="v">{r.lateMinutes}</td>
              <td className="v">{r.overtimeMinutes}</td>
              <td className="v">{formatNumber(r.shortTimeAmount, 2)}</td>
              <td className="v b">{formatNumber(r.overtimeAmount, 2)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <th colSpan={2}>{title} Subtotal</th>
            <th className="v">{t.present}</th>
            <th className="v">{t.absent}</th>
            <th className="v">{t.leave}</th>
            <th className="v">{t.halfDay}</th>
            <th className="v">{t.lateMinutes}</th>
            <th className="v">{t.overtimeMinutes}</th>
            <th className="v">{formatNumber(t.shortTimeAmount, 2)}</th>
            <th className="v">{formatNumber(t.overtimeAmount, 2)}</th>
          </tr>
        </tfoot>
      </table>
    </>
  );
}

function MonthlySummaryPrintView({
  monthLabel,
  office,
  labour,
}: {
  monthLabel: string;
  office: MonthlySummaryRow[];
  labour: MonthlySummaryRow[];
}) {
  const total = office.length + labour.length;
  if (total === 0) return null;
  const fontSize = compactPrintFontSize(total + 4);
  return (
    <div
      className="print-plain hidden print:block"
      style={{ "--pp-font-size": `${fontSize}px` } as React.CSSProperties}
    >
      <p className="pp-hdr">MANZA TEXTILE MILLS</p>
      <p className="pp-sub">Monthly Attendance Summary — {monthLabel}</p>
      <MonthlySummarySection title="Office Staff" rows={office} />
      <MonthlySummarySection title="Labour Staff" rows={labour} />
    </div>
  );
}
