import type { WorkJournalEntry } from "../services/WorkJournalEntryModel";

// Case-insensitive substring match against entry text or tags, AND'd with
// an OR-match against any currently active tag chips (no chips = no filter).
export function filterEntries(
  entries: WorkJournalEntry[],
  search: string,
  activeTags: string[]
): WorkJournalEntry[] {
  const query = search.trim().toLowerCase();
  return entries.filter((e) => {
    const matchesSearch =
      !query || e.entryText.toLowerCase().includes(query) || e.tags.toLowerCase().includes(query);
    const entryTags = e.tags ? e.tags.split(",") : [];
    const matchesTags = activeTags.length === 0 || activeTags.some((t) => entryTags.includes(t));
    return matchesSearch && matchesTags;
  });
}
