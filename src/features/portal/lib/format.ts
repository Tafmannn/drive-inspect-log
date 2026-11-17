export function fmtGbp(n: number | null | undefined): string {
  return typeof n === "number"
    ? `£${n.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    : "—";
}

export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? "—"
    : d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

export function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? "—"
    : d.toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

/** "Today", "Tomorrow", "Mon 18 Nov" — for scheduled dates (YYYY-MM-DD). */
export function fmtDay(day: string | null | undefined, today: Date = new Date()): string {
  if (!day) return "—";
  const d = new Date(`${day.slice(0, 10)}T12:00:00`);
  if (Number.isNaN(d.getTime())) return "—";
  const t = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 12);
  const diff = Math.round((d.getTime() - t.getTime()) / 86_400_000);
  if (diff === 0) return "Today";
  if (diff === 1) return "Tomorrow";
  if (diff === -1) return "Yesterday";
  // Some engines add a comma after the weekday when the year is shown;
  // strip it so every date reads the same ("Tue 5 Jan 2027").
  return d
    .toLocaleDateString("en-GB", {
      weekday: "short",
      day: "numeric",
      month: "short",
      ...(d.getFullYear() !== today.getFullYear() ? { year: "numeric" } : {}),
    })
    .replace(",", "");
}
