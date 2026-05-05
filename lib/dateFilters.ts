export type Period = "today" | "week" | "all";

// Returns the UTC ISO string for the start of the chosen period in PH time (UTC+8).
// Returns null for "all" (no date filter).
export function getPeriodFrom(period: Period): string | null {
  if (period === "all") return null;

  const PH_OFFSET_MS = 8 * 60 * 60 * 1000; // UTC+8

  // Shift now into PH clock
  const nowPH = new Date(Date.now() + PH_OFFSET_MS);

  // Zero out time to get PH midnight (stored as UTC hours on a shifted date)
  nowPH.setUTCHours(0, 0, 0, 0);

  // Shift PH midnight back to real UTC
  const midnightUTC = new Date(nowPH.getTime() - PH_OFFSET_MS);

  if (period === "today") return midnightUTC.toISOString();

  // "week" → find the Monday that started this week in PH
  const phDay = nowPH.getUTCDay(); // 0=Sun … 6=Sat
  const daysToMonday = phDay === 0 ? 6 : phDay - 1;
  const mondayUTC = new Date(midnightUTC.getTime() - daysToMonday * 86_400_000);
  return mondayUTC.toISOString();
}

export const PERIOD_OPTIONS: { value: Period; label: string }[] = [
  { value: "today", label: "Today" },
  { value: "week",  label: "This Week" },
  { value: "all",   label: "All Time" },
];
