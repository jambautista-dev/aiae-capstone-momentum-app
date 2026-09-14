// This mirrors the shape `pa app add data-source` will generate for your
// Dataverse table once it's connected (see README step 3-4). Field names
// here are placeholders — align them with your real generated model.

export type WorkJournalEntry = {
  id?: string; // Dataverse record GUID, absent until created
  startDate: string; // ISO date, e.g. "2026-09-14"
  endDate: string; // ISO date — equals startDate for a single-day entry
  entryText: string;
  tags: string; // comma-separated quick-tags
  reflection: string; // AI-generated one-liner, filled after save
};
