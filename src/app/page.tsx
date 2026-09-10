"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  FileSpreadsheet,
  FilePen,
  Archive,
  type LucideIcon,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { loadSheetTotals, type SheetTotal } from "@/lib/sheetTotals";
import { formatMoney, formatDate, serial } from "@/lib/format";
import type { CostSheet } from "@/lib/types";
import {
  ButtonLink,
  Card,
  EmptyState,
  ErrorNote,
  PageHeader,
  SerialBadge,
  Spinner,
  StatusBadge,
} from "@/components/ui";

interface Kpis {
  total: number;
  draft: number;
  archived: number;
}

type Family = "peach" | "lavender" | "mint";

const FAMILY: Record<Family, { card: string; badge: string }> = {
  peach: { card: "bg-peach", badge: "bg-peach-badge" },
  lavender: { card: "bg-lavender", badge: "bg-lavender-badge" },
  mint: { card: "bg-mint", badge: "bg-mint-badge" },
};

export default function DashboardPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [kpis, setKpis] = useState<Kpis>({ total: 0, draft: 0, archived: 0 });
  const [recent, setRecent] = useState<CostSheet[]>([]);
  const [totals, setTotals] = useState<Record<string, SheetTotal>>({});

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const [allRes, recentRes] = await Promise.all([
        supabase.from("cost_sheets").select("id, status"),
        supabase
          .from("cost_sheets")
          .select("*")
          .order("updated_at", { ascending: false })
          .limit(6),
      ]);

      if (cancelled) return;

      if (allRes.error || recentRes.error) {
        setError(
          allRes.error?.message ||
            recentRes.error?.message ||
            "Failed to load dashboard.",
        );
        setLoading(false);
        return;
      }

      const all = allRes.data ?? [];
      setKpis({
        total: all.length,
        draft: all.filter((s) => s.status === "draft").length,
        archived: all.filter((s) => s.status === "archived").length,
      });

      const recentSheets = (recentRes.data ?? []) as CostSheet[];
      setRecent(recentSheets);
      setTotals(await loadSheetTotals(recentSheets));
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div>
      <PageHeader
        title="Welcome back"
        description="A quick read on every costing you are keeping track of."
      >
        <ButtonLink href="/sheets/new" variant="primary">
          New cost sheet
        </ButtonLink>
      </PageHeader>

      {error ? <ErrorNote message={error} /> : null}

      {loading ? (
        <Spinner label="Loading dashboard…" />
      ) : (
        <>
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
            <KpiCard
              family="peach"
              icon={FileSpreadsheet}
              label="Total cost sheets"
              value={kpis.total}
            />
            <KpiCard
              family="lavender"
              icon={FilePen}
              label="Draft"
              value={kpis.draft}
            />
            <KpiCard
              family="mint"
              icon={Archive}
              label="Archived"
              value={kpis.archived}
            />
          </div>

          <div className="mt-8">
            <Card className="p-6">
              <div className="mb-2 flex items-center justify-between">
                <h2 className="text-[1.125rem] font-semibold tracking-tight text-ink">
                  Recent cost sheets
                </h2>
                <Link
                  href="/sheets"
                  className="text-[0.9rem] font-medium text-ink-soft hover:text-ink"
                >
                  View all
                </Link>
              </div>

              {recent.length === 0 ? (
                <EmptyState
                  title="No cost sheets yet"
                  description="Create your first cost sheet to start pricing an order."
                  action={
                    <ButtonLink href="/sheets/new" variant="primary">
                      New cost sheet
                    </ButtonLink>
                  }
                />
              ) : (
                <ul className="-mx-2">
                  {recent.map((sheet) => {
                    const t = totals[sheet.id];
                    return (
                      <li
                        key={sheet.id}
                        className="border-b border-hairline last:border-0"
                      >
                        <Link
                          href={`/sheets/${sheet.id}`}
                          className="flex items-center gap-4 rounded-xl px-2 py-3 transition-colors hover:bg-canvas"
                        >
                          <SerialBadge>{serial(sheet.serial_number)}</SerialBadge>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-[1rem] font-medium text-ink">
                              {sheet.title || "Untitled cost sheet"}
                            </p>
                            <p className="truncate text-[0.875rem] text-ink-soft">
                              {sheet.customer_name || "No customer"}
                            </p>
                          </div>
                          <StatusBadge status={sheet.status} />
                          <div className="w-32 shrink-0 text-right">
                            <p className="text-[1rem] font-bold text-ink">
                              {t
                                ? formatMoney(
                                    t.maxTotalDisplay,
                                    sheet.display_currency,
                                  )
                                : formatMoney(0, sheet.display_currency)}
                            </p>
                            <p className="text-[0.8rem] text-ink-soft">
                              {formatDate(sheet.updated_at)}
                            </p>
                          </div>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              )}
            </Card>
          </div>
        </>
      )}
    </div>
  );
}

function KpiCard({
  family,
  icon: Icon,
  label,
  value,
}: {
  family: Family;
  icon: LucideIcon;
  label: string;
  value: number;
}) {
  const f = FAMILY[family];
  return (
    <div className={`rounded-2xl p-6 ${f.card}`}>
      <span
        className={`mb-4 flex h-10 w-10 items-center justify-center rounded-full text-white ${f.badge}`}
      >
        <Icon size={20} strokeWidth={2} />
      </span>
      <p className="text-[2rem] font-bold leading-none tracking-tight text-ink">
        {value}
      </p>
      <p className="mt-1.5 text-[0.9rem] font-medium text-ink-soft">{label}</p>
    </div>
  );
}
