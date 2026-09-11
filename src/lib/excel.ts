import * as XLSX from "xlsx-js-style";
import {
  groupBlocksForUnified,
  type LedgerCategory,
  type LedgerData,
  type LedgerLayout,
  type LedgerSizeBlock,
  type LedgerSizeGroup,
} from "./ledger";

const round = (n: number) =>
  Math.round((Number.isFinite(n) ? n : 0) * 100) / 100;

const eur = (n: number) =>
  round(n).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

/* ---------- cell styles ---------- */

const THIN = { style: "thin", color: { rgb: "000000" } };
const BORDER = { top: THIN, bottom: THIN, left: THIN, right: THIN };
const YELLOW = { fgColor: { rgb: "FFF2B2" } };

const ST = {
  label: {
    font: { bold: true },
    border: BORDER,
    alignment: { vertical: "top", wrapText: true },
  },
  value: {
    border: BORDER,
    alignment: { horizontal: "right", vertical: "top" },
  },
  valueBold: {
    font: { bold: true },
    border: BORDER,
    alignment: { horizontal: "right", vertical: "top" },
  },
  valueYellow: {
    border: BORDER,
    fill: { patternType: "solid", ...YELLOW },
    alignment: { horizontal: "right", vertical: "top" },
  },
  valueYellowBold: {
    font: { bold: true },
    border: BORDER,
    fill: { patternType: "solid", ...YELLOW },
    alignment: { horizontal: "right", vertical: "top" },
  },
  title: {
    font: { bold: true },
    border: BORDER,
    alignment: { vertical: "top", wrapText: true },
  },
  header: {
    font: { bold: true, sz: 14.4 },
    border: BORDER,
    alignment: { horizontal: "center", vertical: "center", wrapText: true },
  },
} as const;

type Style = (typeof ST)[keyof typeof ST];

interface Cell {
  v: string | number;
  t: "s" | "n";
  s: Style;
}

/* ---------- one worksheet per size ---------- */

function buildSizeSheet(
  block: LedgerSizeBlock,
  categories: LedgerCategory[],
): XLSX.WorkSheet {
  const ws: Record<string, unknown> = {};
  const merges: { s: { r: number; c: number }; e: { r: number; c: number } }[] =
    [];
  let maxR = 0;
  const maxC = 7;

  const put = (
    r: number,
    c: number,
    v: string | number,
    s: Style,
    t: "s" | "n" = typeof v === "number" ? "n" : "s",
  ) => {
    const cell: Cell = { v, t, s };
    ws[XLSX.utils.encode_cell({ r, c })] = cell;
    if (r > maxR) maxR = r;
  };

  /* LEFT table — columns A / B */
  let r = 0;
  put(r, 0, "MANZA TEXTILE MILLS", ST.header, "s");
  put(r, 1, "", ST.header, "s");
  merges.push({ s: { r, c: 0 }, e: { r, c: 1 } });
  r += 1;

  put(r, 0, block.dateStr || "—", ST.label, "s");
  put(r, 1, block.sizeName, ST.value, "s");
  r += 1;

  put(r, 0, "ITEMS", ST.label, "s");
  put(r, 1, block.title, ST.title, "s");
  r += 1;

  for (const pair of block.fabricPairs) {
    const suffix = pair.label ? ` (${pair.label})` : "";
    put(r, 0, `CONSUMPTION${suffix}`, ST.label, "s");
    put(r, 1, round(pair.consumption), ST.valueYellow, "n");
    r += 1;
    put(r, 0, `FABRIC RATE${suffix}`, ST.label, "s");
    put(r, 1, round(pair.fabricRate), ST.value, "n");
    r += 1;
  }

  for (const item of block.items) {
    put(r, 0, item.name, ST.label, "s");
    put(r, 1, round(item.value), ST.value, "n");
    r += 1;
  }

  put(r, 0, `TOTAL (${block.displayCurrency})`, ST.label, "s");
  put(r, 1, round(block.totalDisplay), ST.valueBold, "n");
  r += 1;

  put(r, 0, `EURO. ${round(block.eurRate)}`, ST.label, "s");
  put(r, 1, `€ ${eur(block.totalEur)}`, ST.value, "s");
  r += 1;

  /* RIGHT tables — one per used category, columns D/E then G/H */
  categories.forEach((cat, idx) => {
    const cl = 3 + idx * 3;
    const cv = cl + 1;
    let rr = 0;
    put(rr, cl, `COSTING OF ${cat.label} FABRIC PER ${cat.unit}`, ST.header, "s");
    put(rr, cv, "", ST.header, "s");
    merges.push({ s: { r: rr, c: cl }, e: { r: rr, c: cv } });
    rr += 1;

    for (const comp of cat.components) {
      put(rr, cl, comp.name, ST.label, "s");
      put(rr, cv, round(comp.rate), ST.value, "n");
      rr += 1;
    }

    put(rr, cl, `TOTAL COST PER ${cat.unit}`, ST.label, "s");
    put(rr, cv, round(cat.totalPerUnit), ST.valueYellowBold, "n");
    rr += 1;
  });

  ws["!ref"] = XLSX.utils.encode_range({
    s: { r: 0, c: 0 },
    e: { r: maxR, c: maxC },
  });
  ws["!merges"] = merges;
  ws["!cols"] = [
    { wch: 26 },
    { wch: 16 },
    { wch: 3 },
    { wch: 30 },
    { wch: 16 },
    { wch: 3 },
    { wch: 30 },
    { wch: 16 },
  ];
  return ws as XLSX.WorkSheet;
}

/* ---------- unified worksheet — sizes as columns, one group per tab ---------- */

function buildUnifiedSheet(
  group: LedgerSizeGroup,
  categories: LedgerCategory[],
): XLSX.WorkSheet {
  const ws: Record<string, unknown> = {};
  const merges: { s: { r: number; c: number }; e: { r: number; c: number } }[] =
    [];
  let maxR = 0;
  let maxC = 1;

  const put = (
    r: number,
    c: number,
    v: string | number,
    s: Style,
    t: "s" | "n" = typeof v === "number" ? "n" : "s",
  ) => {
    const cell: Cell = { v, t, s };
    ws[XLSX.utils.encode_cell({ r, c })] = cell;
    if (r > maxR) maxR = r;
    if (c > maxC) maxC = c;
  };

  const lastCol = group.blocks.length; // col 0 = row label, 1..lastCol = sizes
  let topRows = 0;

  /* Shared fabric build-up tables — shown once, on the first group's tab only */
  if (group.isFirst && categories.length > 0) {
    categories.forEach((cat, idx) => {
      const cl = idx * 3; // 0 -> A/B, 1 -> D/E
      const cv = cl + 1;
      let rr = 0;
      put(
        rr,
        cl,
        `COSTING OF ${cat.label} FABRIC PER ${cat.unit}`,
        ST.header,
        "s",
      );
      put(rr, cv, "", ST.header, "s");
      merges.push({ s: { r: rr, c: cl }, e: { r: rr, c: cv } });
      rr += 1;

      for (const comp of cat.components) {
        put(rr, cl, comp.name, ST.label, "s");
        put(rr, cv, round(comp.rate), ST.value, "n");
        rr += 1;
      }

      put(rr, cl, `TOTAL COST PER ${cat.unit}`, ST.label, "s");
      put(rr, cv, round(cat.totalPerUnit), ST.valueYellowBold, "n");
      rr += 1;

      topRows = Math.max(topRows, rr);
    });
  }

  let r = topRows > 0 ? topRows + 1 : 0;
  const first = group.blocks[0];

  put(r, 0, "MANZA TEXTILE MILLS", ST.header, "s");
  for (let c = 1; c <= lastCol; c++) put(r, c, "", ST.header, "s");
  if (lastCol > 0) merges.push({ s: { r, c: 0 }, e: { r, c: lastCol } });
  r += 1;

  put(r, 0, first.dateStr || "—", ST.label, "s");
  group.blocks.forEach((b, i) => put(r, i + 1, b.sizeName, ST.valueBold, "s"));
  r += 1;

  put(r, 0, "ITEMS", ST.label, "s");
  put(r, 1, first.title, ST.title, "s");
  for (let c = 2; c <= lastCol; c++) put(r, c, "", ST.title, "s");
  if (lastCol > 1) merges.push({ s: { r, c: 1 }, e: { r, c: lastCol } });
  r += 1;

  const rowCount = Math.max(...group.blocks.map((b) => b.fabricPairs.length));
  for (let pi = 0; pi < rowCount; pi++) {
    const suffix = first.fabricPairs[pi]?.label
      ? ` (${first.fabricPairs[pi].label})`
      : "";
    put(r, 0, `CONSUMPTION${suffix}`, ST.label, "s");
    group.blocks.forEach((b, i) =>
      put(r, i + 1, round(b.fabricPairs[pi]?.consumption ?? 0), ST.valueYellow, "n"),
    );
    r += 1;
    put(r, 0, `FABRIC RATE${suffix}`, ST.label, "s");
    group.blocks.forEach((b, i) =>
      put(r, i + 1, round(b.fabricPairs[pi]?.fabricRate ?? 0), ST.value, "n"),
    );
    r += 1;
  }

  const itemCount = Math.max(...group.blocks.map((b) => b.items.length));
  for (let ii = 0; ii < itemCount; ii++) {
    put(r, 0, first.items[ii]?.name ?? "", ST.label, "s");
    group.blocks.forEach((b, i) =>
      put(r, i + 1, round(b.items[ii]?.value ?? 0), ST.value, "n"),
    );
    r += 1;
  }

  put(r, 0, `TOTAL (${first.displayCurrency})`, ST.label, "s");
  group.blocks.forEach((b, i) =>
    put(r, i + 1, round(b.totalDisplay), ST.valueBold, "n"),
  );
  r += 1;

  put(r, 0, `EURO. ${round(first.eurRate)}`, ST.label, "s");
  group.blocks.forEach((b, i) =>
    put(r, i + 1, `€ ${eur(b.totalEur)}`, ST.value, "s"),
  );
  r += 1;

  ws["!ref"] = XLSX.utils.encode_range({
    s: { r: 0, c: 0 },
    e: { r: maxR, c: maxC },
  });
  ws["!merges"] = merges;
  ws["!cols"] = Array.from({ length: maxC + 1 }, (_, i) =>
    i === 0 ? { wch: 26 } : { wch: 16 },
  );
  return ws as XLSX.WorkSheet;
}

function safeSheetName(name: string, used: Set<string>): string {
  let base =
    (name || "Size").replace(/[[\]:*?/\\]/g, " ").replace(/\s+/g, " ").trim() ||
    "Size";
  base = base.slice(0, 31);
  let candidate = base;
  let n = 2;
  while (used.has(candidate.toLowerCase())) {
    candidate = `${base.slice(0, 28)} ${n}`;
    n += 1;
  }
  used.add(candidate.toLowerCase());
  return candidate;
}

export interface ExcelInput {
  serialNumber: number | null;
  title: string;
  ledger: LedgerData;
  layout: LedgerLayout;
}

export function downloadSheetExcel(input: ExcelInput): void {
  const wb = XLSX.utils.book_new();
  const used = new Set<string>();

  if (input.ledger.blocks.length === 0) {
    const ws = XLSX.utils.aoa_to_sheet([["No active sizes on this cost sheet."]]);
    XLSX.utils.book_append_sheet(wb, ws, "Cost sheet");
  } else if (input.layout === "unified") {
    const groups = groupBlocksForUnified(input.ledger.blocks);
    for (const group of groups) {
      const ws = buildUnifiedSheet(group, input.ledger.categories);
      const name = groups.length > 1 ? group.label : "Cost sheet";
      XLSX.utils.book_append_sheet(wb, ws, safeSheetName(name, used));
    }
  } else {
    for (const block of input.ledger.blocks) {
      const ws = buildSizeSheet(block, input.ledger.categories);
      XLSX.utils.book_append_sheet(
        wb,
        ws,
        safeSheetName(block.sizeName, used),
      );
    }
  }

  const serialTag = input.serialNumber
    ? `#${String(input.serialNumber).padStart(4, "0")} `
    : "";
  const base = `${serialTag}${input.title || "cost-sheet"}`
    .replace(/[^\w\-# ]+/g, "")
    .replace(/\s+/g, " ")
    .trim();
  XLSX.writeFile(wb, `${base || "cost-sheet"}.xlsx`);
}
