"use client";

import { useCallback, useEffect, useState } from "react";
import { Settings } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { fetchCompanyPolicy, formatTime12, fromTimeInputValue, toTimeInputValue } from "@/lib/attendanceSalary";
import { formatNumber } from "@/lib/format";
import {
  DEFAULT_COMPANY_POLICY,
  SUNDAY_MODES,
  UNDERTIME_MODES,
  type CompanyPolicy,
  type SundayMode,
  type UndertimeMode,
} from "@/lib/types";
import { Button, Card, ErrorNote, Field, Spinner, TimePicker, cn } from "@/components/ui";

const numOrZero = (v: string) => (v === "" ? 0 : Number(v));

export function CompanyPolicyCard() {
  const [policy, setPolicy] = useState<CompanyPolicy>(DEFAULT_COMPANY_POLICY);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<CompanyPolicy>(DEFAULT_COMPANY_POLICY);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { policy: p, error } = await fetchCompanyPolicy();
    setPolicy(p);
    setError(error);
    setLoading(false);
  }, []);

  useEffect(() => {
    void (async () => {
      await load();
    })();
  }, [load]);

  function startEdit() {
    setDraft(policy);
    setError(null);
    setEditing(true);
  }

  async function save() {
    setSaving(true);
    setError(null);
    const { error } = await supabase.from("company_policy").upsert({
      id: 1,
      shift_start: draft.shift_start,
      shift_end: draft.shift_end,
      standard_hours: Number(draft.standard_hours) || 0,
      overtime_threshold_hours: Number(draft.overtime_threshold_hours) || 0,
      overtime_multiplier: Number(draft.overtime_multiplier) || 0,
      undertime_tolerance_minutes: Number(draft.undertime_tolerance_minutes) || 0,
      undertime_mode: draft.undertime_mode,
      sunday_paid_leave: draft.sunday_paid_leave,
      sunday_mode: draft.sunday_mode,
      days_basis: Number(draft.days_basis) || 0,
      updated_at: new Date().toISOString(),
    });
    setSaving(false);
    if (error) {
      setError(error.message);
      return;
    }
    setEditing(false);
    await load();
  }

  const rows: { label: string; value: string }[] = [
    { label: "Shift Start", value: formatTime12(policy.shift_start) },
    { label: "Shift End", value: formatTime12(policy.shift_end) },
    { label: "Standard Hours / Day", value: `${formatNumber(policy.standard_hours)} hrs` },
    {
      label: "Overtime Threshold",
      value: `After ${formatNumber(policy.overtime_threshold_hours)} hrs/day`,
    },
    { label: "Overtime Rate", value: `${formatNumber(policy.overtime_multiplier)}x hourly rate` },
    { label: "Undertime Tolerance", value: `${policy.undertime_tolerance_minutes} minutes` },
    { label: "Grace Period", value: "Per employee (set in Employee Master)" },
    {
      label: "Sunday",
      value: policy.sunday_paid_leave
        ? "Paid Leave, OT for designated employees only"
        : "Not a paid leave day",
    },
  ];

  return (
    <Card className="p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-[1.125rem] font-bold italic text-ink">Company Duty Time Rules</h2>
        {!editing ? (
          <Button onClick={startEdit} className="gap-1.5">
            <Settings size={16} />
            Edit Policy
          </Button>
        ) : null}
      </div>

      {error ? <ErrorNote message={error} /> : null}

      {loading ? (
        <Spinner label="Loading policy…" />
      ) : editing ? (
        <div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Field label="Shift start">
              <TimePicker
                value={toTimeInputValue(draft.shift_start)}
                onChange={(v) => setDraft((d) => ({ ...d, shift_start: fromTimeInputValue(v) }))}
              />
            </Field>
            <Field label="Shift end">
              <TimePicker
                value={toTimeInputValue(draft.shift_end)}
                onChange={(v) => setDraft((d) => ({ ...d, shift_end: fromTimeInputValue(v) }))}
              />
            </Field>
            <Field label="Standard hours / day">
              <input
                type="number"
                step="0.01"
                min="0"
                className="field"
                value={draft.standard_hours}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, standard_hours: numOrZero(e.target.value) }))
                }
              />
            </Field>
            <Field label="Overtime threshold (hours/day)">
              <input
                type="number"
                step="0.01"
                min="0"
                className="field"
                value={draft.overtime_threshold_hours}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, overtime_threshold_hours: numOrZero(e.target.value) }))
                }
              />
            </Field>
            <Field label="Overtime multiplier">
              <input
                type="number"
                step="0.01"
                min="0"
                className="field"
                value={draft.overtime_multiplier}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, overtime_multiplier: numOrZero(e.target.value) }))
                }
              />
            </Field>
            <Field label="Undertime tolerance (minutes)">
              <input
                type="number"
                step="1"
                min="0"
                className="field"
                value={draft.undertime_tolerance_minutes}
                onChange={(e) =>
                  setDraft((d) => ({
                    ...d,
                    undertime_tolerance_minutes: numOrZero(e.target.value),
                  }))
                }
              />
            </Field>
            <Field label="Undertime mode">
              <select
                className="field"
                value={draft.undertime_mode}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, undertime_mode: e.target.value as UndertimeMode }))
                }
              >
                {UNDERTIME_MODES.map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Days basis">
              <input
                type="number"
                step="1"
                min="0"
                className="field"
                value={draft.days_basis}
                onChange={(e) => setDraft((d) => ({ ...d, days_basis: numOrZero(e.target.value) }))}
              />
            </Field>
            <Field label="Sunday paid leave">
              <div className="inline-flex gap-1 rounded-full border border-hairline bg-canvas p-1">
                {([{ v: true, l: "Yes" }, { v: false, l: "No" }] as const).map((opt) => (
                  <button
                    key={String(opt.v)}
                    type="button"
                    onClick={() => setDraft((d) => ({ ...d, sunday_paid_leave: opt.v }))}
                    className={cn(
                      "rounded-full px-3.5 py-1.5 text-[0.85rem] font-medium transition-colors",
                      draft.sunday_paid_leave === opt.v
                        ? "bg-ink text-white"
                        : "text-ink-soft hover:text-ink",
                    )}
                  >
                    {opt.l}
                  </button>
                ))}
              </div>
            </Field>
            <Field label="Sunday mode">
              <select
                className="field"
                value={draft.sunday_mode}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, sunday_mode: e.target.value as SundayMode }))
                }
              >
                {SUNDAY_MODES.map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <div className="mt-5 flex justify-end gap-2">
            <Button disabled={saving} onClick={() => setEditing(false)}>
              Cancel
            </Button>
            <Button variant="primary" disabled={saving} onClick={save}>
              {saving ? "Saving…" : "Save"}
            </Button>
          </div>
        </div>
      ) : (
        <div>
          {rows.map((r) => (
            <div
              key={r.label}
              className="flex items-center justify-between border-b border-hairline py-3 last:border-0"
            >
              <span className="text-[0.9rem] text-ink-soft">{r.label}</span>
              <span className="text-[0.95rem] font-bold text-ink">{r.value}</span>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
