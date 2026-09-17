"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { fromTimeInputValue, toTimeInputValue } from "@/lib/attendanceSalary";
import {
  DEFAULT_SHIFT_TIMES,
  PAY_TYPES,
  STAFF_CATEGORIES,
  type Employee,
  type PayType,
  type StaffCategory,
} from "@/lib/types";
import {
  Button,
  Card,
  ErrorNote,
  Field,
  PageHeader,
  Pill,
  Spinner,
  TimePicker,
  cn,
} from "@/components/ui";

const numOrZero = (v: string) => (v === "" ? 0 : Number(v));
const editValue = (n: number | null | undefined) =>
  n === null || n === undefined || n === 0 ? "" : n;

interface NewEmployee {
  name: string;
  designation: string;
  staff_category: StaffCategory;
  pay_type: PayType;
  monthly_salary: number;
  daily_wage: number;
  shift_start: string;
  shift_end: string;
  time_tracking_enabled: boolean;
  grace_minutes: number;
}

function blankNewEmployee(): NewEmployee {
  return {
    name: "",
    designation: "",
    staff_category: "office",
    pay_type: "monthly",
    monthly_salary: 0,
    daily_wage: 0,
    shift_start: DEFAULT_SHIFT_TIMES.office.start,
    shift_end: DEFAULT_SHIFT_TIMES.office.end,
    time_tracking_enabled: true,
    grace_minutes: 0,
  };
}

export default function EmployeesPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [edits, setEdits] = useState<Record<string, Partial<Employee>>>({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const [showInactive, setShowInactive] = useState(true);

  const [showAdd, setShowAdd] = useState(false);
  const [newEmp, setNewEmp] = useState<NewEmployee>(blankNewEmployee());
  const [adding, setAdding] = useState(false);

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from("employees")
      .select("*")
      .order("employee_code", { ascending: true });
    setError(error ? error.message : null);
    setEmployees((data ?? []) as Employee[]);
    setEdits({});
    setLoading(false);
  }, []);

  useEffect(() => {
    void (async () => {
      await load();
    })();
  }, [load]);

  const visible = employees.filter((e) => showInactive || e.is_active);

  function patch(id: string, key: keyof Employee, value: unknown) {
    setEdits((prev) => ({ ...prev, [id]: { ...prev[id], [key]: value } }));
  }
  function valueOf<K extends keyof Employee>(e: Employee, key: K): Employee[K] {
    const edit = edits[e.id];
    return edit && key in edit ? (edit[key] as Employee[K]) : e[key];
  }
  const isDirty = (id: string) =>
    !!edits[id] && Object.keys(edits[id]).length > 0;

  function setCategory(id: string, category: StaffCategory) {
    const defaults = DEFAULT_SHIFT_TIMES[category];
    setEdits((prev) => ({
      ...prev,
      [id]: {
        ...prev[id],
        staff_category: category,
        shift_start: defaults.start,
        shift_end: defaults.end,
      },
    }));
  }

  async function saveRow(e: Employee) {
    if (!isDirty(e.id)) return;
    setSavingId(e.id);
    setError(null);
    const payType = valueOf(e, "pay_type");
    const shiftStart = toTimeInputValue(valueOf(e, "shift_start"));
    const shiftEnd = toTimeInputValue(valueOf(e, "shift_end"));
    const { error } = await supabase
      .from("employees")
      .update({
        name: valueOf(e, "name"),
        designation: valueOf(e, "designation") || null,
        staff_category: valueOf(e, "staff_category"),
        pay_type: payType,
        monthly_salary:
          payType === "monthly" ? Number(valueOf(e, "monthly_salary")) || 0 : null,
        daily_wage:
          payType === "daily" ? Number(valueOf(e, "daily_wage")) || 0 : null,
        shift_start: fromTimeInputValue(shiftStart),
        shift_end: fromTimeInputValue(shiftEnd),
        time_tracking_enabled: valueOf(e, "time_tracking_enabled"),
        grace_minutes: Number(valueOf(e, "grace_minutes")) || 0,
      })
      .eq("id", e.id);
    setSavingId(null);
    if (error) setError(error.message);
    else await load();
  }

  async function toggleActive(e: Employee) {
    setSavingId(e.id);
    const { error } = await supabase
      .from("employees")
      .update({ is_active: !e.is_active })
      .eq("id", e.id);
    setSavingId(null);
    if (error) setError(error.message);
    else await load();
  }

  async function addEmployee() {
    if (!newEmp.name.trim()) {
      setError("Give the employee a name first.");
      return;
    }
    setAdding(true);
    setError(null);
    const { error } = await supabase.from("employees").insert({
      name: newEmp.name.trim(),
      designation: newEmp.designation.trim() || null,
      staff_category: newEmp.staff_category,
      pay_type: newEmp.pay_type,
      monthly_salary: newEmp.pay_type === "monthly" ? Number(newEmp.monthly_salary) || 0 : null,
      daily_wage: newEmp.pay_type === "daily" ? Number(newEmp.daily_wage) || 0 : null,
      shift_start: fromTimeInputValue(newEmp.shift_start),
      shift_end: fromTimeInputValue(newEmp.shift_end),
      time_tracking_enabled: newEmp.time_tracking_enabled,
      grace_minutes: newEmp.time_tracking_enabled ? Number(newEmp.grace_minutes) || 0 : 0,
      is_active: true,
    });
    setAdding(false);
    if (error) {
      setError(error.message);
      return;
    }
    setNewEmp(blankNewEmployee());
    setShowAdd(false);
    await load();
  }

  return (
    <div>
      <PageHeader
        title="Employees"
        description="Office staff and labour, their pay basis, and default shift hours."
      >
        <label className="flex items-center gap-2 text-[0.9rem] text-ink-soft">
          <input
            type="checkbox"
            checked={showInactive}
            onChange={(e) => setShowInactive(e.target.checked)}
          />
          Show inactive
        </label>
        <Button variant="primary" onClick={() => setShowAdd((s) => !s)}>
          {showAdd ? "Close" : "Add employee"}
        </Button>
      </PageHeader>

      {error ? <ErrorNote message={error} /> : null}

      {showAdd ? (
        <Card className="mb-6 p-6">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Field label="Name">
              <input
                className="field"
                value={newEmp.name}
                onChange={(e) => setNewEmp((r) => ({ ...r, name: e.target.value }))}
              />
            </Field>
            <Field label="Designation">
              <input
                className="field"
                value={newEmp.designation}
                onChange={(e) =>
                  setNewEmp((r) => ({ ...r, designation: e.target.value }))
                }
              />
            </Field>
            <Field label="Staff category">
              <select
                className="field"
                value={newEmp.staff_category}
                onChange={(e) => {
                  const category = e.target.value as StaffCategory;
                  const defaults = DEFAULT_SHIFT_TIMES[category];
                  setNewEmp((r) => ({
                    ...r,
                    staff_category: category,
                    shift_start: defaults.start,
                    shift_end: defaults.end,
                  }));
                }}
              >
                {STAFF_CATEGORIES.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Pay type">
              <div className="inline-flex gap-1 rounded-full border border-hairline bg-canvas p-1">
                {PAY_TYPES.map((p) => (
                  <button
                    key={p.value}
                    type="button"
                    onClick={() => setNewEmp((r) => ({ ...r, pay_type: p.value }))}
                    className={cn(
                      "rounded-full px-3.5 py-1.5 text-[0.85rem] font-medium transition-colors",
                      newEmp.pay_type === p.value
                        ? "bg-ink text-white"
                        : "text-ink-soft hover:text-ink",
                    )}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </Field>
            {newEmp.pay_type === "monthly" ? (
              <Field label="Monthly salary">
                <input
                  type="number"
                  step="0.01"
                  className="field"
                  placeholder="0"
                  value={editValue(newEmp.monthly_salary)}
                  onChange={(e) =>
                    setNewEmp((r) => ({
                      ...r,
                      monthly_salary: numOrZero(e.target.value),
                    }))
                  }
                />
              </Field>
            ) : (
              <Field label="Daily wage">
                <input
                  type="number"
                  step="0.01"
                  className="field"
                  placeholder="0"
                  value={editValue(newEmp.daily_wage)}
                  onChange={(e) =>
                    setNewEmp((r) => ({
                      ...r,
                      daily_wage: numOrZero(e.target.value),
                    }))
                  }
                />
              </Field>
            )}
            <Field label="Shift start">
              <TimePicker
                value={newEmp.shift_start}
                onChange={(v) => setNewEmp((r) => ({ ...r, shift_start: v }))}
              />
            </Field>
            <Field label="Shift end">
              <TimePicker
                value={newEmp.shift_end}
                onChange={(v) => setNewEmp((r) => ({ ...r, shift_end: v }))}
              />
            </Field>
            <div className="flex items-center pt-6">
              <label className="flex items-center gap-2 text-[0.9rem] text-ink">
                <input
                  type="checkbox"
                  checked={newEmp.time_tracking_enabled}
                  onChange={(e) =>
                    setNewEmp((r) => ({
                      ...r,
                      time_tracking_enabled: e.target.checked,
                    }))
                  }
                />
                Track overtime &amp; short-time deduction
              </label>
            </div>
            {newEmp.time_tracking_enabled ? (
              <Field label="Grace period (minutes)" hint="Late arrivals within this many minutes aren't deducted.">
                <input
                  type="number"
                  step="1"
                  min="0"
                  className="field"
                  placeholder="0"
                  value={editValue(newEmp.grace_minutes)}
                  onChange={(e) =>
                    setNewEmp((r) => ({
                      ...r,
                      grace_minutes: numOrZero(e.target.value),
                    }))
                  }
                />
              </Field>
            ) : null}
          </div>
          <div className="mt-5 flex justify-end">
            <Button variant="primary" disabled={adding} onClick={addEmployee}>
              {adding ? "Adding…" : "Add employee"}
            </Button>
          </div>
        </Card>
      ) : null}

      {loading ? (
        <Spinner label="Loading employees…" />
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-[0.95rem]">
              <thead>
                <tr className="border-b border-hairline text-[0.8rem] font-medium text-ink-soft">
                  <th className="px-4 py-3 font-medium">Code</th>
                  <th className="px-4 py-3 font-medium">Name</th>
                  <th className="px-4 py-3 font-medium">Designation</th>
                  <th className="px-4 py-3 font-medium">Category</th>
                  <th className="px-4 py-3 font-medium">Pay type</th>
                  <th className="px-4 py-3 text-right font-medium">Salary / Wage</th>
                  <th className="px-4 py-3 font-medium">Shift</th>
                  <th className="px-4 py-3 font-medium">Time tracking</th>
                  <th className="px-4 py-3 text-right font-medium">Grace (min)</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((e) => {
                  const payType = valueOf(e, "pay_type");
                  return (
                    <tr
                      key={e.id}
                      className={cn(
                        "border-b border-hairline last:border-0",
                        !e.is_active && "opacity-55",
                      )}
                    >
                      <td className="px-4 py-2 text-ink-soft">
                        #{e.employee_code}
                      </td>
                      <td className="px-4 py-2">
                        <input
                          className="field min-w-[9rem]"
                          value={valueOf(e, "name")}
                          onChange={(ev) => patch(e.id, "name", ev.target.value)}
                        />
                      </td>
                      <td className="px-4 py-2">
                        <input
                          className="field min-w-[9rem]"
                          value={valueOf(e, "designation") ?? ""}
                          onChange={(ev) =>
                            patch(e.id, "designation", ev.target.value)
                          }
                        />
                      </td>
                      <td className="px-4 py-2">
                        <select
                          className="field min-w-[7rem]"
                          value={valueOf(e, "staff_category")}
                          onChange={(ev) =>
                            setCategory(e.id, ev.target.value as StaffCategory)
                          }
                        >
                          {STAFF_CATEGORIES.map((c) => (
                            <option key={c.value} value={c.value}>
                              {c.label}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="px-4 py-2">
                        <div className="inline-flex gap-1 rounded-full border border-hairline bg-canvas p-1">
                          {PAY_TYPES.map((p) => (
                            <button
                              key={p.value}
                              type="button"
                              onClick={() => patch(e.id, "pay_type", p.value)}
                              className={cn(
                                "rounded-full px-2.5 py-1 text-[0.8rem] font-medium transition-colors",
                                payType === p.value
                                  ? "bg-ink text-white"
                                  : "text-ink-soft hover:text-ink",
                              )}
                            >
                              {p.label}
                            </button>
                          ))}
                        </div>
                      </td>
                      <td className="px-4 py-2">
                        {payType === "monthly" ? (
                          <input
                            type="number"
                            step="0.01"
                            className="field min-w-[7rem] text-right"
                            placeholder="0"
                            value={editValue(valueOf(e, "monthly_salary"))}
                            onChange={(ev) =>
                              patch(e.id, "monthly_salary", numOrZero(ev.target.value))
                            }
                          />
                        ) : (
                          <input
                            type="number"
                            step="0.01"
                            className="field min-w-[7rem] text-right"
                            placeholder="0"
                            value={editValue(valueOf(e, "daily_wage"))}
                            onChange={(ev) =>
                              patch(e.id, "daily_wage", numOrZero(ev.target.value))
                            }
                          />
                        )}
                      </td>
                      <td className="px-4 py-2">
                        <div className="flex items-center gap-1">
                          <TimePicker
                            className="min-w-[9rem]"
                            value={toTimeInputValue(valueOf(e, "shift_start"))}
                            onChange={(v) => patch(e.id, "shift_start", v)}
                          />
                          <span className="text-ink-soft">–</span>
                          <TimePicker
                            className="min-w-[9rem]"
                            value={toTimeInputValue(valueOf(e, "shift_end"))}
                            onChange={(v) => patch(e.id, "shift_end", v)}
                          />
                        </div>
                      </td>
                      <td className="px-4 py-2 text-center">
                        <input
                          type="checkbox"
                          checked={valueOf(e, "time_tracking_enabled")}
                          onChange={(ev) =>
                            patch(e.id, "time_tracking_enabled", ev.target.checked)
                          }
                        />
                      </td>
                      <td className="px-4 py-2">
                        {valueOf(e, "time_tracking_enabled") ? (
                          <input
                            type="number"
                            step="1"
                            min="0"
                            className="field min-w-[4.5rem] text-right"
                            placeholder="0"
                            value={editValue(valueOf(e, "grace_minutes"))}
                            onChange={(ev) =>
                              patch(e.id, "grace_minutes", numOrZero(ev.target.value))
                            }
                          />
                        ) : (
                          <span className="block text-right text-ink-soft">—</span>
                        )}
                      </td>
                      <td className="px-4 py-2">
                        {e.is_active ? (
                          <Pill tone="mint">Active</Pill>
                        ) : (
                          <Pill>Inactive</Pill>
                        )}
                      </td>
                      <td className="px-4 py-2">
                        <div className="flex items-center justify-end gap-2">
                          {isDirty(e.id) ? (
                            <Button
                              variant="primary"
                              className="min-h-[40px] px-3 py-1.5 text-[0.85rem] md:min-h-0"
                              disabled={savingId === e.id}
                              onClick={() => saveRow(e)}
                            >
                              Save
                            </Button>
                          ) : null}
                          <Button
                            className="min-h-[40px] px-3 py-1.5 text-[0.85rem] md:min-h-0"
                            disabled={savingId === e.id}
                            onClick={() => toggleActive(e)}
                          >
                            {e.is_active ? "Deactivate" : "Activate"}
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {visible.length === 0 ? (
                  <tr>
                    <td colSpan={11} className="px-4 py-8 text-center text-[0.9rem] text-ink-soft">
                      No employees yet. Add one above.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
