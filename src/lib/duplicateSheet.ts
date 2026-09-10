import { supabase } from "./supabase";

/**
 * Deep-copies a cost sheet into a new draft (new serial number) and returns the
 * new sheet's id. Copies both fabric cost build-ups (imported + local), their
 * reference units, the fabric consumption grid and every value-add item. Title
 * gets " (Copy)" appended; everything else carries over verbatim.
 */
export async function duplicateSheet(sourceId: string): Promise<string> {
  const [sheetRes, rmRes, fabConsRes, itemRes] = await Promise.all([
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

  const consRows = (fabConsRes.data ?? []).map((c) => ({
    cost_sheet_id: newId,
    fabric_type: c.fabric_type,
    size_id: c.size_id,
    consumption: c.consumption,
  }));
  if (consRows.length) {
    const { error } = await supabase
      .from("cost_sheet_fabric_consumption")
      .insert(consRows);
    if (error) throw error;
  }

  const itemRows = (itemRes.data ?? []).map((i, index) => ({
    cost_sheet_id: newId,
    source_item_id: i.source_item_id,
    name: i.name,
    unit: i.unit,
    rate: i.rate,
    sort_order: i.sort_order ?? index,
  }));
  if (itemRows.length) {
    const { error } = await supabase.from("cost_sheet_items").insert(itemRows);
    if (error) throw error;
  }

  return newId;
}
