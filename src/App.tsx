import { useState, useEffect, useCallback } from "react";
import { Feather, Copy, Check, Loader2, Sparkles, BookOpen, Target, GraduationCap, Users, Compass } from "lucide-react";
import { WorkJournalEntryService } from "./services/WorkJournalEntryService";
import type { WorkJournalEntry } from "./services/WorkJournalEntryModel";
import { LEVEL_LADDER, nextLevel, pillarSummary } from "./data/levelLadder";
import { TrendingUp } from "lucide-react";

// Swap the import above for the generated Dataverse service once connected —
// see README steps 3-4. No other code here needs to change if field names match.

const PILLARS = [
  "Deliver Exceptionally",
  "Grow Expertise",
  "Grow Slalom",
  "Lead",
];

const QUICK_TAGS = ["Client work", "Learning", "Collaboration", "Leadership"];

const PILLAR_ICONS: Record<string, typeof Target> = {
  "Deliver Exceptionally": Target,
  "Grow Expertise": GraduationCap,
  "Grow Slalom": Users,
  Lead: Compass,
};

// Slalom brand typography: Lora (approved secondary/supporting typeface) for
// serif/headline copy, with system serif fallbacks.
const SERIF_FONT = "'Lora', Georgia, serif";
// Stand-in for Slalom Sans (Slalom's primary, licensed typeface — not available
// in this project). Swap this stack for real Slalom Sans web font files once
// they're available; never substitute Avenir Next LT Pro, which is reserved
// for PowerPoint templates only.
const SANS_FONT = "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";

// Flip this on once alternative titles/tracks are supported and a picker is
// wanted again. Everything the picker needs (LEVEL_LADDER, currentLevel state,
// persistPromotion) is already wired up — this only hides the control.
const ENABLE_LEVEL_PICKER = false;

// Calls go through the local /api/ai/complete dev proxy (see vite.config.ts),
// which forwards to Azure OpenAI server-side, so no API key ships to the
// browser. For a production deployment, swap that proxy for a Power
// Automate flow or AI Builder connector — see README "AI proxy".
async function callAI(prompt: string, maxTokens = 500): Promise<string> {
  const response = await fetch("/api/ai/complete", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content: prompt, maxTokens }),
  });
  if (!response.ok) throw new Error("AI request failed");
  const data = await response.json();
  return data.content
    .filter((b: { type: string }) => b.type === "text")
    .map((b: { text: string }) => b.text)
    .join("\n")
    .trim();
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function formatDate(iso: string): string {
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

function entryDateLabel(e: WorkJournalEntry): string {
  return e.startDate === e.endDate
    ? formatDate(e.startDate)
    : `${formatDate(e.startDate)} – ${formatDate(e.endDate)}`;
}

// An entry is "in" a query range if the two intervals overlap at all —
// not just if the entry's start date falls inside it — so a week-long
// entry that only partially overlaps a selected quarter still counts.
function entryOverlapsRange(e: WorkJournalEntry, queryStart: string, queryEnd: string): boolean {
  const startsBeforeQueryEnds = !queryEnd || e.startDate <= queryEnd;
  const endsAfterQueryStarts = !queryStart || e.endDate >= queryStart;
  return startsBeforeQueryEnds && endsAfterQueryStarts;
}

export default function App() {
  const [entries, setEntries] = useState<WorkJournalEntry[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [draft, setDraft] = useState("");
  const [activeTags, setActiveTags] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [hoverSaveBtn, setHoverSaveBtn] = useState(false);
  const [entryIsRange, setEntryIsRange] = useState(false);
  const [entryStartDate, setEntryStartDate] = useState(todayISO());
  const [entryEndDate, setEntryEndDate] = useState(todayISO());

  const [rangeStart, setRangeStart] = useState("");
  const [rangeEnd, setRangeEnd] = useState(todayISO());
  const [generating, setGenerating] = useState(false);
  const [reflection, setReflection] = useState("");
  const [reflectionError, setReflectionError] = useState("");
  const [copied, setCopied] = useState(false);

  const [promotionMode, setPromotionMode] = useState(false);
  const [currentLevel, setCurrentLevel] = useState(LEVEL_LADDER[1].jobTitle); // defaults to Consultant
  const [coaching, setCoaching] = useState("");
  const [coachingError, setCoachingError] = useState("");
  const [coachingLoading, setCoachingLoading] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const result = await WorkJournalEntryService.getall();
        setEntries(result.data);
      } catch {
        // no entries yet
      }
      try {
        const raw = localStorage.getItem("momentum:promotion");
        if (raw) {
          const parsed = JSON.parse(raw);
          setPromotionMode(!!parsed.on);
          if (parsed.level) setCurrentLevel(parsed.level);
        }
      } catch {
        // use defaults
      }
      setLoaded(true);
    })();
  }, []);

  const persistPromotion = useCallback((on: boolean, level: string) => {
    setPromotionMode(on);
    setCurrentLevel(level);
    localStorage.setItem("momentum:promotion", JSON.stringify({ on, level }));
  }, []);

  const toggleTag = (tag: string) => {
    setActiveTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
    );
  };

  const saveEntry = async () => {
    if (!draft.trim()) return;
    setSaving(true);
    const start = entryIsRange ? entryStartDate : todayISO();
    const end = entryIsRange ? entryEndDate : todayISO();
    try {
      const { data: created } = await WorkJournalEntryService.create({
        startDate: start <= end ? start : end,
        endDate: start <= end ? end : start, // guard against a reversed range
        entryText: draft.trim(),
        tags: activeTags.join(","),
        reflection: "",
        pillar: "",
      });
      setEntries((prev) => [created, ...prev]);
      setDraft("");
      setActiveTags([]);
      setEntryIsRange(false);
      setEntryStartDate(todayISO());
      setEntryEndDate(todayISO());

      try {
        const response = await callAI(
          `A person logged this note about their work${
            created.startDate !== created.endDate ? ` covering ${created.startDate} to ${created.endDate}` : ""
          }: "${created.entryText}"${
            created.tags ? ` (tagged: ${created.tags})` : ""
          }.\n\nRespond with exactly these two labeled lines and nothing else:\nPILLAR: <the single one of these four that this entry most closely represents — ${PILLARS.join(", ")}>\nREFLECTION: <one short, specific, encouraging sentence naming the skill or behavior this entry demonstrates growth in>`,
          150
        );
        const pillarMatch = response.match(/PILLAR:\s*(.+)/i);
        const reflectionMatch = response.match(/REFLECTION:\s*(.+)/i);
        const parsedPillar = pillarMatch?.[1]?.trim() ?? "";
        const line = reflectionMatch?.[1]?.trim() ?? "";
        const pillar =
          PILLARS.find((p) => p.toLowerCase() === parsedPillar.toLowerCase()) ?? "";
        if (created.id) {
          await WorkJournalEntryService.update(created.id, { reflection: line, pillar });
          setEntries((prev) =>
            prev.map((e) => (e.id === created.id ? { ...e, reflection: line, pillar } : e))
          );
        }
      } catch {
        if (created.id) {
          setEntries((prev) =>
            prev.map((e) =>
              e.id === created.id
                ? { ...e, reflection: "(reflection unavailable right now)" }
                : e
            )
          );
        }
      }
    } finally {
      setSaving(false);
    }
  };

  const buildPromotionSection = (next: ReturnType<typeof nextLevel>) => {
    if (!next) return "";
    return `\n\nThe person has Promotion Focus Mode on: they are a ${currentLevel} aiming for ${next.jobTitle}. For EACH pillar, after the regular bullet points, add two extra lines grounded only in the entries above:\n"Already showing up at ${next.jobTitle}: ..." — cite specific entries that match the ${next.jobTitle} standard below for that pillar, or write "No clear evidence yet" if none qualify.\n"Where the case is still thin: ..." — name what's missing relative to the standard, framed as a concrete next step, not vague advice like "network more."\nDo not fabricate accomplishments or metrics not present in the entries.\n\n${next.jobTitle} standards by pillar:\n${PILLARS.map((p) => `\n${p}:\n${pillarSummary(next, p)}`).join("\n")}`;
  };

  const generateReflection = async () => {
    setReflectionError("");
    setReflection("");
    const inRange = entries.filter((e) => entryOverlapsRange(e, rangeStart, rangeEnd));
    if (inRange.length === 0) {
      setReflectionError("No entries in that range yet — log a few days first.");
      return;
    }
    setGenerating(true);
    try {
      const entryList = inRange
        .slice()
        .reverse()
        .map(
          (e) =>
            `- [${e.startDate === e.endDate ? e.startDate : `${e.startDate} to ${e.endDate}`}] ${e.entryText}${e.tags ? ` (${e.tags})` : ""}`
        )
        .join("\n");
      // Automatic path: promotion coaching folds into the quarterly reflection
      // whenever the mode is on — no extra click needed here (per spec: coaching
      // is automatic at reflection time, and separately available on-demand below).
      const promotionSection = promotionMode
        ? buildPromotionSection(nextLevel(currentLevel))
        : "";

      const prompt = `Here are a person's daily work log entries from ${
        rangeStart || "the start"
      } to ${rangeEnd}:\n\n${entryList}\n\nDraft a quarterly self-reflection organized under these pillars: ${PILLARS.join(", ")}. For each pillar, write 1-3 bullet points using an Action → Impact → Growth structure, grounded ONLY in specifics actually present in the entries above — do not invent details, metrics, or outcomes that aren't there. If a pillar has no supporting entries, write a single line noting that briefly instead of forcing content. Keep the tone professional and concise. Output plain text with a heading per pillar, no markdown asterisks.${promotionSection}`;
      const text = await callAI(prompt, promotionMode ? 1400 : 900);
      setReflection(text);
    } catch {
      setReflectionError("Something went wrong generating the draft. Try again.");
    } finally {
      setGenerating(false);
    }
  };

  // On-demand path: coaching whenever the user wants it, independent of the
  // quarterly cycle. Uses all logged entries to date rather than a date range,
  // since the point is "how am I tracking right now," not a formal reflection.
  const getCoachingNow = async () => {
    setCoachingError("");
    setCoaching("");
    if (entries.length === 0) {
      setCoachingError("Log a few entries first — there's nothing to coach against yet.");
      return;
    }
    const next = nextLevel(currentLevel);
    if (!next) {
      setCoachingError("No next level configured above your current level.");
      return;
    }
    setCoachingLoading(true);
    try {
      const entryList = entries
        .slice()
        .reverse()
        .map(
          (e) =>
            `- [${e.startDate === e.endDate ? e.startDate : `${e.startDate} to ${e.endDate}`}] ${e.entryText}${e.tags ? ` (${e.tags})` : ""}`
        )
        .join("\n");
      const prompt = `Here are a person's daily work log entries so far:\n\n${entryList}\n\nThe person is a ${currentLevel} aiming for ${next.jobTitle}. Give a short, direct coaching note (not a full reflection) with two parts:\n1. "Already showing up at ${next.jobTitle}": 1-2 sentences citing specific entries that match the standard, or say there's no clear evidence yet.\n2. "Strongest next move": one concrete, specific action grounded in a gap you can see in the standards below versus what's logged — not generic career advice.\nBase this ONLY on the pillars with the clearest signal in the entries; you don't need to cover all four. Ground everything strictly in the entries — do not invent accomplishments.\n\n${next.jobTitle} standards by pillar:\n${PILLARS.map((p) => `\n${p}:\n${pillarSummary(next, p)}`).join("\n")}`;
      const text = await callAI(prompt, 400);
      setCoaching(text);
    } catch {
      setCoachingError("Something went wrong getting coaching. Try again.");
    } finally {
      setCoachingLoading(false);
    }
  };


  const copyReflection = async () => {
    try {
      await navigator.clipboard.writeText(reflection);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard may be unavailable; no-op
    }
  };

  // Sorted newest-first by start date. No longer grouped into date buckets —
  // a range entry (e.g. a whole week) can't cleanly belong to one bucket.
  const sortedEntries = entries
    .slice()
    .sort((a, b) => (a.startDate < b.startDate ? 1 : -1));

  if (!loaded) return null;

  return (
    <div
      style={{
        fontFamily: SERIF_FONT,
        background: "#FFFFFF",
        color: "#000000",
        minHeight: "100vh",
        padding: "2rem 1.5rem",
        maxWidth: "760px",
        margin: "0 auto",
      }}
    >
      <header style={{ marginBottom: "1.75rem" }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: "0.6rem" }}>
          <Feather size={22} color="#0C62FB" />
          <h1 style={{ fontSize: "1.7rem", margin: 0, fontWeight: 600, lineHeight: 0.9 }}>Momentum</h1>
        </div>
        <p style={{ fontFamily: SANS_FONT, color: "#666666", marginTop: "0.3rem", fontSize: "0.92rem", lineHeight: 1.1 }}>
          A line a day, in case you forget how far you've come.
        </p>
      </header>

      <section
        style={{
          background: "#E6E6E6",
          border: "1px solid #E6E6E6",
          borderRadius: "4px",
          padding: "1rem 1.1rem",
          marginBottom: "1.75rem",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "0.5rem", marginBottom: "0.5rem" }}>
          <div style={{ fontFamily: "ui-monospace, monospace", fontSize: "0.78rem", color: "#666666" }}>
            {entryIsRange
              ? `${formatDate(entryStartDate)} – ${formatDate(entryEndDate)}`
              : formatDate(todayISO())}
          </div>
          <label
            style={{
              display: "flex",
              alignItems: "center",
              gap: "0.3rem",
              fontFamily: SANS_FONT,
              fontSize: "0.75rem",
              color: "#666666",
              cursor: "pointer",
            }}
          >
            <input
              type="checkbox"
              checked={entryIsRange}
              onChange={(e) => setEntryIsRange(e.target.checked)}
            />
            This covers more than one day
          </label>
        </div>
        {entryIsRange && (
          <div style={{ display: "flex", gap: "0.6rem", alignItems: "center", flexWrap: "wrap", marginBottom: "0.6rem", fontFamily: SANS_FONT, fontSize: "0.8rem" }}>
            <label style={{ display: "flex", alignItems: "center", gap: "0.3rem" }}>
              From
              <input
                type="date"
                value={entryStartDate}
                onChange={(e) => setEntryStartDate(e.target.value)}
                style={{ fontFamily: "inherit", padding: "0.2rem", border: "1px solid #E6E6E6", borderRadius: "3px", background: "#FFFFFF" }}
              />
            </label>
            <label style={{ display: "flex", alignItems: "center", gap: "0.3rem" }}>
              To
              <input
                type="date"
                value={entryEndDate}
                onChange={(e) => setEntryEndDate(e.target.value)}
                style={{ fontFamily: "inherit", padding: "0.2rem", border: "1px solid #E6E6E6", borderRadius: "3px", background: "#FFFFFF" }}
              />
            </label>
          </div>
        )}
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={entryIsRange ? "What did you do over this period?" : "What did you do today?"}
          rows={2}
          style={{
            width: "100%",
            resize: "vertical",
            border: "none",
            background: "transparent",
            outline: "none",
            fontFamily: SERIF_FONT,
            fontSize: "1rem",
            color: "#000000",
            lineHeight: 1.1,
          }}
        />
        <div style={{ display: "flex", flexWrap: "wrap", gap: "0.4rem", marginTop: "0.5rem", marginBottom: "0.75rem" }}>
          {QUICK_TAGS.map((tag) => {
            const active = activeTags.includes(tag);
            return (
              <button
                key={tag}
                onClick={() => toggleTag(tag)}
                style={{
                  fontFamily: SANS_FONT,
                  fontSize: "0.78rem",
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
        <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center" }}>
          <button
            onClick={saveEntry}
            onMouseEnter={() => setHoverSaveBtn(true)}
            onMouseLeave={() => setHoverSaveBtn(false)}
            disabled={!draft.trim() || saving}
            style={{
              fontFamily: SANS_FONT,
              fontSize: "0.85rem",
              fontWeight: 600,
              padding: "0.45rem 1rem",
              borderRadius: "4px",
              border: "none",
              background: draft.trim() ? (hoverSaveBtn ? "#002FAF" : "#0C62FB") : "#E6E6E6",
              color: "#FFFFFF",
              cursor: draft.trim() ? "pointer" : "default",
              display: "flex",
              alignItems: "center",
              gap: "0.4rem",
            }}
          >
            {saving && <Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} />}
            Save entry
          </button>
        </div>
      </section>

      <section style={{ marginBottom: "2.25rem" }}>
        <h2 style={{ fontFamily: SANS_FONT, fontSize: "0.78rem", color: "#666666", letterSpacing: "0.03em", marginBottom: "0.75rem", lineHeight: 0.9 }}>
          Your log
        </h2>
        {entries.length === 0 && (
          <p style={{ color: "#666666", fontStyle: "italic", fontSize: "0.92rem" }}>
            Nothing logged yet — write your first line above.
          </p>
        )}
        {sortedEntries.map((e) => {
          const PillarIcon = e.pillar ? PILLAR_ICONS[e.pillar] : undefined;
          return (
            <div key={e.id} style={{ marginBottom: "1.1rem" }}>
              <div style={{ fontFamily: "ui-monospace, monospace", fontSize: "0.75rem", color: "#666666", marginBottom: "0.35rem" }}>
                {entryDateLabel(e)}
              </div>
              <div style={{ display: "flex", gap: "0.85rem", marginBottom: "0.7rem" }}>
                <div
                  style={{
                    width: "26px",
                    height: "26px",
                    borderRadius: "50%",
                    border: PillarIcon ? "1px solid #0C62FB" : "1px solid transparent",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                  }}
                  title={e.pillar || undefined}
                >
                  {PillarIcon && <PillarIcon size={14} color="#0C62FB" />}
                </div>
                <div style={{ flex: 1 }}>
                  <p style={{ margin: "0 0 0.25rem 0", lineHeight: 1.1 }}>{e.entryText}</p>
                  {e.tags && (
                    <div style={{ display: "flex", gap: "0.3rem", marginBottom: "0.25rem" }}>
                      {e.tags.split(",").map((t) => (
                        <span key={t} style={{ fontFamily: SANS_FONT, fontSize: "0.7rem", color: "#0C62FB" }}>
                          {t}
                        </span>
                      ))}
                    </div>
                  )}
                  {e.reflection && (
                    <p style={{ fontFamily: SANS_FONT, fontSize: "0.82rem", color: "#FF4D5F", margin: 0, display: "flex", alignItems: "flex-start", gap: "0.3rem" }}>
                      <Sparkles size={13} style={{ marginTop: "0.15rem", flexShrink: 0 }} />
                      {e.reflection}
                    </p>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </section>

      <section style={{ borderTop: "1px solid #E6E6E6", paddingTop: "1.25rem" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", marginBottom: "0.75rem" }}>
          <BookOpen size={17} color="#0C62FB" />
          <h2 style={{ fontFamily: SANS_FONT, fontSize: "0.95rem", margin: 0, lineHeight: 0.9 }}>
            Generate quarterly reflection draft
          </h2>
        </div>


        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "0.6rem",
            flexWrap: "wrap",
            marginBottom: "0.75rem",
            padding: "0.6rem 0.75rem",
            background: promotionMode ? "#FFDBDF" : "transparent",
            border: promotionMode ? "1px solid #FF4D5F" : "1px solid transparent",
            borderRadius: "4px",
          }}
        >
          <label
            style={{
              display: "flex",
              alignItems: "center",
              gap: "0.4rem",
              fontFamily: SANS_FONT,
              fontSize: "0.85rem",
              cursor: "pointer",
            }}
          >
            <input
              type="checkbox"
              checked={promotionMode}
              onChange={(e) => persistPromotion(e.target.checked, currentLevel)}
            />
            <TrendingUp size={15} color="#FF4D5F" />
            Promotion Focus Mode
          </label>
          {promotionMode && (
            <label style={{ display: "flex", alignItems: "center", gap: "0.4rem", fontFamily: SANS_FONT, fontSize: "0.85rem" }}>
              {ENABLE_LEVEL_PICKER ? (
                <>
                  Current level
                  <select
                    value={currentLevel}
                    onChange={(e) => persistPromotion(true, e.target.value)}
                    style={{ fontFamily: "inherit", padding: "0.25rem", border: "1px solid #E6E6E6", borderRadius: "3px", background: "#E6E6E6" }}
                  >
                    {LEVEL_LADDER.map((l) => (
                      <option key={l.jobTitle} value={l.jobTitle}>
                        {l.jobTitle}
                      </option>
                    ))}
                  </select>
                </>
              ) : (
                <span>{currentLevel}</span>
              )}
              {nextLevel(currentLevel) && (
                <span style={{ color: "#666666" }}>
                  → coaching toward {nextLevel(currentLevel)!.jobTitle}
                </span>
              )}
            </label>
          )}
          {promotionMode && (
            <button
              onClick={getCoachingNow}
              disabled={coachingLoading}
              style={{
                fontFamily: SANS_FONT,
                fontSize: "0.8rem",
                fontWeight: 600,
                padding: "0.35rem 0.75rem",
                borderRadius: "4px",
                border: "1px solid #FF4D5F",
                background: "transparent",
                color: "#FF4D5F",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: "0.35rem",
              }}
            >
              {coachingLoading && <Loader2 size={13} style={{ animation: "spin 1s linear infinite" }} />}
              Get coaching now
            </button>
          )}
        </div>

        {coachingError && (
          <p style={{ fontFamily: SANS_FONT, fontSize: "0.85rem", color: "#9A4B3A" }}>{coachingError}</p>
        )}
        {coaching && (
          <div style={{ background: "#FFDBDF", border: "1px solid #FF4D5F", borderRadius: "4px", padding: "0.85rem 1rem", marginBottom: "1rem" }}>
            <p style={{ fontFamily: SANS_FONT, fontSize: "0.75rem", color: "#FF4D5F", margin: "0 0 0.4rem 0", display: "flex", alignItems: "center", gap: "0.3rem" }}>
              <TrendingUp size={13} />
              Promotion coaching — on demand
            </p>
            <pre style={{ whiteSpace: "pre-wrap", fontFamily: SERIF_FONT, fontSize: "0.88rem", lineHeight: 1.1, margin: 0 }}>
              {coaching}
            </pre>
          </div>
        )}

        <div style={{ display: "flex", gap: "0.6rem", alignItems: "center", flexWrap: "wrap", marginBottom: "0.75rem", fontFamily: SANS_FONT, fontSize: "0.85rem" }}>
          <label style={{ display: "flex", alignItems: "center", gap: "0.3rem" }}>
            From
            <input type="date" value={rangeStart} onChange={(e) => setRangeStart(e.target.value)} style={{ fontFamily: "inherit", padding: "0.25rem", border: "1px solid #E6E6E6", borderRadius: "3px", background: "#E6E6E6" }} />
          </label>
          <label style={{ display: "flex", alignItems: "center", gap: "0.3rem" }}>
            To
            <input type="date" value={rangeEnd} onChange={(e) => setRangeEnd(e.target.value)} style={{ fontFamily: "inherit", padding: "0.25rem", border: "1px solid #E6E6E6", borderRadius: "3px", background: "#E6E6E6" }} />
          </label>
          <button
            onClick={generateReflection}
            disabled={generating}
            style={{ fontFamily: SANS_FONT, fontSize: "0.85rem", fontWeight: 600, padding: "0.4rem 0.9rem", borderRadius: "4px", border: "none", background: "#FF4D5F", color: "#FFFFFF", cursor: "pointer", display: "flex", alignItems: "center", gap: "0.4rem" }}
          >
            {generating && <Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} />}
            Generate draft
          </button>
        </div>

        {reflectionError && (
          <p style={{ fontFamily: SANS_FONT, fontSize: "0.85rem", color: "#9A4B3A" }}>{reflectionError}</p>
        )}

        {reflection && (
          <div style={{ background: "#E6E6E6", border: "1px solid #E6E6E6", borderRadius: "4px", padding: "1rem", position: "relative" }}>
            <button
              onClick={copyReflection}
              style={{ position: "absolute", top: "0.6rem", right: "0.6rem", fontFamily: SANS_FONT, fontSize: "0.75rem", border: "1px solid #E6E6E6", background: "transparent", borderRadius: "3px", padding: "0.25rem 0.5rem", cursor: "pointer", display: "flex", alignItems: "center", gap: "0.3rem", color: "#666666" }}
            >
              {copied ? <Check size={13} /> : <Copy size={13} />}
              {copied ? "Copied" : "Copy"}
            </button>
            <pre style={{ whiteSpace: "pre-wrap", fontFamily: SERIF_FONT, fontSize: "0.92rem", lineHeight: 1.1, margin: 0, paddingRight: "3.5rem" }}>
              {reflection}
            </pre>
          </div>
        )}
      </section>

      <style>{`@keyframes spin { from { transform: rotate(0deg);} to { transform: rotate(360deg);} }`}</style>
    </div>
  );
}
