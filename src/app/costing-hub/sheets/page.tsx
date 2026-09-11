"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { loadSheetTotals, type SheetTotal } from "@/lib/sheetTotals";
import { duplicateSheet } from "@/lib/duplicateSheet";
import { formatMoney, formatDate, serial } from "@/lib/format";
import type { CostSheet, SheetStatus } from "@/lib/types";
import {
  Button,
  ButtonLink,
  Card,
  EmptyState,
  ErrorNote,
  PageHeader,
  SerialBadge,
  Spinner,
  StatusBadge,
  cn,
} from "@/components/ui";

type StatusFilter = "all" | SheetStatus;

const FILTERS: { value: StatusFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "draft", label: "Draft" },
  { value: "archived", label: "Archived" },
];

export default function SheetsListPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sheets, setSheets] = useState<CostSheet[]>([]);
  const [totals, setTotals] = useState<Record<string, SheetTotal>>({});
  const [status, setStatus] = useState<StatusFilter>("all");
  const [query, setQuery] = useState("");
  const [dupId, setDupId] = useState<string | null>(null);

  async function handleDuplicate(id: string) {
    setDupId(id);
    setError(null);
    try {
      const newId = await duplicateSheet(id);
      router.push(`/costing-hub/sheets/${newId}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not duplicate the sheet.");
      setDupId(null);
    }
  }

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const { data, error } = await supabase
        .from("cost_sheets")
        .select("*")
        .order("serial_number", { ascending: false });

      if (cancelled) return;
      if (error) {
        setError(error.message);
        setLoading(false);
        return;
      }
      const list = (data ?? []) as CostSheet[];
      setSheets(list);
      setTotals(await loadSheetTotals(list));
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return sheets.filter((s) => {
      if (status !== "all" && s.status !== status) return false;
      if (!q) return true;
      return (
        s.title.toLowerCase().includes(q) ||
        (s.customer_name ?? "").toLowerCase().includes(q)
      );
    });
  }, [sheets, status, query]);

  return (
    <div>
      <PageHeader
        title="Cost sheets"
        description="Every costing, newest first. Search by title or customer, or filter by status."
      >
        <ButtonLink href="/costing-hub/sheets/new" variant="primary">
          New cost sheet
        </ButtonLink>
      </PageHeader>

      {error ? <ErrorNote message={error} /> : null}

      <div className="mb-5 flex flex-wrap items-center gap-3">
        <div className="inline-flex gap-1 rounded-full border border-hairline bg-surface p-1">
          {FILTERS.map((f) => (
            <button
              key={f.value}
              onClick={() => setStatus(f.value)}
              className={cn(
                "rounded-full px-3.5 py-1.5 text-[0.9rem] font-medium transition-colors",
                status === f.value
                  ? "bg-ink text-white"
                  : "text-ink-soft hover:text-ink",
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
        <input
          className="field max-w-xs"
          placeholder="Search title or customer…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      {loading ? (
        <Spinner label="Loading cost sheets…" />
      ) : filtered.length === 0 ? (
        <EmptyState
          title={sheets.length === 0 ? "No cost sheets yet" : "Nothing matches"}
          description={
            sheets.length === 0
              ? "Create your first cost sheet to start pricing an order."
              : "Try a different search or status filter."
          }
          action={
            sheets.length === 0 ? (
              <ButtonLink href="/costing-hub/sheets/new" variant="primary">
                New cost sheet
              </ButtonLink>
            ) : undefined
          }
        />
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-[0.95rem]">
              <thead>
                <tr className="border-b border-hairline text-[0.8rem] font-medium text-ink-soft">
                  <th className="px-5 py-3 font-medium">Serial</th>
                  <th className="px-5 py-3 font-medium">Title</th>
                  <th className="px-5 py-3 font-medium">Customer</th>
                  <th className="px-5 py-3 font-medium">Status</th>
                  <th className="px-5 py-3 text-right font-medium">Total cost</th>
                  <th className="px-5 py-3 text-right font-medium">Currency</th>
                  <th className="px-5 py-3 text-right font-medium">Updated</th>
                  <th className="px-5 py-3 text-right font-medium" />
                </tr>
              </thead>
              <tbody>
                {filtered.map((s) => {
                  const t = totals[s.id];
                  return (
                    <tr
                      key={s.id}
                      onClick={() => router.push(`/costing-hub/sheets/${s.id}`)}
                      className="cursor-pointer border-b border-hairline transition-colors last:border-0 hover:bg-canvas"
                    >
                      <td className="px-5 py-3">
                        <SerialBadge>{serial(s.serial_number)}</SerialBadge>
                      </td>
                      <td className="px-5 py-3 font-medium text-ink">
                        {s.title || "Untitled cost sheet"}
                      </td>
                      <td className="px-5 py-3 text-ink-soft">
                        {s.customer_name || "—"}
                      </td>
                      <td className="px-5 py-3">
                        <StatusBadge status={s.status} />
                      </td>
                      <td className="px-5 py-3 text-right font-bold text-ink">
                        {t
                          ? formatMoney(t.maxTotalDisplay, s.display_currency)
                          : formatMoney(0, s.display_currency)}
                      </td>
                      <td className="px-5 py-3 text-right text-ink-soft">
                        {s.display_currency}
                      </td>
                      <td className="px-5 py-3 text-right text-ink-soft">
                        {formatDate(s.updated_at)}
                      </td>
                      <td className="px-5 py-3 text-right">
                        <Button
                          className="min-h-[40px] px-3 py-1.5 text-[0.82rem] md:min-h-0"
                          disabled={dupId === s.id}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDuplicate(s.id);
                          }}
                        >
                          {dupId === s.id ? "Duplicating…" : "Duplicate"}
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <p className="mt-3 text-[0.8rem] text-ink-soft">
        Total cost shows the highest-priced size in each sheet, converted to its
        display currency.
      </p>
    </div>
  );
}
