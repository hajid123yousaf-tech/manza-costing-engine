"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { CurrencyCode, ExchangeRate } from "@/lib/types";
import { formatDateTime } from "@/lib/format";
import {
  Button,
  Card,
  ErrorNote,
  PageHeader,
  Spinner,
} from "@/components/ui";

const EDITABLE: CurrencyCode[] = ["USD", "EUR", "GBP"];
const LABELS: Record<CurrencyCode, string> = {
  PKR: "Pakistani Rupee",
  USD: "US Dollar",
  EUR: "Euro",
  GBP: "Pound Sterling",
};

export default function RatesPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [rates, setRates] = useState<ExchangeRate[]>([]);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [savingCode, setSavingCode] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from("exchange_rates")
      .select("*");
    setError(error ? error.message : null);
    const list = (data ?? []) as ExchangeRate[];
    list.sort(
      (a, b) =>
        ["PKR", "USD", "EUR", "GBP"].indexOf(a.currency_code) -
        ["PKR", "USD", "EUR", "GBP"].indexOf(b.currency_code),
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

  return (
    <div>
      <PageHeader
        title="Exchange rates"
        description="How many rupees one unit of each currency is worth. Cost sheets convert their PKR totals with these rates."
      />

      {error ? <ErrorNote message={error} /> : null}
      {saved ? (
        <div className="mb-4 rounded-xl border border-[#cfe0cf] bg-[#f1f7f1] px-4 py-3 text-[0.9rem] text-[#3a6b3a]">
          Rate updated.
        </div>
      ) : null}

      {loading ? (
        <Spinner label="Loading rates…" />
      ) : (
        <div className="grid max-w-3xl grid-cols-1 gap-4 sm:grid-cols-2">
          {rates.map((r) => {
            const fixed = r.currency_code === "PKR";
            const dirty =
              !fixed && draft[r.currency_code] !== String(r.rate_to_pkr);
            return (
              <Card key={r.id} className="p-5">
                <div className="flex items-baseline justify-between">
                  <div>
                    <p className="text-[1.1rem] font-semibold text-ink">
                      {r.currency_code}
                    </p>
                    <p className="text-[0.85rem] text-ink-soft">
                      {LABELS[r.currency_code]}
                    </p>
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
                    {!fixed && EDITABLE.includes(r.currency_code) ? (
                      <Button
                        variant={dirty ? "primary" : "secondary"}
                        className="px-3 py-2 text-[0.85rem]"
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
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
