import { Sparkles, Target, GraduationCap, Users, Compass } from "lucide-react";
import type { WorkJournalEntry } from "../services/WorkJournalEntryModel";
import { TYPE_SMALL } from "../constants";

// Mirrors the sans font stack in App.tsx — see branding.instructions.md.
const SANS_FONT = "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";

const PILLAR_ICONS: Record<string, typeof Target> = {
  "Deliver Exceptionally": Target,
  "Grow Expertise": GraduationCap,
  "Grow Slalom": Users,
  Lead: Compass,
};

// Shared row rendering (pillar icon + entry text + tags + reflection), used
// by both the Compose view's inline log preview and the dedicated Log page.
// Callers are responsible for positioning the date around this row.
export function EntryRow({ entry, truncate = false }: { entry: WorkJournalEntry; truncate?: boolean }) {
  const PillarIcon = entry.pillar ? PILLAR_ICONS[entry.pillar] : undefined;
  return (
    <div style={{ display: "flex", gap: "0.85rem", marginBottom: "0.7rem" }}>
      <div
        style={{
          width: "26px",
          height: "26px",
          borderRadius: "50%",
          // Dashed and muted while unclassified, so it's visibly "pending"
          // rather than invisible, but still doesn't shift row layout later.
          border: PillarIcon ? "1px solid #0C62FB" : "1px dashed #666666",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
        }}
        title={entry.pillar || "Not yet classified"}
      >
        {PillarIcon && <PillarIcon size={14} color="#0C62FB" />}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p
          style={{
            margin: "0 0 0.25rem 0",
            lineHeight: 1.1,
            ...(truncate
              ? { whiteSpace: "nowrap" as const, overflow: "hidden", textOverflow: "ellipsis" }
              : {}),
          }}
        >
          {entry.entryText}
        </p>
        {entry.tags && (
          <div style={{ display: "flex", gap: "0.3rem", marginBottom: "0.25rem" }}>
            {entry.tags.split(",").map((t) => (
              <span key={t} style={{ fontFamily: SANS_FONT, fontSize: TYPE_SMALL, color: "#0C62FB" }}>
                {t}
              </span>
            ))}
          </div>
        )}
        {entry.reflection && (
          <p
            style={{
              fontFamily: SANS_FONT,
              fontSize: TYPE_SMALL,
              color: "#FF4D5F",
              margin: 0,
              display: "flex",
              alignItems: "flex-start",
              gap: "0.3rem",
            }}
          >
            <Sparkles size={13} style={{ marginTop: "0.15rem", flexShrink: 0 }} />
            {entry.reflection}
          </p>
        )}
      </div>
    </div>
  );
}
