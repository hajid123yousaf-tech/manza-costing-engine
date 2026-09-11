"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { CurrencyCode, ExchangeRate } from "@/lib/types";
import { sortCurrencyCodes } from "@/lib/types";
import { formatDateTime } from "@/lib/format";
import {
  Button,
  Card,
  ErrorNote,
  PageHeader,
  Spinner,
} from "@/components/ui";

const LABELS: Partial<Record<CurrencyCode, string>> = {
  PKR: "Pakistani Rupee",
  USD: "US Dollar",
  EUR: "Euro",
  GBP: "Pound Sterling",
};

const CODE_RE = /^[A-Z]{3}$/;

export default function RatesPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [rates, setRates] = useState<ExchangeRate[]>([]);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [savingCode, setSavingCode] = useState<string | null>(null);

  const [addingOpen, setAddingOpen] = useState(false);
  const [newCode, setNewCode] = useState("");
  const [newRate, setNewRate] = useState("");
  const [adding, setAdding] = useState(false);

  const [confirmRemoveCode, setConfirmRemoveCode] = useState<string | null>(
    null,
  );
  const [removingCode, setRemovingCode] = useState<string | null>(null);
  const [removeNotice, setRemoveNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data, error } = await supabase.from("exchange_rates").select("*");
    setError(error ? error.message : null);
    const list = (data ?? []) as ExchangeRate[];
    const order = sortCurrencyCodes(list.map((r) => r.currency_code));
    list.sort(
      (a, b) =>
        order.indexOf(a.currency_code) - order.indexOf(b.currency_code),
    );
    setRates(list);
    setDraft(
      Object.fromEntries(
        list.map((r) => [r.currency_code, String(r.rate_to_pkr)]),
      ),
    );
    setLoading(false);
  }, []);

  useEffect(() => {
    void (async () => {
      await load();
    })();
  }, [load]);

  async function save(code: CurrencyCode) {
    const value = Number(draft[code]);
    if (!Number.isFinite(value) || value <= 0) {
      setError(`Enter a rate greater than zero for ${code}.`);
      return;
    }
    setSavingCode(code);
    setError(null);
    setSaved(false);
    const { error } = await supabase
      .from("exchange_rates")
      .update({ rate_to_pkr: value, updated_at: new Date().toISOString() })
      .eq("currency_code", code);
    setSavingCode(null);
    if (error) {
      setError(error.message);
      return;
    }
    setSaved(true);
    await load();
  }

  async function addCurrency() {
    const code = newCode.trim().toUpperCase();
    const value = Number(newRate);

    if (!CODE_RE.test(code)) {
      setError("Currency code must be exactly 3 uppercase letters, e.g. AED.");
      return;
    }
    if (rates.some((r) => r.currency_code === code)) {
      setError(`${code} is already in the rates list.`);
      return;
    }
    if (!Number.isFinite(value) || value <= 0) {
      setError(`Enter a rate greater than zero for ${code}.`);
      return;
    }

    setAdding(true);
    setError(null);
    setSaved(false);
    const { error } = await supabase.from("exchange_rates").insert({
      currency_code: code,
      rate_to_pkr: value,
      updated_at: new Date().toISOString(),
    });
    setAdding(false);
    if (error) {
      setError(error.message);
      return;
    }
    setNewCode("");
    setNewRate("");
    setAddingOpen(false);
    setSaved(true);
    await load();
  }

  async function removeCurrency(code: CurrencyCode) {
    setRemovingCode(code);
    setError(null);
    setRemoveNotice(null);

    const { count, error: countError } = await supabase
      .from("cost_sheets")
      .select("id", { count: "exact", head: true })
      .eq("display_currency", code);

    if (countError) {
      setRemovingCode(null);
      setError(countError.message);
      return;
    }
    if (count && count > 0) {
      setRemovingCode(null);
      setConfirmRemoveCode(null);
      setRemoveNotice(
        `Can't remove ${code} — ${count} cost sheet${count === 1 ? "" : "s"} still ${count === 1 ? "uses" : "use"} it as ${count === 1 ? "its" : "their"} display currency. Change ${count === 1 ? "that sheet" : "those sheets"} first.`,
      );
      return;
    }

    const { error: deleteError } = await supabase
      .from("exchange_rates")
      .delete()
      .eq("currency_code", code);
    setRemovingCode(null);
    setConfirmRemoveCode(null);
    if (deleteError) {
      setError(deleteError.message);
      return;
    }
    await load();
  }

  return (
    <div>
      <PageHeader
        title="Exchange rates"
        description="How many rupees one unit of each currency is worth. Cost sheets convert their PKR totals with these rates."
      >
        <Button
          variant="secondary"
          className="min-h-[44px] px-3 py-2 text-[0.85rem] md:min-h-0"
          onClick={() => setAddingOpen((v) => !v)}
        >
          {addingOpen ? "Cancel" : "+ Add currency"}
        </Button>
      </PageHeader>

      {error ? <ErrorNote message={error} /> : null}
      {removeNotice ? <ErrorNote message={removeNotice} /> : null}
      {saved ? (
        <div className="mb-4 rounded-xl border border-[#cfe0cf] bg-[#f1f7f1] px-4 py-3 text-[0.9rem] text-[#3a6b3a]">
          Saved.
        </div>
      ) : null}

      {addingOpen ? (
        <Card className="mb-5 max-w-3xl p-5">
          <p className="mb-3 text-[0.95rem] font-semibold text-ink">
            Add a currency
          </p>
          <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
            <label className="block w-full sm:w-auto">
              <span className="mb-1.5 block text-[0.8rem] font-medium text-ink">
                Code
              </span>
              <input
                className="field w-full uppercase sm:w-28"
                value={newCode}
                maxLength={3}
                placeholder="AED"
                onChange={(e) => setNewCode(e.target.value.toUpperCase())}
                onKeyDown={(e) => {
                  if (e.key === "Enter") addCurrency();
                }}
              />
            </label>
            <label className="block w-full sm:w-auto">
              <span className="mb-1.5 block text-[0.8rem] font-medium text-ink">
                Rate to PKR
              </span>
              <input
                type="number"
                step="0.01"
                className="field w-full text-right sm:w-40"
                placeholder="0"
                value={newRate}
                onChange={(e) => setNewRate(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") addCurrency();
                }}
              />
            </label>
            <Button
              variant="primary"
              className="min-h-[44px] w-full px-3 py-2 text-[0.85rem] sm:w-auto md:min-h-0"
              disabled={adding}
              onClick={addCurrency}
            >
              {adding ? "Adding…" : "Add currency"}
            </Button>
          </div>
        </Card>
      ) : null}

      {loading ? (
        <Spinner label="Loading rates…" />
      ) : (
        <div className="grid max-w-3xl grid-cols-1 gap-4 sm:grid-cols-2">
          {rates.map((r) => {
            const fixed = r.currency_code === "PKR";
            const dirty =
              !fixed && draft[r.currency_code] !== String(r.rate_to_pkr);
            const confirming = confirmRemoveCode === r.currency_code;
            return (
              <Card key={r.id} className="p-5">
                <div className="flex items-baseline justify-between">
                  <div>
                    <p className="text-[1.1rem] font-semibold text-ink">
                      {r.currency_code}
                    </p>
                    {LABELS[r.currency_code] ? (
                      <p className="text-[0.85rem] text-ink-soft">
                        {LABELS[r.currency_code]}
                      </p>
                    ) : null}
                  </div>
                  {fixed ? (
                    <span className="text-[0.8rem] text-ink-soft">Base</span>
                  ) : null}
                </div>

                <div className="mt-4">
                  <span className="mb-1.5 block text-[0.8rem] font-medium text-ink">
                    Rate to PKR
                  </span>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      step="0.01"
                      className="field max-w-[10rem] text-right"
                      disabled={fixed}
                      value={fixed ? "1" : draft[r.currency_code] ?? ""}
                      onChange={(e) =>
                        setDraft((d) => ({
                          ...d,
                          [r.currency_code]: e.target.value,
                        }))
                      }
                    />
                    {!fixed ? (
                      <Button
                        variant={dirty ? "primary" : "secondary"}
                        className="min-h-[40px] px-3 py-2 text-[0.85rem] md:min-h-0"
                        disabled={!dirty || savingCode === r.currency_code}
                        onClick={() => save(r.currency_code)}
                      >
                        Save
                      </Button>
                    ) : null}
                  </div>
                </div>

                <p className="mt-3 text-[0.78rem] text-ink-soft">
                  Last updated {formatDateTime(r.updated_at)}
                </p>

                {!fixed ? (
                  <div className="mt-3 border-t border-hairline pt-3">
                    {confirming ? (
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-[0.82rem] text-ink-soft">
                          Remove {r.currency_code}?
                        </span>
                        <Button
                          variant="danger"
                          className="min-h-[40px] px-3 py-1.5 text-[0.82rem] md:min-h-0"
                          disabled={removingCode === r.currency_code}
                          onClick={() => removeCurrency(r.currency_code)}
                        >
                          {removingCode === r.currency_code
                            ? "Removing…"
                            : "Yes, remove"}
                        </Button>
                        <Button
                          variant="ghost"
                          className="min-h-[40px] px-3 py-1.5 text-[0.82rem] md:min-h-0"
                          onClick={() => setConfirmRemoveCode(null)}
                        >
                          Cancel
                        </Button>
                      </div>
                    ) : (
                      <Button
                        variant="danger"
                        className="min-h-[40px] px-3 py-1.5 text-[0.82rem] md:min-h-0"
                        onClick={() => {
                          setRemoveNotice(null);
                          setConfirmRemoveCode(r.currency_code);
                        }}
                      >
                        Remove currency
                      </Button>
                    )}
                  </div>
                ) : null}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
