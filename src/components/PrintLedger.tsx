import { Fragment } from "react";
import { formatNumber } from "@/lib/format";
import {
  groupBlocksForUnified,
  type LedgerData,
  type LedgerLayout,
} from "@/lib/ledger";

const num = (n: number, decimals = 2) => formatNumber(n, decimals);
const money2 = (n: number) =>
  (Number.isFinite(n) ? n : 0).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

function CategoryTable({ cat }: { cat: LedgerData["categories"][number] }) {
  return (
    <table className="lr">
      <tbody>
        <tr>
          <td className="hdr" colSpan={2}>
            COSTING OF {cat.label} FABRIC PER {cat.unit}
          </td>
        </tr>
        {cat.components.map((comp, ci) => (
          <tr key={ci}>
            <th>{comp.name}</th>
            <td className="v">{num(comp.rate)}</td>
          </tr>
        ))}
        <tr>
          <th className="b">TOTAL COST PER {cat.unit}</th>
          <td className="v b hl">{num(cat.totalPerUnit)}</td>
        </tr>
      </tbody>
    </table>
  );
}

/** Per-size layout's right-hand column — one or two category tables, stacked. */
function CategoryTablesStack({
  categories,
}: {
  categories: LedgerData["categories"];
}) {
  if (categories.length === 0) return null;
  return (
    <div className="lr-stack">
      {categories.map((cat) => (
        <CategoryTable cat={cat} key={cat.type} />
      ))}
    </div>
  );
}

/** Unified layout's shared header section — the two tables side by side, shown once. */
function CategoryTablesRow({
  categories,
}: {
  categories: LedgerData["categories"];
}) {
  if (categories.length === 0) return null;
  return (
    <div className="top-tables">
      {categories.map((cat) => (
        <CategoryTable cat={cat} key={cat.type} />
      ))}
    </div>
  );
}

/**
 * Legacy "MANZA TEXTILE MILLS" cost ledger — printed / exported view of a
 * cost sheet. Two layouts share the same computed data (`LedgerData`):
 *  - "unified": one table, sizes as columns, paginated past 5 sizes.
 *  - "per-size": one full block per size, page break between (the original
 *    format).
 * Rendered hidden on screen and visible only when printing — see the
 * `.print-ledger` rules in globals.css.
 */
export function PrintLedger({
  data,
  layout,
}: {
  data: LedgerData;
  layout: LedgerLayout;
}) {
  if (data.blocks.length === 0) return null;

  if (layout === "unified") {
    const groups = groupBlocksForUnified(data.blocks);
    return (
      <div className="print-ledger unified hidden print:block">
        {groups.map((group, gi) => {
          const first = group.blocks[0];
          const rowCount = Math.max(
            ...group.blocks.map((b) => b.fabricPairs.length),
          );
          const itemCount = Math.max(
            ...group.blocks.map((b) => b.items.length),
          );
          return (
            <div className="ledger-page" key={gi}>
              <table className="hdr-block">
                <tbody>
                  <tr>
                    <td className="hdr">MANZA TEXTILE MILLS</td>
                  </tr>
                </tbody>
              </table>

              {group.isFirst ? (
                <CategoryTablesRow categories={data.categories} />
              ) : null}

              <table className="unified-table">
                <tbody>
                  <tr>
                    <th>{first.dateStr || "—"}</th>
                    {group.blocks.map((b, bi) => (
                      <td className="v b szhdr" key={bi}>
                        {b.sizeName}
                      </td>
                    ))}
                  </tr>
                  <tr>
                    <th>ITEMS</th>
                    <td className="title" colSpan={group.blocks.length}>
                      {first.title}
                    </td>
                  </tr>

                  {Array.from({ length: rowCount }).map((_, pi) => (
                    <Fragment key={pi}>
                      <tr>
                        <th>
                          CONSUMPTION
                          {first.fabricPairs[pi]?.label
                            ? ` (${first.fabricPairs[pi].label})`
                            : ""}
                        </th>
                        {group.blocks.map((b, bi) => (
                          <td className="v hl" key={bi}>
                            {num(b.fabricPairs[pi]?.consumption ?? 0, 3)}
                          </td>
                        ))}
                      </tr>
                      <tr>
                        <th>
                          FABRIC RATE
                          {first.fabricPairs[pi]?.label
                            ? ` (${first.fabricPairs[pi].label})`
                            : ""}
                        </th>
                        {group.blocks.map((b, bi) => (
                          <td className="v" key={bi}>
                            {num(b.fabricPairs[pi]?.fabricRate ?? 0)}
                          </td>
                        ))}
                      </tr>
                    </Fragment>
                  ))}

                  {Array.from({ length: itemCount }).map((_, ii) => (
                    <tr key={ii}>
                      <th>{first.items[ii]?.name ?? ""}</th>
                      {group.blocks.map((b, bi) => (
                        <td className="v" key={bi}>
                          {num(b.items[ii]?.value ?? 0)}
                        </td>
                      ))}
                    </tr>
                  ))}

                  <tr>
                    <th className="b">TOTAL ({first.displayCurrency})</th>
                    {group.blocks.map((b, bi) => (
                      <td className="v b" key={bi}>
                        {num(b.totalDisplay)}
                      </td>
                    ))}
                  </tr>
                  <tr>
                    <th>EURO. {num(first.eurRate)}</th>
                    {group.blocks.map((b, bi) => (
                      <td className="v" key={bi}>
                        € {money2(b.totalEur)}
                      </td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <div className="print-ledger per-size hidden print:block">
      {data.blocks.map((block, bi) => (
        <div className="size-block" key={bi}>
          <div className="ledger-row">
            {/* LEFT — item breakdown */}
            <table className="ll">
              <tbody>
                <tr>
                  <td className="hdr" colSpan={2}>
                    MANZA TEXTILE MILLS
                  </td>
                </tr>
                <tr>
                  <th>{block.dateStr || "—"}</th>
                  <td className="v">{block.sizeName}</td>
                </tr>
                <tr>
                  <th>ITEMS</th>
                  <td className="title">{block.title}</td>
                </tr>

                {block.fabricPairs.map((pair, pi) => (
                  <Fragment key={pi}>
                    <tr>
                      <th>
                        CONSUMPTION
                        {pair.label ? ` (${pair.label})` : ""}
                      </th>
                      <td className="v hl">{num(pair.consumption, 3)}</td>
                    </tr>
                    <tr>
                      <th>
                        FABRIC RATE
                        {pair.label ? ` (${pair.label})` : ""}
                      </th>
                      <td className="v">{num(pair.fabricRate)}</td>
                    </tr>
                  </Fragment>
                ))}

                {block.items.map((item, ii) => (
                  <tr key={ii}>
                    <th>{item.name}</th>
                    <td className="v">{num(item.value)}</td>
                  </tr>
                ))}

                <tr>
                  <th className="b">TOTAL ({block.displayCurrency})</th>
                  <td className="v b">{num(block.totalDisplay)}</td>
                </tr>
                <tr>
                  <th>EURO. {num(block.eurRate)}</th>
                  <td className="v">€ {money2(block.totalEur)}</td>
                </tr>
              </tbody>
            </table>

            {/* RIGHT — fabric cost build-up, one table per used category */}
            <CategoryTablesStack categories={data.categories} />
          </div>
        </div>
      ))}
    </div>
  );
}
