import { Fragment } from "react";
import { formatNumber } from "@/lib/format";
import type { LedgerData } from "@/lib/ledger";

const num = (n: number, decimals = 2) => formatNumber(n, decimals);
const money2 = (n: number) =>
  (Number.isFinite(n) ? n : 0).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

/**
 * Legacy "MANZA TEXTILE MILLS" cost ledger, one block per active size.
 * Rendered hidden on screen and visible only when printing — see the
 * `.print-ledger` rules in globals.css.
 */
export function PrintLedger({ data }: { data: LedgerData }) {
  if (data.blocks.length === 0) return null;

  return (
    <div className="print-ledger hidden print:block">
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
                  <th className="b">TOTAL</th>
                  <td className="v b">{num(block.totalPkr)}</td>
                </tr>
                <tr>
                  <th>EURO. {num(block.eurRate)}</th>
                  <td className="v">€ {money2(block.totalEur)}</td>
                </tr>
              </tbody>
            </table>

            {/* RIGHT — fabric cost build-up, one table per used category */}
            {data.categories.length > 0 ? (
              <div className="lr-stack">
                {data.categories.map((cat) => (
                  <table className="lr" key={cat.type}>
                    <tbody>
                      <tr>
                        <td className="hdr" colSpan={2}>
                          COSTING OF {cat.label} FABRIC PER {cat.unit}
                        </td>
                      </tr>
                      {cat.components.map((comp, ci) => (
                        <tr key={ci}>
                          <th>{comp.name}</th>
                          <td className="v">
                            {comp.isPercent
                              ? `${num(comp.rate)}%`
                              : num(comp.rate)}
                          </td>
                        </tr>
                      ))}
                      <tr>
                        <th className="b">TOTAL COST PER {cat.unit}</th>
                        <td className="v b hl">{num(cat.totalPerUnit)}</td>
                      </tr>
                    </tbody>
                  </table>
                ))}
              </div>
            ) : null}
          </div>
        </div>
      ))}
    </div>
  );
}
