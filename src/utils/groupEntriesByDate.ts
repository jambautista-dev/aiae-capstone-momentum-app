import type { WorkJournalEntry } from "../services/WorkJournalEntryModel";
import { formatDate } from "./dates";

export type EntryGroup = {
  dateKey: string; // ISO startDate, for stable React keys
  label: string; // e.g. "Sep 11, 2026"
  entries: WorkJournalEntry[];
};

// Groups entries by their startDate (a multi-day range entry is grouped
// under its start date but still shows its full range on the row itself),
// newest group first.
export function groupEntriesByDate(entries: WorkJournalEntry[]): EntryGroup[] {
  const byDate = new Map<string, WorkJournalEntry[]>();
  for (const e of entries) {
    const list = byDate.get(e.startDate) ?? [];
    list.push(e);
    byDate.set(e.startDate, list);
  }
  return Array.from(byDate.entries())
    .sort(([a], [b]) => (a < b ? 1 : -1))
    .map(([dateKey, list]) => ({ dateKey, label: formatDate(dateKey), entries: list }));
}
