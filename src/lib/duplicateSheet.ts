import { supabase } from "./supabase";

/**
 * Deep-copies a cost sheet into a new draft (new serial number) and returns the
 * new sheet's id. Copies both fabric cost build-ups (imported + local), their
 * reference units, the fabric consumption grid and every value-add item. Title
 * gets " (Copy)" appended; everything else carries over verbatim.
 */
export async function duplicateSheet(sourceId: string): Promise<string> {
  const [sheetRes, rmRes, fabConsRes, itemRes, sizeRes] = await Promise.all([
    supabase.from("cost_sheets").select("*").eq("id", sourceId).single(),
    supabase
      .from("cost_sheet_raw_materials")
      .select("*")
      .eq("cost_sheet_id", sourceId)
      .order("sort_order", { ascending: true }),
    supabase
      .from("cost_sheet_fabric_consumption")
      .select("*")
      .eq("cost_sheet_id", sourceId),
    supabase
      .from("cost_sheet_items")
      .select("*")
      .eq("cost_sheet_id", sourceId)
      .order("sort_order", { ascending: true }),
    supabase
      .from("sizes")
      .select("*")
      .eq("cost_sheet_id", sourceId)
      .order("sort_order", { ascending: true }),
  ]);

  if (sheetRes.error || !sheetRes.data) {
    throw sheetRes.error ?? new Error("Source cost sheet not found.");
  }
  const src = sheetRes.data;

  const { data: created, error: insErr } = await supabase
    .from("cost_sheets")
    .insert({
      title: `${src.title || "Untitled cost sheet"} (Copy)`,
      customer_name: src.customer_name,
      order_ref: src.order_ref,
      display_currency: src.display_currency,
      notes: src.notes,
      imported_fabric_unit: src.imported_fabric_unit ?? "meter",
      local_fabric_unit: src.local_fabric_unit ?? "meter",
      status: "draft",
    })
    .select("id")
    .single();
  if (insErr || !created) {
    throw insErr ?? new Error("Could not create the copy.");
  }
  const newId = created.id as string;

  const sourceSizes = sizeRes.data ?? [];
  const oldToNewSizeId = new Map<string, string>();
  if (sourceSizes.length) {
    const sizeRows = sourceSizes.map((s) => ({
      cost_sheet_id: newId,
      name: s.name,
      sort_order: s.sort_order,
      is_active: s.is_active,
    }));
    const { data: insertedSizes, error: sizeInsErr } = await supabase
      .from("sizes")
      .insert(sizeRows)
      .select("id");
    if (sizeInsErr) throw sizeInsErr;

    // Rows come back in insertion order, so index i lines up 1:1 with
    // sourceSizes[i] — same pairing pattern used for items below.
    sourceSizes.forEach((s, i) => {
      oldToNewSizeId.set(s.id as string, insertedSizes![i].id as string);
    });
  }

  const rmRows = (rmRes.data ?? []).map((r, index) => ({
    cost_sheet_id: newId,
    name: r.name,
    rate: r.rate,
    sort_order: r.sort_order ?? index,
    fabric_type: r.fabric_type ?? "local",
  }));
  if (rmRows.length) {
    const { error } = await supabase
      .from("cost_sheet_raw_materials")
      .insert(rmRows);
    if (error) throw error;
  }

  const consRows = (fabConsRes.data ?? [])
    .map((c) => ({
      cost_sheet_id: newId,
      fabric_type: c.fabric_type,
      size_id: oldToNewSizeId.get(c.size_id as string),
      consumption: c.consumption,
    }))
    .filter(
      (c): c is { cost_sheet_id: string; fabric_type: string; size_id: string; consumption: number } =>
        Boolean(c.size_id),
    );
  if (consRows.length) {
    const { error } = await supabase
      .from("cost_sheet_fabric_consumption")
      .insert(consRows);
    if (error) throw error;
  }

  const sourceItems = itemRes.data ?? [];
  const itemRows = sourceItems.map((i, index) => ({
    cost_sheet_id: newId,
    source_item_id: i.source_item_id,
    name: i.name,
    unit: i.unit,
    rate: i.rate,
    sort_order: i.sort_order ?? index,
    varies_by_size: i.varies_by_size ?? false,
  }));
  if (itemRows.length) {
    const { data: insertedItems, error } = await supabase
      .from("cost_sheet_items")
      .insert(itemRows)
      .select("id");
    if (error) throw error;

    const variesIds = sourceItems
      .filter((i) => i.varies_by_size)
      .map((i) => i.id as string);
    if (variesIds.length && insertedItems) {
      const { data: sizeRates, error: sizeRateErr } = await supabase
        .from("cost_sheet_item_size_rates")
        .select("cost_sheet_item_id, size_id, rate")
        .in("cost_sheet_item_id", variesIds);
      if (sizeRateErr) throw sizeRateErr;

      // Rows come back in insertion order, so index i lines up 1:1 with
      // sourceItems[i] — build the old-id -> new-id map from that pairing.
      const oldToNewId = new Map<string, string>();
      sourceItems.forEach((src, i) => {
        oldToNewId.set(src.id as string, insertedItems[i].id as string);
      });

      const sizeRateRows = (sizeRates ?? [])
        .map((r) => ({
          cost_sheet_item_id: oldToNewId.get(r.cost_sheet_item_id as string),
          size_id: oldToNewSizeId.get(r.size_id as string),
          rate: r.rate,
        }))
        .filter(
          (r): r is { cost_sheet_item_id: string; size_id: string; rate: number } =>
            Boolean(r.cost_sheet_item_id) && Boolean(r.size_id),
        );
      if (sizeRateRows.length) {
        const { error: insErr } = await supabase
          .from("cost_sheet_item_size_rates")
          .insert(sizeRateRows);
        if (insErr) throw insErr;
      }
    }
  }

  return newId;
}
