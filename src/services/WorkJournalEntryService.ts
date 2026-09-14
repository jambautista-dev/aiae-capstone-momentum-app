// STUB — replace with the generated Dataverse service once you've run
// `pa app add data-source` (see README step 3). Keep the method names and
// shapes identical (create / getall / update) so App.tsx doesn't need to change.
//
//   import { WorkJournalEntryService } from "./generated/services/WorkJournalEntryService";
//
// Until then, this persists to the browser's localStorage so you can run
// and demo the app immediately with `npm run dev`.

import type { WorkJournalEntry } from "./WorkJournalEntryModel";

const KEY = "momentum:entries";

function readAll(): WorkJournalEntry[] {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function writeAll(entries: WorkJournalEntry[]) {
  localStorage.setItem(KEY, JSON.stringify(entries));
}

export const WorkJournalEntryService = {
  async getall(): Promise<{ data: WorkJournalEntry[] }> {
    return { data: readAll() };
  },

  async create(record: WorkJournalEntry): Promise<{ data: WorkJournalEntry }> {
    const withId = { ...record, id: `${Date.now()}` };
    const all = readAll();
    writeAll([withId, ...all]);
    return { data: withId };
  },

  async update(
    id: string,
    changes: Partial<WorkJournalEntry>
  ): Promise<{ data: WorkJournalEntry }> {
    const all = readAll();
    const updated = all.map((e) => (e.id === id ? { ...e, ...changes } : e));
    writeAll(updated);
    return { data: updated.find((e) => e.id === id)! };
  },
};
