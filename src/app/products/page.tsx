"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { PRODUCT_COST_FIELDS, type Product } from "@/lib/types";
import {
  Button,
  Card,
  ErrorNote,
  PageHeader,
  Pill,
  Spinner,
  cn,
} from "@/components/ui";

type RateKey = (typeof PRODUCT_COST_FIELDS)[number]["key"];

const BLANK: Record<RateKey, number> = {
  cutting_rate: 0,
  stitching_rate: 0,
  threading_rate: 0,
  packing_rate: 0,
};

const numOrZero = (v: string) => (v === "" ? 0 : Number(v));
const editValue = (n: number) => (n === 0 ? "" : n);

export default function ProductsPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [edits, setEdits] = useState<Record<string, Partial<Product>>>({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const [showInactive, setShowInactive] = useState(true);

  const [newRow, setNewRow] = useState<{ name: string } & Record<RateKey, number>>(
    { name: "", ...BLANK },
  );
  const [adding, setAdding] = useState(false);

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from("products")
      .select("*")
      .order("sort_order", { ascending: true });
    setError(error ? error.message : null);
    setProducts((data ?? []) as Product[]);
    setEdits({});
    setLoading(false);
  }, []);

  useEffect(() => {
    void (async () => {
      await load();
    })();
  }, [load]);

  const visible = products.filter((p) => showInactive || p.is_active);

  function patch(id: string, key: keyof Product, value: unknown) {
    setEdits((prev) => ({ ...prev, [id]: { ...prev[id], [key]: value } }));
  }
  function valueOf<K extends keyof Product>(p: Product, key: K): Product[K] {
    const e = edits[p.id];
    return e && key in e ? (e[key] as Product[K]) : p[key];
  }
  const isDirty = (id: string) =>
    edits[id] && Object.keys(edits[id]).length > 0;

  async function saveRow(p: Product) {
    const e = edits[p.id];
    if (!e) return;
    setSavingId(p.id);
    setError(null);
    const { error } = await supabase
      .from("products")
      .update({
        name: (e.name ?? p.name) as string,
        cutting_rate: Number(e.cutting_rate ?? p.cutting_rate) || 0,
        stitching_rate: Number(e.stitching_rate ?? p.stitching_rate) || 0,
        threading_rate: Number(e.threading_rate ?? p.threading_rate) || 0,
        packing_rate: Number(e.packing_rate ?? p.packing_rate) || 0,
      })
      .eq("id", p.id);
    setSavingId(null);
    if (error) setError(error.message);
    else await load();
  }

  async function toggleActive(p: Product) {
    setSavingId(p.id);
    const { error } = await supabase
      .from("products")
      .update({ is_active: !p.is_active })
      .eq("id", p.id);
    setSavingId(null);
    if (error) setError(error.message);
    else await load();
  }

  async function move(index: number, dir: -1 | 1) {
    const target = index + dir;
    if (target < 0 || target >= products.length) return;
    const a = products[index];
    const b = products[target];
    setSavingId(a.id);
    const { error } = await supabase.from("products").upsert([
      { ...a, sort_order: b.sort_order },
      { ...b, sort_order: a.sort_order },
    ]);
    setSavingId(null);
    if (error) setError(error.message);
    else await load();
  }

  async function addProduct() {
    if (!newRow.name.trim()) {
      setError("Give the product a name first.");
      return;
    }
    setAdding(true);
    setError(null);
    const nextOrder =
      products.reduce((m, p) => Math.max(m, p.sort_order), 0) + 1;
    const { error } = await supabase.from("products").insert({
      name: newRow.name.trim(),
      cutting_rate: Number(newRow.cutting_rate) || 0,
      stitching_rate: Number(newRow.stitching_rate) || 0,
      threading_rate: Number(newRow.threading_rate) || 0,
      packing_rate: Number(newRow.packing_rate) || 0,
      sort_order: nextOrder,
      is_active: true,
    });
    setAdding(false);
    if (error) {
      setError(error.message);
      return;
    }
    setNewRow({ name: "", ...BLANK });
    await load();
  }

  return (
    <div>
      <PageHeader
        title="Products"
        description="Each product carries four cost rates — cutting, stitching, threading and packing — that a cost sheet can pull in."
      >
        <label className="flex items-center gap-2 text-[0.9rem] text-ink-soft">
          <input
            type="checkbox"
            checked={showInactive}
            onChange={(e) => setShowInactive(e.target.checked)}
          />
          Show inactive
        </label>
      </PageHeader>

      {error ? <ErrorNote message={error} /> : null}

      {loading ? (
        <Spinner label="Loading products…" />
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-[0.95rem]">
              <thead>
                <tr className="border-b border-hairline text-[0.8rem] font-medium text-ink-soft">
                  <th className="px-4 py-3 font-medium">Order</th>
                  <th className="px-4 py-3 font-medium">Name</th>
                  {PRODUCT_COST_FIELDS.map((f) => (
                    <th key={f.key} className="px-4 py-3 text-right font-medium">
                      {f.label}
                    </th>
                  ))}
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((p) => {
                  const realIndex = products.findIndex((x) => x.id === p.id);
                  return (
                    <tr
                      key={p.id}
                      className={cn(
                        "border-b border-hairline last:border-0",
                        !p.is_active && "opacity-55",
                      )}
                    >
                      <td className="px-4 py-2">
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => move(realIndex, -1)}
                            disabled={realIndex === 0 || savingId === p.id}
                            className="flex min-h-[40px] min-w-[40px] items-center justify-center rounded border border-hairline text-ink-soft hover:bg-canvas disabled:opacity-30 md:min-h-0 md:min-w-0 md:px-1.5"
                            aria-label="Move up"
                          >
                            ↑
                          </button>
                          <button
                            onClick={() => move(realIndex, 1)}
                            disabled={
                              realIndex === products.length - 1 ||
                              savingId === p.id
                            }
                            className="flex min-h-[40px] min-w-[40px] items-center justify-center rounded border border-hairline text-ink-soft hover:bg-canvas disabled:opacity-30 md:min-h-0 md:min-w-0 md:px-1.5"
                            aria-label="Move down"
                          >
                            ↓
                          </button>
                        </div>
                      </td>
                      <td className="px-4 py-2">
                        <input
                          className="field min-w-[10rem]"
                          value={valueOf(p, "name")}
                          onChange={(e) => patch(p.id, "name", e.target.value)}
                        />
                      </td>
                      {PRODUCT_COST_FIELDS.map((f) => (
                        <td key={f.key} className="px-4 py-2">
                          <input
                            type="number"
                            step="0.01"
                            className="field w-24 text-right"
                            value={editValue(valueOf(p, f.key) as number)}
                            placeholder="0"
                            onChange={(e) =>
                              patch(p.id, f.key, numOrZero(e.target.value))
                            }
                          />
                        </td>
                      ))}
                      <td className="px-4 py-2">
                        {p.is_active ? (
                          <Pill tone="mint">Active</Pill>
                        ) : (
                          <Pill>Inactive</Pill>
                        )}
                      </td>
                      <td className="px-4 py-2">
                        <div className="flex items-center justify-end gap-2">
                          {isDirty(p.id) ? (
                            <Button
                              variant="primary"
                              className="min-h-[40px] px-3 py-1.5 text-[0.85rem] md:min-h-0"
                              disabled={savingId === p.id}
                              onClick={() => saveRow(p)}
                            >
                              Save
                            </Button>
                          ) : null}
                          <Button
                            className="min-h-[40px] px-3 py-1.5 text-[0.85rem] md:min-h-0"
                            disabled={savingId === p.id}
                            onClick={() => toggleActive(p)}
                          >
                            {p.is_active ? "Deactivate" : "Activate"}
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {visible.length === 0 ? (
                  <tr>
                    <td
                      colSpan={PRODUCT_COST_FIELDS.length + 4}
                      className="px-4 py-8 text-center text-[0.9rem] text-ink-soft"
                    >
                      No products yet. Add one below.
                    </td>
                  </tr>
                ) : null}
              </tbody>
              <tfoot>
                <tr className="bg-canvas">
                  <td className="px-4 py-3 text-ink-soft">New</td>
                  <td className="px-4 py-3">
                    <input
                      className="field min-w-[10rem]"
                      placeholder="Product name"
                      value={newRow.name}
                      onChange={(e) =>
                        setNewRow((r) => ({ ...r, name: e.target.value }))
                      }
                    />
                  </td>
                  {PRODUCT_COST_FIELDS.map((f) => (
                    <td key={f.key} className="px-4 py-3">
                      <input
                        type="number"
                        step="0.01"
                        className="field w-24 text-right"
                        placeholder="0"
                        value={editValue(newRow[f.key])}
                        onChange={(e) =>
                          setNewRow((r) => ({
                            ...r,
                            [f.key]: numOrZero(e.target.value),
                          }))
                        }
                      />
                    </td>
                  ))}
                  <td className="px-4 py-3" />
                  <td className="px-4 py-3 text-right">
                    <Button
                      variant="primary"
                      className="min-h-[40px] px-3 py-1.5 text-[0.85rem] md:min-h-0"
                      disabled={adding}
                      onClick={addProduct}
                    >
                      Add product
                    </Button>
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
