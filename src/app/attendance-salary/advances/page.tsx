"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { advanceBalance, dateLabel, todayIso } from "@/lib/attendanceSalary";
import { downloadAdvancesExcel } from "@/lib/attendanceSalaryExcel";
import { formatMoney } from "@/lib/format";
import { ADVANCE_TYPES, type AdvanceTransaction, type AdvanceType, type Employee } from "@/lib/types";
import {
  Button,
  Card,
  ErrorNote,
  Field,
  PageHeader,
  Pill,
  SectionHeading,
  Spinner,
  cn,
} from "@/components/ui";

interface NewTxn {
  employee_id: string;
  date: string;
  type: AdvanceType;
  amount: number;
  notes: string;
}

function blankTxn(employeeId: string): NewTxn {
  return { employee_id: employeeId, date: todayIso(), type: "given", amount: 0, notes: "" };
}

export default function AdvancesPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [transactions, setTransactions] = useState<AdvanceTransaction[]>([]);
  const [filter, setFilter] = useState<string>("all");
  const [form, setForm] = useState<NewTxn>(blankTxn(""));
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    const [empRes, txnRes] = await Promise.all([
      supabase.from("employees").select("*").order("employee_code", { ascending: true }),
      supabase
        .from("advance_transactions")
        .select("*")
        .order("date", { ascending: false })
        .order("created_at", { ascending: false }),
    ]);
    if (empRes.error || txnRes.error) {
      setError(empRes.error?.message || txnRes.error?.message || "Failed to load.");
      setLoading(false);
      return;
    }
    const emps = (empRes.data ?? []) as Employee[];
    setEmployees(emps);
    setTransactions((txnRes.data ?? []) as AdvanceTransaction[]);
    setForm((f) => (f.employee_id ? f : blankTxn(emps.find((e) => e.is_active)?.id ?? emps[0]?.id ?? "")));
    setLoading(false);
  }, []);

  useEffect(() => {
    void (async () => {
      await load();
    })();
  }, [load]);

  const balances = useMemo(() => {
    const byEmployee = new Map<string, AdvanceTransaction[]>();
    for (const t of transactions) {
      const list = byEmployee.get(t.employee_id) ?? [];
      list.push(t);
      byEmployee.set(t.employee_id, list);
    }
    return employees.map((e) => {
      const list = byEmployee.get(e.id) ?? [];
      return {
        employee: e,
        given: list.filter((t) => t.type === "given").reduce((s, t) => s + Number(t.amount), 0),
        repaid: list.filter((t) => t.type === "repaid").reduce((s, t) => s + Number(t.amount), 0),
        balance: advanceBalance(list),
      };
    });
  }, [employees, transactions]);

  const filteredTransactions = useMemo(
    () => (filter === "all" ? transactions : transactions.filter((t) => t.employee_id === filter)),
    [transactions, filter],
  );

  const employeeName = (id: string) => employees.find((e) => e.id === id)?.name ?? "—";

  const scopeLabel =
    filter === "all"
      ? "All employees"
      : (() => {
          const e = employees.find((emp) => emp.id === filter);
          return e ? `#${e.employee_code} ${e.name}` : "All employees";
        })();

  async function submit() {
    if (!form.employee_id) {
      setError("Choose an employee first.");
      return;
    }
    if (!(form.amount > 0)) {
      setError("Enter an amount greater than zero.");
      return;
    }
    setSubmitting(true);
    setError(null);
    const { error } = await supabase.from("advance_transactions").insert({
      employee_id: form.employee_id,
      date: form.date,
      type: form.type,
      amount: form.amount,
      notes: form.notes.trim() || null,
    });
    setSubmitting(false);
    if (error) {
      setError(error.message);
      return;
    }
    setForm((f) => ({ ...blankTxn(f.employee_id), date: f.date }));
    await load();
  }

  return (
    <>
      <div className="print:hidden">
      <PageHeader
        title="Advances"
        description="Track cash advances given to staff and what's been deducted from salary."
      >
        {employees.length > 0 ? (
          <div className="flex items-center gap-2">
            <Button onClick={() => window.print()}>Print</Button>
            <Button
              onClick={() =>
                downloadAdvancesExcel(
                  scopeLabel,
                  balances.map((b) => ({
                    employeeCode: b.employee.employee_code,
                    employeeName: b.employee.name,
                    given: b.given,
                    repaid: b.repaid,
                    balance: b.balance,
                  })),
                  filteredTransactions.map((t) => ({
                    date: dateLabel(t.date),
                    employeeName: employeeName(t.employee_id),
                    type: t.type,
                    amount: Number(t.amount),
                    notes: t.notes ?? "",
                  })),
                )
              }
            >
              Download Excel
            </Button>
          </div>
        ) : null}
      </PageHeader>

      {error ? <ErrorNote message={error} /> : null}

      {loading ? (
        <Spinner label="Loading advances…" />
      ) : (
        <>
          <Card className="mb-6 p-6">
            <SectionHeading title="Log a transaction" />
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
              <Field label="Employee">
                <select
                  className="field"
                  value={form.employee_id}
                  onChange={(e) => setForm((f) => ({ ...f, employee_id: e.target.value }))}
                >
                  {employees.map((e) => (
                    <option key={e.id} value={e.id}>
                      #{e.employee_code} {e.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Date">
                <input
                  type="date"
                  className="field"
                  value={form.date}
                  onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
                />
              </Field>
              <Field label="Type">
                <div className="inline-flex gap-1 rounded-full border border-hairline bg-canvas p-1">
                  {ADVANCE_TYPES.map((t) => (
                    <button
                      key={t.value}
                      type="button"
                      onClick={() => setForm((f) => ({ ...f, type: t.value }))}
                      className={cn(
                        "rounded-full px-3.5 py-1.5 text-[0.85rem] font-medium transition-colors",
                        form.type === t.value
                          ? "bg-ink text-white"
                          : "text-ink-soft hover:text-ink",
                      )}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
              </Field>
              <Field label="Amount">
                <input
                  type="number"
                  step="0.01"
                  className="field"
                  placeholder="0"
                  value={form.amount === 0 ? "" : form.amount}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, amount: e.target.value === "" ? 0 : Number(e.target.value) }))
                  }
                />
              </Field>
              <Field label="Notes">
                <input
                  className="field"
                  value={form.notes}
                  onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                />
              </Field>
            </div>
            <div className="mt-5 flex justify-end">
              <Button variant="primary" disabled={submitting} onClick={submit}>
                {submitting ? "Saving…" : "Log transaction"}
              </Button>
            </div>
          </Card>

          <Card className="mb-6 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-[0.95rem]">
                <thead>
                  <tr className="border-b border-hairline text-[0.8rem] font-medium text-ink-soft">
                    <th className="px-4 py-3 font-medium">Employee</th>
                    <th className="px-4 py-3 text-right font-medium">Given</th>
                    <th className="px-4 py-3 text-right font-medium">Deducted</th>
                    <th className="px-4 py-3 text-right font-medium">Balance</th>
                  </tr>
                </thead>
                <tbody>
                  {balances.map((b) => (
                    <tr key={b.employee.id} className="border-b border-hairline last:border-0">
                      <td className="px-4 py-2">
                        <span className={cn("font-medium text-ink", !b.employee.is_active && "opacity-55")}>
                          #{b.employee.employee_code} {b.employee.name}
                        </span>
                      </td>
                      <td className="px-4 py-2 text-right text-ink-soft">
                        {formatMoney(b.given, "PKR")}
                      </td>
                      <td className="px-4 py-2 text-right text-ink-soft">
                        {formatMoney(b.repaid, "PKR")}
                      </td>
                      <td className="px-4 py-2 text-right font-bold text-ink">
                        {formatMoney(b.balance, "PKR")}
                      </td>
                    </tr>
                  ))}
                  {balances.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="px-4 py-8 text-center text-[0.9rem] text-ink-soft">
                        No employees yet.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </Card>

          <SectionHeading
            title="Transactions"
            action={
              <select
                className="field max-w-[14rem]"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
              >
                <option value="all">All employees</option>
                {employees.map((e) => (
                  <option key={e.id} value={e.id}>
                    #{e.employee_code} {e.name}
                  </option>
                ))}
              </select>
            }
          />
          <Card className="overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-[0.95rem]">
                <thead>
                  <tr className="border-b border-hairline text-[0.8rem] font-medium text-ink-soft">
                    <th className="px-4 py-3 font-medium">Date</th>
                    <th className="px-4 py-3 font-medium">Employee</th>
                    <th className="px-4 py-3 font-medium">Type</th>
                    <th className="px-4 py-3 text-right font-medium">Amount</th>
                    <th className="px-4 py-3 font-medium">Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredTransactions.map((t) => (
                    <tr key={t.id} className="border-b border-hairline last:border-0">
                      <td className="px-4 py-2 text-ink-soft">{dateLabel(t.date)}</td>
                      <td className="px-4 py-2 font-medium text-ink">{employeeName(t.employee_id)}</td>
                      <td className="px-4 py-2">
                        <Pill tone={t.type === "given" ? "neutral" : "mint"}>
                          {t.type === "given" ? "Given" : "Deducted"}
                        </Pill>
                      </td>
                      <td className="px-4 py-2 text-right font-medium text-ink">
                        {formatMoney(Number(t.amount), "PKR")}
                      </td>
                      <td className="px-4 py-2 text-ink-soft">{t.notes || "—"}</td>
                    </tr>
                  ))}
                  {filteredTransactions.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-4 py-8 text-center text-[0.9rem] text-ink-soft">
                        No transactions yet.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}
      </div>
      <AdvancesPrintView
        scopeLabel={scopeLabel}
        balances={balances}
        transactions={filteredTransactions}
        employeeName={employeeName}
      />
    </>
  );
}

function AdvancesPrintView({
  scopeLabel,
  balances,
  transactions,
  employeeName,
}: {
  scopeLabel: string;
  balances: { employee: Employee; given: number; repaid: number; balance: number }[];
  transactions: AdvanceTransaction[];
  employeeName: (id: string) => string;
}) {
  if (balances.length === 0) return null;
  return (
    <div className="print-plain hidden print:block">
      <p className="pp-hdr">MANZA TEXTILE MILLS</p>
      <p className="pp-sub">Advances — {scopeLabel}</p>

      <p className="pp-section">Balances</p>
      <table>
        <thead>
          <tr>
            <th>Employee</th>
            <th className="v">Given</th>
            <th className="v">Deducted</th>
            <th className="v">Balance</th>
          </tr>
        </thead>
        <tbody>
          {balances.map((b) => (
            <tr key={b.employee.id}>
              <td>
                #{b.employee.employee_code} {b.employee.name}
              </td>
              <td className="v">{formatMoney(b.given, "PKR")}</td>
              <td className="v">{formatMoney(b.repaid, "PKR")}</td>
              <td className="v b">{formatMoney(b.balance, "PKR")}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <p className="pp-section">Transactions</p>
      <table>
        <thead>
          <tr>
            <th>Date</th>
            <th>Employee</th>
            <th>Type</th>
            <th className="v">Amount</th>
            <th>Notes</th>
          </tr>
        </thead>
        <tbody>
          {transactions.map((t) => (
            <tr key={t.id}>
              <td>{dateLabel(t.date)}</td>
              <td>{employeeName(t.employee_id)}</td>
              <td>{t.type === "given" ? "Given" : "Deducted"}</td>
              <td className="v">{formatMoney(Number(t.amount), "PKR")}</td>
              <td>{t.notes || "—"}</td>
            </tr>
          ))}
          {transactions.length === 0 ? (
            <tr>
              <td colSpan={5}>No transactions.</td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </div>
  );
}
