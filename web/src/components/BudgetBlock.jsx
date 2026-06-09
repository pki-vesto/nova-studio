import { money } from "../lib/format.js";
import { computeBudget } from "../lib/budget.js";

// Budget breakdown used in the shopping list, proposal document and presentation.
export function BudgetBlock({ items, budgetLines, compact }) {
  const { rows, total } = computeBudget(items, budgetLines);
  return (
    <div>
      {rows.map((b) => (
        <div className="spec-row" key={b.cat} style={{ padding: compact ? "11px 0" : "16px 0" }}>
          <span className="k" style={{ fontSize: compact ? 12 : 13.5, color: "var(--ink-2)" }}>{b.cat}</span>
          <span className="v num" style={{ fontSize: compact ? 14 : 15.5 }}>{money(b.amount)}</span>
        </div>
      ))}
      <div className="row between" style={{ paddingTop: 22, marginTop: 6, borderTop: "2px solid var(--ink)" }}>
        <span className="serif" style={{ fontSize: compact ? 22 : 28 }}>Totaal investering</span>
        <span className="serif num" style={{ fontSize: compact ? 24 : 32, color: "var(--clay)" }}>{money(total)}</span>
      </div>
      <p className="caption" style={{ marginTop: 14, color: "var(--muted-2)" }}>
        Richtprijzen incl. begeleiding, excl. btw. Definitief na akkoord op de selectie.
      </p>
    </div>
  );
}
