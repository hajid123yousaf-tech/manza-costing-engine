"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { sortCurrencyCodes, type CurrencyCode, type ExchangeRate } from "@/lib/types";
import { formatDateTime } from "@/lib/format";
import { Button, Card, ErrorNote, cn } from "@/components/ui";

const LABELS: Partial<Record<CurrencyCode, string>> = {
  PKR: "Pakistani Rupee",
  USD: "US Dollar",
  EUR: "Euro",
  GBP: "Pound Sterling",
};

const CODE_RE = /^[A-Z]{3}$/;

/**
 * Collapsible currency-management panel, embedded in the cost sheet editor
 * near the display-currency selector. Same add/edit/remove controls that
 * used to live on the standalone /rates page — same table, same rules
 * (PKR fixed at 1, can't remove a currency in use on a cost sheet) — just
 * relocated. Calls `onChanged` after any successful write so the editor can
 * refresh the currency list it uses for calculations and the dropdown.
 */
export function ExchangeRatesPanel({
  onChanged,
}: {
  onChanged?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
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

  async function load() {
    setLoading(true);
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
    setLoaded(true);
  }

  function toggleOpen() {
    setOpen((v) => {
      const next = !v;
      if (next && !loaded) void load();
      return next;
    });
  }

  async function save(code: CurrencyCode) {
    const value = Number(draft[code]);
    if (!Number.isFinite(value) || value <= 0) {
      setError(`Enter a rate greater than zero for ${code}.`);
      return;
    }
    setSavingCode(code);
    setError(null);
    const { error } = await supabase
      .from("exchange_rates")
      .update({ rate_to_pkr: value, updated_at: new Date().toISOString() })
      .eq("currency_code", code);
    setSavingCode(null);
    if (error) {
      setError(error.message);
      return;
    }
    await load();
    onChanged?.();
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
    await load();
    onChanged?.();
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
    onChanged?.();
  }

  return (
    <div className="md:col-span-2">
      <button
        type="button"
        onClick={toggleOpen}
        className="flex min-h-[40px] items-center gap-1.5 text-[0.85rem] font-medium text-ink-soft hover:text-ink md:min-h-0"
        aria-expanded={open}
      >
        {open ? (
          <ChevronDown size={16} strokeWidth={2} />
        ) : (
          <ChevronRight size={16} strokeWidth={2} />
        )}
        Exchange rates
      </button>

      {open ? (
        <div className="mt-3 rounded-xl border border-hairline bg-canvas p-4">
          {error ? <ErrorNote message={error} /> : null}
          {removeNotice ? <ErrorNote message={removeNotice} /> : null}

          <div className="mb-3 flex items-center justify-between">
            <p className="text-[0.82rem] text-ink-soft">
              How many rupees one unit of each currency is worth.
            </p>
            <Button
              variant="secondary"
              className="min-h-[40px] px-3 py-1.5 text-[0.8rem] md:min-h-0"
              onClick={() => setAddingOpen((v) => !v)}
            >
              {addingOpen ? "Cancel" : "+ Add currency"}
            </Button>
          </div>

          {addingOpen ? (
            <Card className="mb-4 p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
                <label className="block w-full sm:w-auto">
                  <span className="mb-1.5 block text-[0.78rem] font-medium text-ink">
                    Code
                  </span>
                  <input
                    className="field w-full uppercase sm:w-24"
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
                  <span className="mb-1.5 block text-[0.78rem] font-medium text-ink">
                    Rate to PKR
                  </span>
                  <input
                    type="number"
                    step="0.01"
                    className="field w-full text-right sm:w-32"
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
                  className="min-h-[40px] w-full px-3 py-1.5 text-[0.82rem] sm:w-auto md:min-h-0"
                  disabled={adding}
                  onClick={addCurrency}
                >
                  {adding ? "Adding…" : "Add currency"}
                </Button>
              </div>
            </Card>
          ) : null}

          {loading ? (
            <p className="py-4 text-center text-[0.85rem] text-ink-soft">
              Loading rates…
            </p>
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {rates.map((r) => {
                const fixed = r.currency_code === "PKR";
                const dirty =
                  !fixed && draft[r.currency_code] !== String(r.rate_to_pkr);
                const confirming = confirmRemoveCode === r.currency_code;
                return (
                  <Card key={r.id} className="p-4">
                    <div className="flex items-baseline justify-between">
                      <div>
                        <p className="text-[0.98rem] font-semibold text-ink">
                          {r.currency_code}
                        </p>
                        {LABELS[r.currency_code] ? (
                          <p className="text-[0.78rem] text-ink-soft">
                            {LABELS[r.currency_code]}
                          </p>
                        ) : null}
                      </div>
                      {fixed ? (
                        <span className="text-[0.75rem] text-ink-soft">
                          Base
                        </span>
                      ) : null}
                    </div>

                    <div className="mt-3 flex items-center gap-2">
                      <input
                        type="number"
                        step="0.01"
                        className="field max-w-[8rem] text-right"
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
                          className="min-h-[36px] px-2.5 py-1.5 text-[0.78rem] md:min-h-0"
                          disabled={!dirty || savingCode === r.currency_code}
                          onClick={() => save(r.currency_code)}
                        >
                          Save
                        </Button>
                      ) : null}
                    </div>

                    <p className="mt-2 text-[0.72rem] text-ink-soft">
                      Updated {formatDateTime(r.updated_at)}
                    </p>

                    {!fixed ? (
                      <div className="mt-2 border-t border-hairline pt-2">
                        {confirming ? (
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-[0.76rem] text-ink-soft">
                              Remove?
                            </span>
                            <Button
                              variant="danger"
                              className="min-h-[36px] px-2.5 py-1 text-[0.76rem] md:min-h-0"
                              disabled={removingCode === r.currency_code}
                              onClick={() => removeCurrency(r.currency_code)}
                            >
                              {removingCode === r.currency_code
                                ? "Removing…"
                                : "Yes, remove"}
                            </Button>
                            <Button
                              variant="ghost"
                              className="min-h-[36px] px-2.5 py-1 text-[0.76rem] md:min-h-0"
                              onClick={() => setConfirmRemoveCode(null)}
                            >
                              Cancel
                            </Button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            className={cn(
                              "min-h-[36px] text-[0.76rem] font-medium text-danger-ink hover:underline",
                            )}
                            onClick={() => {
                              setRemoveNotice(null);
                              setConfirmRemoveCode(r.currency_code);
                            }}
                          >
                            Remove currency
                          </button>
                        )}
                      </div>
                    ) : null}
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
