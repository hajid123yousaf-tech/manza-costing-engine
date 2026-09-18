"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import {
  computeSizeCost,
  isPercentUnit,
  rateForCurrency,
  sumRates,
} from "@/lib/costing";
import { downloadSheetExcel } from "@/lib/excel";
import { buildLedger, type LedgerLayout } from "@/lib/ledger";
import { duplicateSheet } from "@/lib/duplicateSheet";
import { formatMoney, formatNumber, serial } from "@/lib/format";
import { PrintLedger } from "@/components/PrintLedger";
import { ExchangeRatesPanel } from "@/components/ExchangeRatesPanel";
import {
  FABRIC_CATEGORIES,
  FABRIC_UNITS,
  PRODUCT_COST_FIELDS,
  sortCurrencyCodes,
  type CurrencyCode,
  type FabricType,
  type Product,
  type Size,
} from "@/lib/types";
import {
  Button,
  ButtonLink,
  Card,
  cn,
  ErrorNote,
  PageHeader,
  SectionHeading,
  Spinner,
  StatusBadge,
  SuccessNote,
} from "@/components/ui";

interface FabricRow {
  id: string;
  name: string;
  rate: number;
  fabricType: FabricType;
}

interface ItemRow {
  id: string;
  source_item_id: string | null;
  name: string;
  unit: string;
  rate: number;
  varies_by_size: boolean;
  /** sizeId -> rate, only meaningful when varies_by_size is true. Missing = 0. */
  sizeRates: Record<string, number>;
}

interface SheetRef {
  id: string;
  serial_number: number;
  title: string;
}

type FabricConsumption = Record<FabricType, Record<string, number>>;

/**
 * Client-generated id for value-add item rows (inserted as the real primary
 * key of a `uuid` column, see persistChildren). `crypto.randomUUID()` only
 * works in secure contexts (HTTPS, or localhost) — on a plain-HTTP origin
 * it's `undefined`, so the fallback below must still produce a spec-shaped
 * v4 UUID (not an arbitrary tagged string), or Postgres rejects the insert
 * with "invalid input syntax for type uuid". `crypto.getRandomValues`,
 * unlike `randomUUID`, has no secure-context requirement.
 */
const uid = (): string => {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  const bytes = new Uint8Array(16);
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < 16; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x40; // version 4
  bytes[8] = (bytes[8] & 0x3f) | 0x80; // variant 10
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
};

const numOrZero = (v: string) => (v === "" ? 0 : Number(v));
const editValue = (n: number) => (n === 0 ? "" : n);
const emptyConsumption = (): FabricConsumption => ({ imported: {}, local: {} });

/**
 * Logs the full Postgrest error (code/message/details/hint — not just
 * `.message`) so a failure like a constraint violation is diagnosable from
 * the console, and returns a message that includes the code for the user.
 */
function describeSaveError(e: unknown, context: string): string {
  const err = e as
    | { message?: string; details?: string | null; hint?: string | null; code?: string }
    | null
    | undefined;
  console.error(`[cost sheet] ${context} failed:`, err);
  if (err && typeof err === "object" && typeof err.message === "string") {
    const parts = [err.message];
    if (err.code) parts.push(`(code ${err.code})`);
    if (err.details) parts.push(`— ${err.details}`);
    if (err.hint) parts.push(`Hint: ${err.hint}`);
    return parts.join(" ");
  }
  return e instanceof Error ? e.message : "Save failed.";
}

/** Starter value-add rows dropped into every brand-new cost sheet. */
const DEFAULT_ITEM_NAMES = [
  "Thread",
  "CTN Packing",
  "Label",
  "Poly Bag",
  "Master Bag",
  "Card/Parchi",
  "Carton",
  "Freight",
  "Overhead",
  "Pati",
  "Bank",
  "Zip",
  "Kunda",
  "Tape",
  "Sales Tax",
];

const defaultNewSheetItems = (): ItemRow[] =>
  DEFAULT_ITEM_NAMES.map((name) => ({
    id: uid(),
    source_item_id: null,
    name,
    unit: "per unit",
    rate: 0,
    varies_by_size: false,
    sizeRates: {},
  }));

export default function CostSheetEditorPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const routeId = params.id;
  const isNew = routeId === "new";

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  // Mirrors `saving` but updates synchronously, so a second click that lands
  // before React re-renders the disabled button still can't slip through.
  const savingRef = useRef(false);
  const [duplicating, setDuplicating] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [printLayout, setPrintLayout] = useState<LedgerLayout>("unified");

  // Reference data
  const [sizes, setSizes] = useState<Size[]>([]);
  const [rates, setRates] = useState<
    { currency_code: string; rate_to_pkr: number }[]
  >([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [productSearch, setProductSearch] = useState("");
  const [selectedProductId, setSelectedProductId] = useState("");

  const [otherSheets, setOtherSheets] = useState<SheetRef[]>([]);
  const [sheetSearch, setSheetSearch] = useState("");
  const [loadFromSheetId, setLoadFromSheetId] = useState("");
  const [loadingItems, setLoadingItems] = useState(false);

  // Inline size management
  const [addingSize, setAddingSize] = useState(false);
  const [newSizeName, setNewSizeName] = useState("");
  const [savingSize, setSavingSize] = useState(false);
  const [editingSizeId, setEditingSizeId] = useState<string | null>(null);
  const [editSizeName, setEditSizeName] = useState("");

  // Sheet state
  const [serialNumber, setSerialNumber] = useState<number | null>(null);
  const [createdAt, setCreatedAt] = useState<string | null>(null);
  const [status, setStatus] = useState<"draft" | "archived">("draft");
  const [title, setTitle] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [orderRef, setOrderRef] = useState("");
  const [displayCurrency, setDisplayCurrency] = useState<CurrencyCode>("PKR");
  const [notes, setNotes] = useState("");

  const [fabricUnit, setFabricUnit] = useState<Record<FabricType, string>>({
    imported: "meter",
    local: "meter",
  });
  const [fabric, setFabric] = useState<FabricRow[]>([]);
  const [fabricConsumption, setFabricConsumption] = useState<FabricConsumption>(
    emptyConsumption(),
  );
  const [items, setItems] = useState<ItemRow[]>([]);

  const load = useCallback(async () => {
    const sizeQuery = isNew
      ? Promise.resolve({ data: [] as Size[], error: null })
      : supabase
          .from("sizes")
          .select("*")
          .eq("cost_sheet_id", routeId)
          .eq("is_active", true)
          .order("sort_order", { ascending: true });
    const [sizeRes, rateRes, prodRes, sheetsRes] = await Promise.all([
      sizeQuery,
      supabase.from("exchange_rates").select("currency_code, rate_to_pkr"),
      supabase
        .from("products")
        .select("*")
        .eq("is_active", true)
        .order("sort_order", { ascending: true }),
      supabase
        .from("cost_sheets")
        .select("id, serial_number, title")
        .order("serial_number", { ascending: false }),
    ]);

    if (sizeRes.error || rateRes.error || prodRes.error || sheetsRes.error) {
      setError(
        sizeRes.error?.message ||
          rateRes.error?.message ||
          prodRes.error?.message ||
          sheetsRes.error?.message ||
          "Failed to load reference data.",
      );
      setLoading(false);
      return;
    }

    setError(null);
    setSizes((sizeRes.data ?? []) as Size[]);
    setRates(rateRes.data ?? []);
    setProducts((prodRes.data ?? []) as Product[]);
    setOtherSheets(
      ((sheetsRes.data ?? []) as SheetRef[]).filter((s) => s.id !== routeId),
    );

    if (isNew) {
      setSerialNumber(null);
      setCreatedAt(null);
      setStatus("draft");
      setTitle("");
      setCustomerName("");
      setOrderRef("");
      setDisplayCurrency("PKR");
      setNotes("");
      setFabricUnit({ imported: "meter", local: "meter" });
      setFabric([]);
      setFabricConsumption(emptyConsumption());
      setItems(defaultNewSheetItems());
      setLoading(false);
      return;
    }

    const [sheetRes, rmRes, consRes, itemRes] = await Promise.all([
      supabase.from("cost_sheets").select("*").eq("id", routeId).single(),
      supabase
        .from("cost_sheet_raw_materials")
        .select("*")
        .eq("cost_sheet_id", routeId)
        .order("sort_order", { ascending: true }),
      supabase
        .from("cost_sheet_fabric_consumption")
        .select("*")
        .eq("cost_sheet_id", routeId),
      supabase
        .from("cost_sheet_items")
        .select("*")
        .eq("cost_sheet_id", routeId)
        .order("sort_order", { ascending: true }),
    ]);

    if (sheetRes.error || !sheetRes.data) {
      setError("Cost sheet not found.");
      setLoading(false);
      return;
    }

    const itemIds = (itemRes.data ?? []).map((i) => i.id as string);
    const sizeRateRes = itemIds.length
      ? await supabase
          .from("cost_sheet_item_size_rates")
          .select("cost_sheet_item_id, size_id, rate")
          .in("cost_sheet_item_id", itemIds)
      : { data: [] as { cost_sheet_item_id: string; size_id: string; rate: number }[] };
    const sizeRatesByItem = new Map<string, Record<string, number>>();
    for (const r of sizeRateRes.data ?? []) {
      const map = sizeRatesByItem.get(r.cost_sheet_item_id) ?? {};
      map[r.size_id] = Number(r.rate);
      sizeRatesByItem.set(r.cost_sheet_item_id, map);
    }

    const sheet = sheetRes.data;
    setSerialNumber(sheet.serial_number);
    setCreatedAt(sheet.created_at ?? null);
    setStatus(sheet.status);
    setTitle(sheet.title ?? "");
    setCustomerName(sheet.customer_name ?? "");
    setOrderRef(sheet.order_ref ?? "");
    setDisplayCurrency(sheet.display_currency);
    setNotes(sheet.notes ?? "");
    setFabricUnit({
      imported: sheet.imported_fabric_unit || "meter",
      local: sheet.local_fabric_unit || "meter",
    });

    setFabric(
      (rmRes.data ?? []).map((r) => ({
        id: r.id,
        name: r.name,
        rate: Number(r.rate),
        fabricType: (r.fabric_type === "imported"
          ? "imported"
          : "local") as FabricType,
      })),
    );

    const consMap = emptyConsumption();
    for (const c of consRes.data ?? []) {
      const type = (c.fabric_type === "imported" ? "imported" : "local") as FabricType;
      consMap[type][c.size_id] = Number(c.consumption);
    }
    setFabricConsumption(consMap);

    setItems(
      (itemRes.data ?? []).map((i) => ({
        id: i.id,
        source_item_id: i.source_item_id,
        name: i.name,
        unit: i.unit,
        rate: Number(i.rate),
        varies_by_size: Boolean(i.varies_by_size),
        sizeRates: sizeRatesByItem.get(i.id) ?? {},
      })),
    );

    setLoading(false);
  }, [isNew, routeId]);

  useEffect(() => {
    void (async () => {
      await load();
    })();
  }, [load]);

  /**
   * Re-fetches just the exchange rates used for currency conversion, without
   * resetting any other in-progress edit on the page. Passed to the
   * Exchange rates panel so a rate change there is reflected immediately.
   */
  const refetchRates = useCallback(async () => {
    const { data, error } = await supabase
      .from("exchange_rates")
      .select("currency_code, rate_to_pkr");
    if (!error) setRates(data ?? []);
  }, []);

  /* ---------- derived ---------- */

  const rateToPkr = rateForCurrency(rates, displayCurrency);

  const categoryTotal = useMemo<Record<FabricType, number>>(
    () => ({
      imported: sumRates(fabric.filter((f) => f.fabricType === "imported")),
      local: sumRates(fabric.filter((f) => f.fabricType === "local")),
    }),
    [fabric],
  );

  const sizeCosts = useMemo(() => {
    const calcItems = items.map((it, index) => ({
      id: it.id,
      name: it.name,
      unit: it.unit,
      rate: it.rate,
      sort_order: index,
      variesBySize: it.varies_by_size,
      sizeRates: it.sizeRates,
    }));
    return sizes.map((s) =>
      computeSizeCost(
        s.id,
        {
          totalPerUnit: categoryTotal.imported,
          consumption: fabricConsumption.imported,
        },
        {
          totalPerUnit: categoryTotal.local,
          consumption: fabricConsumption.local,
        },
        calcItems,
        rateToPkr,
      ),
    );
  }, [categoryTotal, fabricConsumption, items, sizes, rateToPkr]);

  const ledgerData = useMemo(
    () =>
      buildLedger({
        createdAt,
        title,
        sizes: sizes.map((s) => ({ id: s.id, name: s.name })),
        fabric: fabric.map((f) => ({
          name: f.name,
          rate: f.rate,
          fabricType: f.fabricType,
        })),
        fabricUnit,
        fabricConsumption,
        categoryTotal,
        items: items.map((i) => ({ name: i.name, unit: i.unit, rate: i.rate })),
        sizeCosts,
        rates,
        displayCurrency,
      }),
    [
      createdAt,
      title,
      sizes,
      fabric,
      fabricUnit,
      fabricConsumption,
      categoryTotal,
      items,
      sizeCosts,
      rates,
      displayCurrency,
    ],
  );

  const filteredProducts = useMemo(() => {
    const q = productSearch.trim().toLowerCase();
    return q
      ? products.filter((p) => p.name.toLowerCase().includes(q))
      : products;
  }, [products, productSearch]);

  const filteredSheets = useMemo(() => {
    const q = sheetSearch.trim().toLowerCase();
    return q
      ? otherSheets.filter(
          (s) =>
            s.title.toLowerCase().includes(q) ||
            serial(s.serial_number).includes(q),
        )
      : otherSheets;
  }, [otherSheets, sheetSearch]);

  /* ---------- fabric handlers ---------- */

  function addFabric(type: FabricType) {
    setFabric((prev) => [...prev, { id: uid(), name: "", rate: 0, fabricType: type }]);
  }
  function updateFabric(id: string, key: "name" | "rate", value: string | number) {
    setFabric((prev) =>
      prev.map((r) => (r.id === id ? { ...r, [key]: value } : r)),
    );
  }
  function removeFabric(id: string) {
    setFabric((prev) => prev.filter((r) => r.id !== id));
  }
  function setFabricCell(type: FabricType, sizeId: string, value: number) {
    setFabricConsumption((c) => ({
      ...c,
      [type]: { ...c[type], [sizeId]: value },
    }));
  }

  /* ---------- inline size handlers ---------- */

  async function addSizeInline() {
    const name = newSizeName.trim();
    if (!name) return;
    if (isNew) {
      setError("Save the cost sheet first, then add sizes.");
      return;
    }
    setSavingSize(true);
    setError(null);
    const nextOrder = sizes.reduce((m, s) => Math.max(m, s.sort_order), 0) + 1;
    const { data, error } = await supabase
      .from("sizes")
      .insert({
        name,
        sort_order: nextOrder,
        is_active: true,
        cost_sheet_id: routeId,
      })
      .select("*")
      .single();
    setSavingSize(false);
    if (error || !data) {
      setError(error?.message ?? "Could not add the size.");
      return;
    }
    setSizes((prev) => [...prev, data as Size]);
    setNewSizeName("");
    setAddingSize(false);
    setNotice(`Added size "${name}".`);
  }

  function startEditSize(s: Size) {
    setEditingSizeId(s.id);
    setEditSizeName(s.name);
  }

  async function saveSizeName() {
    if (!editingSizeId) return;
    const name = editSizeName.trim();
    if (!name) return;
    setSavingSize(true);
    setError(null);
    const { error } = await supabase
      .from("sizes")
      .update({ name })
      .eq("id", editingSizeId);
    setSavingSize(false);
    if (error) {
      setError(error.message);
      return;
    }
    setSizes((prev) =>
      prev.map((s) => (s.id === editingSizeId ? { ...s, name } : s)),
    );
    setEditingSizeId(null);
  }

  async function deactivateSize() {
    if (!editingSizeId) return;
    setSavingSize(true);
    setError(null);
    const { error } = await supabase
      .from("sizes")
      .update({ is_active: false })
      .eq("id", editingSizeId);
    setSavingSize(false);
    if (error) {
      setError(error.message);
      return;
    }
    setSizes((prev) => prev.filter((s) => s.id !== editingSizeId));
    setEditingSizeId(null);
  }

  /* ---------- value-add item handlers ---------- */

  function fetchFromProduct() {
    const p = products.find((x) => x.id === selectedProductId);
    if (!p) {
      setNotice(null);
      setError("Pick a product first.");
      return;
    }
    if (items.some((i) => i.source_item_id === p.id)) {
      setError(null);
      setNotice(`${p.name} is already on this sheet.`);
      return;
    }
    const additions: ItemRow[] = PRODUCT_COST_FIELDS.map((f) => ({
      id: uid(),
      source_item_id: p.id,
      name: f.label,
      unit: "per unit",
      rate: Number(p[f.key]) || 0,
      varies_by_size: false,
      sizeRates: {},
    }));
    setItems((prev) => [...prev, ...additions]);
    setError(null);
    setNotice(`Added Cutting, Stitching, Threading and Packing from ${p.name}.`);
  }

  async function loadItemsFromSheet() {
    if (!loadFromSheetId) {
      setError("Pick a cost sheet first.");
      return;
    }
    setLoadingItems(true);
    setError(null);
    setNotice(null);
    const { data, error } = await supabase
      .from("cost_sheet_items")
      .select("name, unit, rate, sort_order, varies_by_size")
      .eq("cost_sheet_id", loadFromSheetId)
      .order("sort_order", { ascending: true });
    setLoadingItems(false);
    if (error) {
      setError(error.message);
      return;
    }
    // A varies_by_size item's real values live in cost_sheet_item_size_rates,
    // keyed to the SOURCE sheet's own sizes — those sizes don't exist on this
    // sheet, so there's nothing valid to copy. Load it flat at 0 instead of
    // silently carrying over a rate that never meant "the same for every size".
    const variedCount = (data ?? []).filter((i) => i.varies_by_size).length;
    const rows = (data ?? []).map((i) => ({
      id: uid(),
      source_item_id: null,
      name: i.name as string,
      unit: i.unit as string,
      rate: i.varies_by_size ? 0 : Number(i.rate),
      varies_by_size: false,
      sizeRates: {},
    }));
    if (rows.length === 0) {
      setNotice("That cost sheet has no value-add items to copy.");
      return;
    }
    setItems((prev) => [...prev, ...rows]);
    const src = otherSheets.find((s) => s.id === loadFromSheetId);
    const addedNote = `Added ${rows.length} item(s) from ${
      src ? serial(src.serial_number) : "the selected sheet"
    }.`;
    setNotice(
      variedCount > 0
        ? `${addedNote} ${variedCount} item(s) varied by size on the source sheet — loaded as flat rate, please re-enter.`
        : addedNote,
    );
  }

  function addItemRow() {
    setItems((prev) => [
      ...prev,
      {
        id: uid(),
        source_item_id: null,
        name: "",
        unit: "per unit",
        rate: 0,
        varies_by_size: false,
        sizeRates: {},
      },
    ]);
  }
  function updateItem(
    id: string,
    key: keyof ItemRow,
    value: string | number | null,
  ) {
    setItems((prev) =>
      prev.map((i) => (i.id === id ? { ...i, [key]: value } : i)),
    );
  }
  function removeItem(id: string) {
    setItems((prev) => prev.filter((i) => i.id !== id));
  }
  function toggleItemVariesBySize(id: string) {
    setItems((prev) =>
      prev.map((i) =>
        i.id === id ? { ...i, varies_by_size: !i.varies_by_size } : i,
      ),
    );
  }
  function setItemSizeRate(id: string, sizeId: string, value: number) {
    setItems((prev) =>
      prev.map((i) =>
        i.id === id
          ? { ...i, sizeRates: { ...i.sizeRates, [sizeId]: value } }
          : i,
      ),
    );
  }
  /** Copies one size's rate for an item into another size, or into every other active size. */
  function copyItemSizeRate(id: string, fromSizeId: string, toSizeId: "all" | string) {
    setItems((prev) =>
      prev.map((i) => {
        if (i.id !== id) return i;
        const fromValue = i.sizeRates[fromSizeId] ?? 0;
        if (toSizeId === "all") {
          const next = { ...i.sizeRates };
          for (const s of sizes) {
            if (s.id !== fromSizeId) next[s.id] = fromValue;
          }
          return { ...i, sizeRates: next };
        }
        return { ...i, sizeRates: { ...i.sizeRates, [toSizeId]: fromValue } };
      }),
    );
  }
  function moveItem(index: number, dir: -1 | 1) {
    setItems((prev) => {
      const target = index + dir;
      if (target < 0 || target >= prev.length) return prev;
      const next = [...prev];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  /* ---------- persistence ---------- */

  async function persistChildren(sheetId: string) {
    await supabase
      .from("cost_sheet_fabric_consumption")
      .delete()
      .eq("cost_sheet_id", sheetId);
    await supabase
      .from("cost_sheet_items")
      .delete()
      .eq("cost_sheet_id", sheetId);
    await supabase
      .from("cost_sheet_raw_materials")
      .delete()
      .eq("cost_sheet_id", sheetId);

    const rmRows = FABRIC_CATEGORIES.flatMap((cat) =>
      fabric
        .filter((r) => r.fabricType === cat.type)
        .filter((r) => r.name.trim() !== "" || r.rate !== 0)
        .map((r, index) => ({
          cost_sheet_id: sheetId,
          name: r.name.trim() || "Untitled component",
          rate: r.rate || 0,
          sort_order: index,
          fabric_type: r.fabricType,
        })),
    );
    if (rmRows.length) {
      const { error } = await supabase
        .from("cost_sheet_raw_materials")
        .insert(rmRows);
      if (error) throw error;
    }

    const sizeIds = new Set(sizes.map((s) => s.id));
    const consRows: {
      cost_sheet_id: string;
      fabric_type: FabricType;
      size_id: string;
      consumption: number;
    }[] = [];
    for (const cat of FABRIC_CATEGORIES) {
      for (const [sizeId, value] of Object.entries(
        fabricConsumption[cat.type],
      )) {
        if (!sizeIds.has(sizeId) || !value) continue;
        consRows.push({
          cost_sheet_id: sheetId,
          fabric_type: cat.type,
          size_id: sizeId,
          consumption: value,
        });
      }
    }
    if (consRows.length) {
      const { error } = await supabase
        .from("cost_sheet_fabric_consumption")
        .insert(consRows);
      if (error) throw error;
    }

    const keptItems = items.filter(
      (i) =>
        i.name.trim() !== "" ||
        i.rate !== 0 ||
        (i.varies_by_size &&
          Object.values(i.sizeRates).some((v) => v !== 0)),
    );
    const itemRows = keptItems.map((i, index) => ({
      id: i.id,
      cost_sheet_id: sheetId,
      source_item_id: i.source_item_id,
      name: i.name.trim() || "Untitled item",
      unit: i.unit.trim() || "per unit",
      rate: i.rate || 0,
      sort_order: index,
      varies_by_size: i.varies_by_size,
    }));
    if (itemRows.length) {
      const { error } = await supabase.from("cost_sheet_items").insert(itemRows);
      if (error) throw error;
    }

    const sizeRateRows = keptItems
      .filter((i) => i.varies_by_size)
      .flatMap((i) =>
        Array.from(sizeIds)
          .filter((sizeId) => (i.sizeRates[sizeId] ?? 0) !== 0)
          .map((sizeId) => ({
            cost_sheet_item_id: i.id,
            size_id: sizeId,
            rate: i.sizeRates[sizeId] ?? 0,
          })),
      );
    if (sizeRateRows.length) {
      const { error } = await supabase
        .from("cost_sheet_item_size_rates")
        .insert(sizeRateRows);
      if (error) throw error;
    }
  }

  async function handleSave(nextStatus?: "draft" | "archived") {
    // Synchronous re-entrancy guard: a `ref` (unlike `saving` state) is
    // visible to a second invocation immediately, even if two clicks land
    // in the same tick before React re-renders the disabled button — so
    // this can never fire the header insert twice for one click sequence.
    if (savingRef.current) return;
    if (!title.trim()) {
      setError("Give the cost sheet a title before saving.");
      return;
    }
    savingRef.current = true;
    setSaving(true);
    setError(null);
    setNotice(null);

    const header = {
      title: title.trim(),
      customer_name: customerName.trim() || null,
      order_ref: orderRef.trim() || null,
      display_currency: displayCurrency,
      notes: notes.trim() || null,
      imported_fabric_unit: fabricUnit.imported,
      local_fabric_unit: fabricUnit.local,
      status: nextStatus ?? status,
      updated_at: new Date().toISOString(),
    };

    try {
      if (isNew) {
        const { data, error } = await supabase
          .from("cost_sheets")
          .insert(header)
          .select("id, serial_number, status")
          .single();
        if (error || !data) throw error ?? new Error("Insert failed.");

        try {
          await persistChildren(data.id);
        } catch (childError) {
          // Don't leave an orphaned, empty draft behind: if the fabric/item
          // rows fail to save, undo the header we just created so a failed
          // save never silently leaves a half-saved sheet in the list.
          const { error: rollbackError } = await supabase
            .from("cost_sheets")
            .delete()
            .eq("id", data.id);
          if (rollbackError) {
            console.error(
              "[cost sheet] rollback of orphaned header failed:",
              rollbackError,
            );
          }
          throw childError;
        }

        router.replace(`/costing-hub/sheets/${data.id}`);
        return;
      }

      const { error } = await supabase
        .from("cost_sheets")
        .update(header)
        .eq("id", routeId);
      if (error) throw error;
      await persistChildren(routeId);
      setStatus(header.status);
      setNotice(
        nextStatus === "archived" ? "Cost sheet archived." : "Changes saved.",
      );
      await load();
    } catch (e) {
      setError(
        describeSaveError(e, isNew ? "Creating cost sheet" : "Saving cost sheet"),
      );
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  async function handleDelete() {
    setSaving(true);
    setError(null);
    try {
      await supabase
        .from("cost_sheet_fabric_consumption")
        .delete()
        .eq("cost_sheet_id", routeId);
      await supabase
        .from("cost_sheet_items")
        .delete()
        .eq("cost_sheet_id", routeId);
      await supabase
        .from("cost_sheet_raw_materials")
        .delete()
        .eq("cost_sheet_id", routeId);
      const { error } = await supabase
        .from("cost_sheets")
        .delete()
        .eq("id", routeId);
      if (error) throw error;
      router.push("/costing-hub/sheets");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Delete failed.");
      setSaving(false);
    }
  }

  async function handleDuplicate() {
    setDuplicating(true);
    setError(null);
    try {
      const newId = await duplicateSheet(routeId);
      router.push(`/costing-hub/sheets/${newId}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not duplicate the sheet.");
      setDuplicating(false);
    }
  }

  function handleExcel() {
    downloadSheetExcel({
      serialNumber,
      title,
      ledger: ledgerData,
      layout: printLayout,
    });
  }

  if (loading) {
    return (
      <div>
        <PageHeader title="Cost sheet" />
        <Spinner label="Loading cost sheet…" />
      </div>
    );
  }

  if (error && !isNew && serialNumber === null) {
    return (
      <div>
        <PageHeader title="Cost sheet" />
        <ErrorNote message={error} />
        <div className="mt-4">
          <ButtonLink href="/costing-hub/sheets">Back to cost sheets</ButtonLink>
        </div>
      </div>
    );
  }

  const currencyNote =
    displayCurrency === "PKR"
      ? "Totals shown in PKR."
      : `1 ${displayCurrency} = ${formatNumber(rateToPkr, 2)} PKR`;

  const sizeColSpan = sizes.length + 2;

  const unitOptions = (current: string) =>
    FABRIC_UNITS.includes(current) ? FABRIC_UNITS : [...FABRIC_UNITS, current];

  // Pull the currency list from exchange_rates, defensively including the
  // sheet's current currency in case it was since removed from that table.
  const currencyOptions = sortCurrencyCodes([
    "PKR",
    ...rates.map((r) => r.currency_code),
    displayCurrency,
  ]);

  return (
    <>
      <div className="print:hidden">
      <PageHeader
        title={isNew ? "New cost sheet" : title || "Untitled cost sheet"}
        description={
          isNew
            ? "Serial number is assigned automatically once you save."
            : `${serial(serialNumber ?? 0)} · ${currencyNote}`
        }
      >
        {!isNew ? <StatusBadge status={status} /> : null}
        <div className="flex flex-wrap items-center gap-3 print:hidden">
          {!isNew ? (
            <>
              <Button
                onClick={handleDuplicate}
                disabled={duplicating}
                className="min-h-[44px] px-3 py-1.5 text-[0.85rem] md:min-h-0"
              >
                {duplicating ? "Duplicating…" : "Duplicate"}
              </Button>
              <div
                className="inline-flex gap-1 rounded-full border border-hairline bg-surface p-1 print:hidden"
                role="group"
                aria-label="Print / export layout"
              >
                <button
                  onClick={() => setPrintLayout("unified")}
                  className={cn(
                    "min-h-[40px] rounded-full px-3 py-1.5 text-[0.8rem] font-medium transition-colors md:min-h-0",
                    printLayout === "unified"
                      ? "bg-ink text-white"
                      : "text-ink-soft hover:text-ink",
                  )}
                >
                  Unified table
                </button>
                <button
                  onClick={() => setPrintLayout("per-size")}
                  className={cn(
                    "min-h-[40px] rounded-full px-3 py-1.5 text-[0.8rem] font-medium transition-colors md:min-h-0",
                    printLayout === "per-size"
                      ? "bg-ink text-white"
                      : "text-ink-soft hover:text-ink",
                  )}
                >
                  One page per size
                </button>
              </div>
              <Button
                onClick={() => window.print()}
                className="min-h-[44px] px-3 py-1.5 text-[0.85rem] md:min-h-0"
              >
                Print
              </Button>
              <Button
                onClick={handleExcel}
                className="min-h-[44px] px-3 py-1.5 text-[0.85rem] md:min-h-0"
              >
                Download Excel
              </Button>
            </>
          ) : null}
          <Link
            href="/costing-hub/sheets"
            className="flex min-h-[44px] items-center text-[0.9rem] font-medium text-ink-soft hover:text-ink md:min-h-0"
          >
            Back to list
          </Link>
        </div>
      </PageHeader>

      {error ? <ErrorNote message={error} /> : null}
      {notice ? <SuccessNote message={notice} /> : null}

      {/* Header fields */}
      <Card className="mb-8 p-6 print-card">
        <SectionHeading title="Details" />
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
          <label className="block">
            <span className="mb-1.5 block text-[0.85rem] font-medium text-ink">
              Title
            </span>
            <input
              className="field"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Percale bedsheet set — Spring"
            />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-[0.85rem] font-medium text-ink">
              Customer
            </span>
            <input
              className="field"
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              placeholder="Customer name"
            />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-[0.85rem] font-medium text-ink">
              Order reference
            </span>
            <input
              className="field"
              value={orderRef}
              onChange={(e) => setOrderRef(e.target.value)}
              placeholder="PO number or internal ref"
            />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-[0.85rem] font-medium text-ink">
              Display currency
            </span>
            <select
              className="field"
              value={displayCurrency}
              onChange={(e) =>
                setDisplayCurrency(e.target.value as CurrencyCode)
              }
            >
              {currencyOptions.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>

          <ExchangeRatesPanel onChanged={refetchRates} />

          <label className="block md:col-span-2">
            <span className="mb-1.5 block text-[0.85rem] font-medium text-ink">
              Notes
            </span>
            <textarea
              className="field min-h-[80px]"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Assumptions, quality, anything worth recording"
            />
          </label>
        </div>
      </Card>

      {/* Fabric cost build-ups */}
      {FABRIC_CATEGORIES.map((cat) => {
        const rows = fabric.filter((f) => f.fabricType === cat.type);
        const unit = fabricUnit[cat.type];
        return (
          <Card key={cat.type} className="mb-8 p-6 print-card">
            <SectionHeading
              title={cat.title}
              description="Cost build-up — add every component that makes up the price per unit."
              action={
                <div className="flex flex-wrap items-center gap-2">
                  <select
                    className="field w-24 print:hidden"
                    value={unit}
                    onChange={(e) =>
                      setFabricUnit((u) => ({
                        ...u,
                        [cat.type]: e.target.value,
                      }))
                    }
                    aria-label={`${cat.title} reference unit`}
                  >
                    {unitOptions(unit).map((u) => (
                      <option key={u} value={u}>
                        {u}
                      </option>
                    ))}
                  </select>
                  <Button
                    onClick={() => addFabric(cat.type)}
                    className="min-h-[44px] px-3 py-1.5 text-[0.85rem] print:hidden md:min-h-0"
                  >
                    Add row
                  </Button>
                </div>
              }
            />
            {rows.length === 0 ? (
              <p className="rounded-xl border border-dashed border-hairline px-4 py-6 text-center text-[0.9rem] text-ink-soft">
                No cost components yet. Add rows like “Base fabric price”,
                “Logistics”, “Import duty”…
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-[0.92rem]">
                  <thead>
                    <tr className="border-b border-hairline text-[0.78rem] font-medium text-ink-soft">
                      <th className="py-2 pr-3 font-medium">Component</th>
                      <th className="py-2 pr-3 text-right font-medium">
                        Rate (PKR)
                      </th>
                      <th className="py-2 print:hidden" />
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((rm) => (
                      <tr
                        key={rm.id}
                        className="border-b border-hairline last:border-0"
                      >
                        <td className="py-2 pr-3">
                          <input
                            className="field"
                            value={rm.name}
                            onChange={(e) =>
                              updateFabric(rm.id, "name", e.target.value)
                            }
                            placeholder="e.g. Base fabric price"
                          />
                        </td>
                        <td className="py-2 pr-3">
                          <input
                            type="number"
                            step="0.01"
                            className="field max-w-[10rem] text-right"
                            value={editValue(rm.rate)}
                            placeholder="0"
                            onChange={(e) =>
                              updateFabric(
                                rm.id,
                                "rate",
                                numOrZero(e.target.value),
                              )
                            }
                          />
                        </td>
                        <td className="py-2 text-right print:hidden">
                          <button
                            onClick={() => removeFabric(rm.id)}
                            className="min-h-[40px] rounded-lg border border-hairline px-2.5 py-1.5 text-[0.82rem] text-ink-soft hover:bg-canvas md:min-h-0"
                          >
                            Remove
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <div className="mt-4 flex items-center justify-between border-t border-hairline pt-3">
              <span className="text-[0.95rem] font-bold text-ink">
                Total cost per {unit}
              </span>
              <span className="text-[1.05rem] font-bold text-ink tabular-nums">
                {formatMoney(categoryTotal[cat.type], "PKR")}
              </span>
            </div>
          </Card>
        );
      })}

      {/* Fabric consumption grid */}
      <Card className="mb-8 p-6 print-card">
        <SectionHeading
          title="Fabric consumption"
          description="How much fabric each size uses, in each category's reference unit. Add or edit sizes from the column headers — sizes belong only to this cost sheet."
        />

        {editingSizeId ? (
          <div className="mb-4 flex flex-wrap items-center gap-2 rounded-xl border border-hairline bg-canvas p-3 print:hidden">
            <span className="text-[0.82rem] font-medium text-ink">
              Edit size
            </span>
            <input
              className="field w-44"
              value={editSizeName}
              onChange={(e) => setEditSizeName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") saveSizeName();
              }}
            />
            <Button
              variant="primary"
              className="min-h-[40px] px-3 py-1.5 text-[0.82rem] md:min-h-0"
              disabled={savingSize || !editSizeName.trim()}
              onClick={saveSizeName}
            >
              Save name
            </Button>
            <Button
              variant="danger"
              className="min-h-[40px] px-3 py-1.5 text-[0.82rem] md:min-h-0"
              disabled={savingSize}
              onClick={deactivateSize}
            >
              Deactivate
            </Button>
            <Button
              variant="ghost"
              className="min-h-[40px] px-3 py-1.5 text-[0.82rem] md:min-h-0"
              onClick={() => setEditingSizeId(null)}
            >
              Cancel
            </Button>
          </div>
        ) : null}

        <div className="overflow-x-auto">
          <table className="grid-input w-full border-collapse text-[0.92rem]">
            <thead>
              <tr className="text-[0.78rem] font-medium text-ink-soft">
                <th className="border border-hairline bg-canvas px-3 py-2 text-left">
                  Category
                </th>
                {sizes.map((s) => (
                  <th
                    key={s.id}
                    className="border border-hairline bg-canvas px-3 py-2 text-right"
                  >
                    <span className="inline-flex items-center gap-1.5">
                      {s.name}
                      <button
                        onClick={() => startEditSize(s)}
                        className="flex min-h-[40px] min-w-[40px] items-center justify-center rounded border border-hairline text-[0.7rem] text-ink-soft hover:bg-surface print:hidden md:min-h-0 md:min-w-0 md:px-1"
                        aria-label={`Edit ${s.name}`}
                        title="Rename or deactivate"
                      >
                        Edit
                      </button>
                    </span>
                  </th>
                ))}
                <th className="border border-hairline bg-canvas px-3 py-2 text-left print:hidden">
                  {addingSize ? (
                    <span className="flex flex-wrap items-center gap-1">
                      <input
                        className="field w-28"
                        placeholder="Size name"
                        value={newSizeName}
                        onChange={(e) => setNewSizeName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") addSizeInline();
                          if (e.key === "Escape") {
                            setAddingSize(false);
                            setNewSizeName("");
                          }
                        }}
                      />
                      <Button
                        variant="primary"
                        className="min-h-[40px] px-2 py-1 text-[0.78rem] md:min-h-0"
                        disabled={savingSize || !newSizeName.trim()}
                        onClick={addSizeInline}
                      >
                        Add
                      </Button>
                      <Button
                        variant="ghost"
                        className="min-h-[40px] min-w-[40px] px-2 py-1 text-[0.78rem] md:min-h-0 md:min-w-0"
                        onClick={() => {
                          setAddingSize(false);
                          setNewSizeName("");
                        }}
                      >
                        ×
                      </Button>
                    </span>
                  ) : (
                    <button
                      onClick={() => setAddingSize(true)}
                      disabled={isNew}
                      title={
                        isNew
                          ? "Save the cost sheet first, then add sizes."
                          : undefined
                      }
                      className="min-h-[40px] rounded-lg border border-hairline px-2.5 py-1 text-[0.8rem] font-medium text-ink-soft hover:bg-surface disabled:opacity-40 disabled:hover:bg-transparent md:min-h-0"
                    >
                      + Add size
                    </button>
                  )}
                </th>
              </tr>
            </thead>
            <tbody>
              {sizes.length === 0 ? (
                <tr>
                  <td
                    colSpan={sizeColSpan}
                    className="border border-hairline px-3 py-6 text-center text-[0.9rem] text-ink-soft"
                  >
                    {isNew
                      ? "Save the cost sheet first, then add sizes to start entering consumption."
                      : "Add a size to start entering consumption."}
                  </td>
                </tr>
              ) : (
                FABRIC_CATEGORIES.map((cat) => (
                  <tr key={cat.type}>
                    <td className="border border-hairline px-3 py-1.5 font-medium text-ink">
                      {cat.title}
                      <span className="ml-1 text-[0.78rem] font-normal text-ink-soft">
                        ({fabricUnit[cat.type]})
                      </span>
                    </td>
                    {sizes.map((s) => (
                      <td key={s.id} className="border border-hairline p-0">
                        <input
                          type="number"
                          step="0.001"
                          className="w-full bg-transparent px-3 py-1.5 text-right outline-none focus:bg-canvas"
                          value={editValue(
                            fabricConsumption[cat.type][s.id] ?? 0,
                          )}
                          placeholder="0"
                          onChange={(e) =>
                            setFabricCell(
                              cat.type,
                              s.id,
                              numOrZero(e.target.value),
                            )
                          }
                        />
                      </td>
                    ))}
                    <td className="border border-hairline print:hidden" />
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        {sizes.length === 0 && !isNew ? (
          <p className="mt-3 text-[0.82rem] text-ink-soft">
            No sizes yet. Use “+ Add size” above to create one — it&apos;s
            scoped to this cost sheet only.
          </p>
        ) : null}
      </Card>

      {/* Value added items */}
      <Card className="mb-8 p-6 print-card">
        <SectionHeading
          title="Value added items"
          description="Product costs plus any one-off items, applied in order. Percent items compound on the running subtotal."
        />

        {/* Fetch from product */}
        <div className="mb-4 rounded-xl border border-hairline bg-canvas p-4 print:hidden">
          <p className="mb-2 text-[0.82rem] font-medium text-ink">
            Fetch from product
          </p>
          <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
            <label className="block w-full sm:w-auto">
              <span className="mb-1.5 block text-[0.78rem] text-ink-soft">
                Search
              </span>
              <input
                className="field w-full sm:w-48"
                value={productSearch}
                onChange={(e) => setProductSearch(e.target.value)}
                placeholder="Filter by name"
              />
            </label>
            <label className="block w-full sm:w-auto">
              <span className="mb-1.5 block text-[0.78rem] text-ink-soft">
                Product
              </span>
              <select
                className="field w-full sm:w-56"
                value={selectedProductId}
                onChange={(e) => setSelectedProductId(e.target.value)}
              >
                <option value="">
                  {products.length === 0
                    ? "No active products"
                    : "Select a product…"}
                </option>
                {filteredProducts.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
            <Button
              onClick={fetchFromProduct}
              className="min-h-[44px] w-full px-3 py-2 text-[0.85rem] sm:w-auto md:min-h-0"
              disabled={!selectedProductId}
            >
              Fetch Cutting / Stitching / Threading / Packing
            </Button>
          </div>
        </div>

        {/* Load from another sheet */}
        <div className="mb-5 rounded-xl border border-hairline bg-canvas p-4 print:hidden">
          <p className="mb-2 text-[0.82rem] font-medium text-ink">
            Load from another sheet
          </p>
          <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
            <label className="block w-full sm:w-auto">
              <span className="mb-1.5 block text-[0.78rem] text-ink-soft">
                Search
              </span>
              <input
                className="field w-full sm:w-48"
                value={sheetSearch}
                onChange={(e) => setSheetSearch(e.target.value)}
                placeholder="Serial or title"
              />
            </label>
            <label className="block w-full sm:w-auto">
              <span className="mb-1.5 block text-[0.78rem] text-ink-soft">
                Cost sheet
              </span>
              <select
                className="field w-full sm:w-64"
                value={loadFromSheetId}
                onChange={(e) => setLoadFromSheetId(e.target.value)}
              >
                <option value="">
                  {otherSheets.length === 0
                    ? "No other sheets"
                    : "Select a cost sheet…"}
                </option>
                {filteredSheets.map((s) => (
                  <option key={s.id} value={s.id}>
                    {serial(s.serial_number)} · {s.title || "Untitled"}
                  </option>
                ))}
              </select>
            </label>
            <Button
              onClick={loadItemsFromSheet}
              className="min-h-[44px] w-full px-3 py-2 text-[0.85rem] sm:w-auto md:min-h-0"
              disabled={!loadFromSheetId || loadingItems}
            >
              {loadingItems ? "Loading…" : "Load its value added items"}
            </Button>
          </div>
        </div>

        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-[0.95rem] font-semibold text-ink">Items</h3>
          <Button
            onClick={addItemRow}
            className="min-h-[40px] px-3 py-1.5 text-[0.85rem] print:hidden md:min-h-0"
          >
            Add row
          </Button>
        </div>

        {items.length === 0 ? (
          <p className="rounded-xl border border-dashed border-hairline px-4 py-6 text-center text-[0.9rem] text-ink-soft">
            No value added items yet. Fetch from a product, load from another
            sheet, or add a row.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-[0.92rem]">
              <thead>
                <tr className="border-b border-hairline text-[0.78rem] font-medium text-ink-soft">
                  <th className="py-2 pr-2 font-medium print:hidden">Order</th>
                  <th className="py-2 pr-3 font-medium">Name</th>
                  <th className="py-2 pr-3 font-medium">Unit</th>
                  <th className="py-2 pr-3 font-medium print:hidden">
                    Varies by size?
                  </th>
                  <th className="py-2 pr-3 text-right font-medium">Rate</th>
                  <th className="py-2 pr-3 font-medium">Source</th>
                  <th className="py-2 print:hidden" />
                </tr>
              </thead>
              <tbody>
                {items.map((it, index) => (
                  <tr
                    key={it.id}
                    className="border-b border-hairline last:border-0"
                  >
                    <td className="py-2 pr-2 print:hidden">
                      <div className="flex gap-1">
                        <button
                          onClick={() => moveItem(index, -1)}
                          disabled={index === 0}
                          className="flex min-h-[40px] min-w-[40px] items-center justify-center rounded border border-hairline text-ink-soft hover:bg-canvas disabled:opacity-30 md:min-h-0 md:min-w-0 md:px-1.5"
                          aria-label="Move up"
                        >
                          ↑
                        </button>
                        <button
                          onClick={() => moveItem(index, 1)}
                          disabled={index === items.length - 1}
                          className="flex min-h-[40px] min-w-[40px] items-center justify-center rounded border border-hairline text-ink-soft hover:bg-canvas disabled:opacity-30 md:min-h-0 md:min-w-0 md:px-1.5"
                          aria-label="Move down"
                        >
                          ↓
                        </button>
                      </div>
                    </td>
                    <td className="py-2 pr-3">
                      <input
                        className="field"
                        value={it.name}
                        onChange={(e) =>
                          updateItem(it.id, "name", e.target.value)
                        }
                        placeholder="Item name"
                      />
                    </td>
                    <td className="py-2 pr-3">
                      <select
                        className="field max-w-[9rem]"
                        value={
                          isPercentUnit(it.unit)
                            ? "percent"
                            : it.unit || "per unit"
                        }
                        onChange={(e) =>
                          updateItem(it.id, "unit", e.target.value)
                        }
                      >
                        <option value="per unit">per unit</option>
                        <option value="percent">percent</option>
                        {!["per unit", "percent"].includes(it.unit) &&
                        it.unit ? (
                          <option value={it.unit}>{it.unit}</option>
                        ) : null}
                      </select>
                    </td>
                    <td className="py-2 pr-3 print:hidden">
                      <label className="flex min-h-[40px] items-center gap-1.5 text-[0.82rem] text-ink-soft md:min-h-0">
                        <input
                          type="checkbox"
                          checked={it.varies_by_size}
                          onChange={() => toggleItemVariesBySize(it.id)}
                        />
                        Per size
                      </label>
                    </td>
                    <td className="py-2 pr-3">
                      {!it.varies_by_size ? (
                        <input
                          type="number"
                          step="0.01"
                          className="field max-w-[8rem] text-right"
                          value={editValue(it.rate)}
                          placeholder="0"
                          onChange={(e) =>
                            updateItem(it.id, "rate", numOrZero(e.target.value))
                          }
                        />
                      ) : (
                        <div className="flex min-w-[240px] flex-col gap-1.5">
                          {sizes.map((s) => (
                            <div key={s.id} className="flex items-center gap-1.5">
                              <span
                                className="w-16 shrink-0 truncate text-[0.72rem] text-ink-soft"
                                title={s.name}
                              >
                                {s.name}
                              </span>
                              <input
                                type="number"
                                step="0.01"
                                className="field max-w-[6rem] text-right"
                                value={editValue(it.sizeRates[s.id] ?? 0)}
                                placeholder="0"
                                onChange={(e) =>
                                  setItemSizeRate(
                                    it.id,
                                    s.id,
                                    numOrZero(e.target.value),
                                  )
                                }
                              />
                              <select
                                className="field max-w-[8rem] text-[0.72rem] print:hidden"
                                value=""
                                onChange={(e) => {
                                  const v = e.target.value;
                                  if (v) copyItemSizeRate(it.id, s.id, v);
                                  e.target.value = "";
                                }}
                              >
                                <option value="">Copy to…</option>
                                <option value="all">All other sizes</option>
                                {sizes
                                  .filter((o) => o.id !== s.id)
                                  .map((o) => (
                                    <option key={o.id} value={o.id}>
                                      {o.name}
                                    </option>
                                  ))}
                              </select>
                            </div>
                          ))}
                        </div>
                      )}
                    </td>
                    <td className="py-2 pr-3 text-[0.82rem] text-ink-soft">
                      {it.source_item_id ? "Product" : "One-off"}
                    </td>
                    <td className="py-2 text-right print:hidden">
                      <button
                        onClick={() => removeItem(it.id)}
                        className="min-h-[40px] rounded-lg border border-hairline px-2.5 py-1.5 text-[0.82rem] text-ink-soft hover:bg-canvas md:min-h-0"
                      >
                        Remove
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Live cost summary */}
      <Card className="mb-8 p-6 print-card">
        <SectionHeading
          title="Cost summary"
          description={`Live, per size. ${currencyNote}`}
        />
        {sizes.length === 0 ? (
          <p className="text-[0.9rem] text-ink-soft">Add sizes to see totals.</p>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
              {sizes.map((s, i) => (
                <div
                  key={s.id}
                  className="rounded-xl border border-hairline bg-canvas p-4"
                >
                  <p className="text-[0.82rem] font-medium text-ink-soft">
                    {s.name}
                  </p>
                  <p className="mt-1 text-[1.5rem] font-bold leading-tight text-ink">
                    {formatMoney(sizeCosts[i].totalDisplay, displayCurrency)}
                  </p>
                  {displayCurrency !== "PKR" ? (
                    <p className="text-[0.78rem] text-ink-soft">
                      {formatMoney(sizeCosts[i].totalPkr, "PKR")}
                    </p>
                  ) : null}
                </div>
              ))}
            </div>

            <div className="mt-6 overflow-x-auto">
              <table className="w-full border-collapse text-left text-[0.9rem]">
                <thead>
                  <tr className="border-b border-hairline text-[0.78rem] font-medium text-ink-soft">
                    <th className="py-2 pr-3 font-medium">Line</th>
                    {sizes.map((s) => (
                      <th
                        key={s.id}
                        className="py-2 pr-3 text-right font-medium"
                      >
                        {s.name}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b border-hairline">
                    <td className="py-1.5 pr-3 text-ink-soft">
                      Imported fabric — {formatMoney(categoryTotal.imported, "PKR")}
                      {" / "}
                      {fabricUnit.imported}
                    </td>
                    {sizeCosts.map((sc) => (
                      <td
                        key={sc.sizeId}
                        className="py-1.5 pr-3 text-right tabular-nums"
                      >
                        {formatMoney(sc.importedCost, "PKR")}
                      </td>
                    ))}
                  </tr>
                  <tr className="border-b border-hairline">
                    <td className="py-1.5 pr-3 text-ink-soft">
                      Local fabric — {formatMoney(categoryTotal.local, "PKR")}
                      {" / "}
                      {fabricUnit.local}
                    </td>
                    {sizeCosts.map((sc) => (
                      <td
                        key={sc.sizeId}
                        className="py-1.5 pr-3 text-right tabular-nums"
                      >
                        {formatMoney(sc.localCost, "PKR")}
                      </td>
                    ))}
                  </tr>
                  <tr className="border-b border-hairline font-medium">
                    <td className="py-1.5 pr-3">Fabric subtotal</td>
                    {sizeCosts.map((sc) => (
                      <td
                        key={sc.sizeId}
                        className="py-1.5 pr-3 text-right tabular-nums"
                      >
                        {formatMoney(sc.materialCost, "PKR")}
                      </td>
                    ))}
                  </tr>
                  {items.map((it, index) => (
                    <tr key={it.id} className="border-b border-hairline">
                      <td className="py-1.5 pr-3 text-ink-soft">
                        {(it.name || "Untitled item") +
                          (isPercentUnit(it.unit)
                            ? it.varies_by_size
                              ? " (% varies by size)"
                              : ` (${formatNumber(it.rate, 2)}%)`
                            : "")}
                      </td>
                      {sizeCosts.map((sc) => (
                        <td
                          key={sc.sizeId}
                          className="py-1.5 pr-3 text-right tabular-nums"
                        >
                          {formatMoney(
                            sc.itemContributions[index]?.amount ?? 0,
                            "PKR",
                          )}
                        </td>
                      ))}
                    </tr>
                  ))}
                  <tr className="font-semibold text-ink">
                    <td className="py-2 pr-3">Total cost (PKR)</td>
                    {sizeCosts.map((sc) => (
                      <td
                        key={sc.sizeId}
                        className="py-2 pr-3 text-right tabular-nums"
                      >
                        {formatMoney(sc.totalPkr, "PKR")}
                      </td>
                    ))}
                  </tr>
                  {displayCurrency !== "PKR" ? (
                    <tr className="font-semibold text-ink">
                      <td className="py-2 pr-3">
                        Total cost ({displayCurrency})
                      </td>
                      {sizeCosts.map((sc) => (
                        <td
                          key={sc.sizeId}
                          className="py-2 pr-3 text-right tabular-nums"
                        >
                          {formatMoney(sc.totalDisplay, displayCurrency)}
                        </td>
                      ))}
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </>
        )}
      </Card>

      {/* Actions */}
      <div className="sticky bottom-20 -mx-4 border-t border-hairline bg-canvas/95 px-4 py-4 backdrop-blur print:hidden sm:-mx-6 sm:px-6 md:bottom-0 md:-mx-8 md:px-8">
        <div className="flex flex-wrap items-center gap-3">
          <Button
            variant="primary"
            disabled={saving}
            onClick={() => handleSave()}
          >
            {saving ? "Saving…" : isNew ? "Create cost sheet" : "Save"}
          </Button>

          {!isNew && status === "draft" ? (
            <Button disabled={saving} onClick={() => handleSave("archived")}>
              Archive
            </Button>
          ) : null}

          {!isNew && status === "archived" ? (
            <Button disabled={saving} onClick={() => handleSave("draft")}>
              Restore to draft
            </Button>
          ) : null}

          {!isNew && status === "draft" ? (
            confirmingDelete ? (
              <div className="flex items-center gap-2">
                <span className="text-[0.88rem] text-ink-soft">
                  Delete this cost sheet?
                </span>
                <Button
                  variant="danger"
                  disabled={saving}
                  onClick={handleDelete}
                >
                  Yes, delete
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => setConfirmingDelete(false)}
                >
                  Cancel
                </Button>
              </div>
            ) : (
              <Button
                variant="danger"
                onClick={() => setConfirmingDelete(true)}
              >
                Delete
              </Button>
            )
          ) : null}

          <span className="ml-auto text-[0.82rem] text-ink-soft">
            {isNew
              ? "Not saved yet"
              : `${serial(serialNumber ?? 0)} · ${status}`}
          </span>
        </div>
      </div>
      </div>

      {!isNew ? <PrintLedger data={ledgerData} layout={printLayout} /> : null}
    </>
  );
}
