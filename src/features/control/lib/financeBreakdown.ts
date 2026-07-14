/**
 * Fixed categorical hues (validated: light-mode worst adjacent CVD ΔE 24.2,
 * ≥3:1 contrast). Assigned in a stable order so a category's color never
 * changes between different breakdown views. Only 8 slots exist for 10
 * possible categories — "Food & Drink" and "Misc / Other" (the two least
 * operationally distinct) always fold into the neutral "Other" bucket below
 * rather than claim a 9th/10th hue that would collide under color-vision
 * deficiency.
 */
const CATEGORY_COLORS: Record<string, string> = {
  "Fuel": "#2a78d6",
  "Tolls": "#1baf7a",
  "Parking": "#eda100",
  "Congestion/ULEZ/CAZ": "#008300",
  "Car Wash / Valet": "#4a3aa7",
  "Maintenance / Tyres": "#e34948",
  "Accommodation": "#e87ba4",
  "Public Transport": "#eb6834",
};

export const OTHER_COLOR = "#898781";
export const OTHER_LABEL = "Other";
const MAX_NAMED_SLICES = 5;

export function formatGbp(amount: number): string {
  return `£${amount.toFixed(2)}`;
}

export interface CategorySlice {
  category: string;
  amount: number;
  count: number;
  color: string;
}

/** Groups raw expense rows by category, one slice per category present. */
export function buildCategorySlices(rows: { category: string; amount: number }[]): CategorySlice[] {
  const map = new Map<string, { amount: number; count: number }>();
  for (const r of rows) {
    const key = r.category?.trim() || "Uncategorised";
    const entry = map.get(key) ?? { amount: 0, count: 0 };
    entry.amount += Number(r.amount) || 0;
    entry.count += 1;
    map.set(key, entry);
  }
  return Array.from(map, ([category, v]) => ({
    category,
    ...v,
    color: CATEGORY_COLORS[category] ?? OTHER_COLOR,
  })).sort((a, b) => b.amount - a.amount || b.count - a.count);
}

/**
 * Caps a breakdown at the "part-to-whole at a glance" limit (≤6 segments):
 * the top 5 named categories keep their own slice, everything else
 * (overflow past 5, plus any category without a dedicated hue) folds into
 * one "Other" slice so the total still reconciles exactly.
 */
export function capSlices(slices: CategorySlice[]): CategorySlice[] {
  const named = slices.filter((s) => CATEGORY_COLORS[s.category]);
  const unnamed = slices.filter((s) => !CATEGORY_COLORS[s.category]);

  const kept = named.slice(0, MAX_NAMED_SLICES);
  const overflow = [...named.slice(MAX_NAMED_SLICES), ...unnamed];

  if (overflow.length === 0) return kept;

  return [
    ...kept,
    {
      category: OTHER_LABEL,
      amount: overflow.reduce((sum, s) => sum + s.amount, 0),
      count: overflow.reduce((sum, s) => sum + s.count, 0),
      color: OTHER_COLOR,
    },
  ];
}
