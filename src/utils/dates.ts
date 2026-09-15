import type { WorkJournalEntry } from "../services/WorkJournalEntryModel";

export function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

export function formatDate(iso: string): string {
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

export function entryDateLabel(e: WorkJournalEntry): string {
  return e.startDate === e.endDate
    ? formatDate(e.startDate)
    : `${formatDate(e.startDate)} – ${formatDate(e.endDate)}`;
}

// An entry is "in" a query range if the two intervals overlap at all —
// not just if the entry's start date falls inside it — so a week-long
// entry that only partially overlaps a selected quarter still counts.
export function entryOverlapsRange(e: WorkJournalEntry, queryStart: string, queryEnd: string): boolean {
  const startsBeforeQueryEnds = !queryEnd || e.startDate <= queryEnd;
  const endsAfterQueryStarts = !queryStart || e.endDate >= queryStart;
  return startsBeforeQueryEnds && endsAfterQueryStarts;
}
