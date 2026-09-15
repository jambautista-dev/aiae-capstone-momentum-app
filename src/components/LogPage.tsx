import { useState } from "react";
import type { WorkJournalEntry } from "../services/WorkJournalEntryModel";
import { EntryRow } from "./EntryRow";
import { filterEntries } from "../utils/filterEntries";
import { groupEntriesByDate } from "../utils/groupEntriesByDate";
import { entryDateLabel } from "../utils/dates";
import { QUICK_TAGS, TYPE_BODY, TYPE_SMALL } from "../constants";

const SANS_FONT = "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";

// Dedicated log view: search + tag filters, grouped by date (newest first).
export function LogPage({ entries }: { entries: WorkJournalEntry[] }) {
  const [search, setSearch] = useState("");
  const [activeTags, setActiveTags] = useState<string[]>([]);

  const toggleTag = (tag: string) => {
    setActiveTags((prev) => (prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]));
  };

  const filtered = filterEntries(entries, search, activeTags);
  const groups = groupEntriesByDate(filtered);

  return (
    <div>
      <input
        type="text"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search entries or tags…"
        style={{
          width: "100%",
          padding: "0.5rem 0.7rem",
          marginBottom: "0.6rem",
          border: "1px solid #E6E6E6",
          borderRadius: "4px",
          fontFamily: SANS_FONT,
          fontSize: TYPE_BODY,
        }}
      />
      <div style={{ display: "flex", flexWrap: "wrap", gap: "0.4rem", marginBottom: "1.25rem" }}>
        {QUICK_TAGS.map((tag) => {
          const active = activeTags.includes(tag);
          return (
            <button
              key={tag}
              onClick={() => toggleTag(tag)}
              style={{
                fontFamily: SANS_FONT,
                fontSize: TYPE_SMALL,
                padding: "0.25rem 0.6rem",
                borderRadius: "999px",
                border: `1px solid ${active ? "#0C62FB" : "#E6E6E6"}`,
                background: active ? "#0C62FB" : "transparent",
                color: active ? "#FFFFFF" : "#666666",
                cursor: "pointer",
              }}
            >
              {tag}
            </button>
          );
        })}
      </div>

      {filtered.length === 0 && (
        <p style={{ color: "#666666", fontStyle: "italic", fontSize: TYPE_SMALL }}>
          {entries.length === 0 ? "Nothing logged yet — write your first line under Compose." : "No entries match."}
        </p>
      )}

      {groups.map((g) => (
        <div key={g.dateKey} style={{ marginBottom: "1.5rem" }}>
          <div
            style={{
              display: "flex",
              alignItems: "baseline",
              justifyContent: "space-between",
              borderBottom: "1px solid #E6E6E6",
              paddingBottom: "0.3rem",
              marginBottom: "0.75rem",
            }}
          >
            <h3 style={{ fontFamily: SANS_FONT, fontSize: TYPE_SMALL, color: "#666666", letterSpacing: "0.03em", margin: 0 }}>
              {g.label}
            </h3>
            <span style={{ fontFamily: SANS_FONT, fontSize: TYPE_SMALL, color: "#666666" }}>
              {g.entries.length} {g.entries.length === 1 ? "entry" : "entries"}
            </span>
          </div>
          {g.entries.map((e) => (
            <div key={e.id} style={{ display: "flex", gap: "0.75rem", alignItems: "flex-start", marginBottom: "1.1rem" }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <EntryRow entry={e} truncate />
              </div>
              <div
                style={{
                  fontFamily: "ui-monospace, monospace",
                  fontSize: TYPE_SMALL,
                  color: "#666666",
                  whiteSpace: "nowrap",
                  flexShrink: 0,
                  paddingTop: "0.15rem",
                }}
              >
                {entryDateLabel(e)}
              </div>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
