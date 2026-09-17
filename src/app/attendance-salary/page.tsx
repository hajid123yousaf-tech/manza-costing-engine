"use client";

import { useEffect, useState } from "react";
import {
  Users,
  CheckCircle2,
  XCircle,
  CalendarClock,
  HandCoins,
  UserCog,
  Wallet,
  Banknote,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { todayIso } from "@/lib/attendanceSalary";
import { formatMoney } from "@/lib/format";
import type { AdvanceTransaction, AttendanceRecord } from "@/lib/types";
import {
  Card,
  EntryCard,
  ErrorNote,
  KpiCard,
  PageHeader,
  Spinner,
} from "@/components/ui";

interface Kpis {
  activeEmployees: number;
  present: number;
  absent: number;
  leave: number;
  advanceBalance: number;
}

export default function AttendanceSalaryDashboard() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [kpis, setKpis] = useState<Kpis>({
    activeEmployees: 0,
    present: 0,
    absent: 0,
    leave: 0,
    advanceBalance: 0,
  });

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const [empRes, attRes, advRes] = await Promise.all([
        supabase.from("employees").select("id, is_active"),
        supabase
          .from("attendance_records")
          .select("status")
          .eq("date", todayIso()),
        supabase.from("advance_transactions").select("type, amount"),
      ]);

      if (cancelled) return;

      if (empRes.error || attRes.error || advRes.error) {
        setError(
          empRes.error?.message ||
            attRes.error?.message ||
            advRes.error?.message ||
            "Failed to load dashboard.",
        );
        setLoading(false);
        return;
      }

      const employees = empRes.data ?? [];
      const attendance = (attRes.data ?? []) as Pick<AttendanceRecord, "status">[];
      const advances = (advRes.data ?? []) as Pick<AdvanceTransaction, "type" | "amount">[];

      setKpis({
        activeEmployees: employees.filter((e) => e.is_active).length,
        present: attendance.filter((a) => a.status === "present").length,
        absent: attendance.filter((a) => a.status === "absent").length,
        leave: attendance.filter((a) => a.status === "leave" || a.status === "half_day").length,
        advanceBalance: advances.reduce(
          (sum, a) => sum + (a.type === "given" ? Number(a.amount) : -Number(a.amount)),
          0,
        ),
      });
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div>
      <PageHeader
        title="Attendance & Salary"
        description="Staff attendance, advances and monthly payroll in one place."
      />

      {error ? <ErrorNote message={error} /> : null}

      {loading ? (
        <Spinner label="Loading dashboard…" />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-5 lg:grid-cols-5">
            <KpiCard family="peach" icon={Users} label="Active employees" value={kpis.activeEmployees} />
            <KpiCard family="mint" icon={CheckCircle2} label="Present today" value={kpis.present} />
            <KpiCard family="lavender" icon={XCircle} label="Absent today" value={kpis.absent} />
            <KpiCard family="peach" icon={CalendarClock} label="Leave / half day today" value={kpis.leave} />
            <KpiCard
              family="mint"
              icon={HandCoins}
              label="Advance balance"
              value={formatMoney(kpis.advanceBalance, "PKR")}
            />
          </div>

          <div className="mt-8 grid grid-cols-1 gap-5 sm:grid-cols-2">
            <EntryCard
              href="/attendance-salary/employees"
              icon={UserCog}
              title="Employees"
              description="Add staff, set pay type and default shift hours."
            />
            <EntryCard
              href="/attendance-salary/attendance"
              icon={CheckCircle2}
              title="Attendance"
              description="Mark daily attendance, check-in/out and shift for every active employee."
            />
            <EntryCard
              href="/attendance-salary/advances"
              icon={Wallet}
              title="Advances"
              description="Log cash given and repaid, and see each employee's running balance."
            />
            <EntryCard
              href="/attendance-salary/salary"
              icon={Banknote}
              title="Salary"
              description="Generate, review and finalize monthly salary from attendance and advances."
            />
          </div>

          <div className="mt-8">
            <Card className="p-6">
              <p className="text-[0.9rem] text-ink-soft">
                Salary is generated per calendar month from that month&apos;s attendance, then
                finalized once figures are confirmed.
              </p>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
