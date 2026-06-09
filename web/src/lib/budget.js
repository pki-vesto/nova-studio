// Budget = product-category subtotals (from the selection) + manual service lines.
// Mirrors the design's budget block: categories, subtotals, total investment.
export function computeBudget(items, budgetLines = []) {
  const order = [];
  const map = new Map();
  for (const item of items || []) {
    const cat = item.category || "Overig";
    const line = Number(item.price || 0) * Number(item.quantity || 1);
    if (!map.has(cat)) { map.set(cat, 0); order.push(cat); }
    map.set(cat, map.get(cat) + line);
  }
  const rows = order.map((cat) => ({ cat, amount: map.get(cat) }));
  for (const extra of budgetLines || []) {
    rows.push({ cat: extra.cat, amount: Number(extra.amount || 0) });
  }
  const total = rows.reduce((sum, row) => sum + row.amount, 0);
  return { rows, total };
}
