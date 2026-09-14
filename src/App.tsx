import { useState, useEffect, useCallback } from "react";
import { Feather, Copy, Check, Loader2, Sparkles, BookOpen } from "lucide-react";
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

// NOTE: for a production deployment inside your environment's DLP policy,
// move this behind a Power Automate flow or Azure OpenAI/AI Builder connector
// rather than calling a public API directly from the client. See README.
async function callClaude(prompt: string, maxTokens = 500): Promise<string> {
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: maxTokens,
      messages: [{ role: "user", content: prompt }],
    }),
  });
  if (!response.ok) throw new Error("AI request failed");
  const data = await response.json();
  return data.content
    .filter((b: { type: string }) => b.type === "text")
    .map((b: { text: string }) => b.text)
    .join("\n")
    .trim();
}

// Multimodal variant for the entry-assist feature: sends text plus any
// image/text attachments as content blocks, per Claude's messages API.
type ContentBlock =
  | { type: "text"; text: string }
  | { type: "image"; source: { type: "base64"; media_type: string; data: string } };

async function callClaudeWithContent(blocks: ContentBlock[], maxTokens = 300): Promise<string> {
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: maxTokens,
      messages: [{ role: "user", content: blocks }],
    }),
  });
  if (!response.ok) throw new Error("AI request failed");
  const data = await response.json();
  return data.content
    .filter((b: { type: string }) => b.type === "text")
    .map((b: { text: string }) => b.text)
    .join("\n")
    .trim();
}

type Attachment = {
  name: string;
  kind: "image" | "text";
  mediaType?: string; // for images
  data: string; // base64 for images, raw text for text files
};

const MAX_TEXT_ATTACHMENT_CHARS = 4000; // keep prompts light, per token budget

function readFileAsAttachment(file: File): Promise<Attachment> {
  return new Promise((resolve, reject) => {
    const isImage = file.type.startsWith("image/");
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("File read failed"));
    if (isImage) {
      reader.onload = () => {
        const result = reader.result as string;
        const base64 = result.split(",")[1] ?? "";
        resolve({ name: file.name, kind: "image", mediaType: file.type, data: base64 });
      };
      reader.readAsDataURL(file);
    } else {
      reader.onload = () => {
        const text = (reader.result as string).slice(0, MAX_TEXT_ATTACHMENT_CHARS);
        resolve({ name: file.name, kind: "text", data: text });
      };
      reader.readAsText(file);
    }
  });
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
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [drafting, setDrafting] = useState(false);
  const [draftError, setDraftError] = useState("");
  const [activeTags, setActiveTags] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [hoverDraftBtn, setHoverDraftBtn] = useState(false);
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

  const handleFilesSelected = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const read = await Promise.all(Array.from(files).map(readFileAsAttachment));
    setAttachments((prev) => [...prev, ...read]);
  };

  const removeAttachment = (index: number) => {
    setAttachments((prev) => prev.filter((_, i) => i !== index));
  };

  const draftFromNotes = async () => {
    if (!draft.trim() && attachments.length === 0) return;
    setDraftError("");
    setDrafting(true);
    try {
      const blocks: ContentBlock[] = [
        {
          type: "text",
          text: `Turn these quick/messy notes${
            attachments.length ? " and attached files/screenshots" : ""
          } into one clean, specific sentence (two at most) describing what the person did at work today, suitable for a daily work log entry. Keep only what's actually stated or shown — don't invent details. No preamble, just the entry text.\n\nNotes: "${draft.trim() || "(none — see attachments)"}"`,
        },
      ];
      for (const a of attachments) {
        if (a.kind === "image") {
          blocks.push({
            type: "image",
            source: { type: "base64", media_type: a.mediaType || "image/png", data: a.data },
          });
        } else {
          blocks.push({ type: "text", text: `--- ${a.name} ---\n${a.data}` });
        }
      }
      const cleaned = await callClaudeWithContent(blocks, 200);
      setDraft(cleaned);
      setAttachments([]); // attachments are transient — used once to help draft, not persisted
    } catch {
      setDraftError("Couldn't draft an entry from that. You can still write it yourself.");
    } finally {
      setDrafting(false);
    }
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
      });
      setEntries((prev) => [created, ...prev]);
      setDraft("");
      setActiveTags([]);
      setEntryIsRange(false);
      setEntryStartDate(todayISO());
      setEntryEndDate(todayISO());

      try {
        const line = await callClaude(
          `A person logged this note about their work${
            created.startDate !== created.endDate ? ` covering ${created.startDate} to ${created.endDate}` : ""
          }: "${created.entryText}"${
            created.tags ? ` (tagged: ${created.tags})` : ""
          }.\n\nRespond with exactly one short, specific, encouraging sentence naming the skill or professional behavior this entry demonstrates growth in. No preamble, no quotes, just the sentence.`,
          120
        );
        if (created.id) {
          await WorkJournalEntryService.update(created.id, { reflection: line });
          setEntries((prev) =>
            prev.map((e) => (e.id === created.id ? { ...e, reflection: line } : e))
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
      const text = await callClaude(prompt, promotionMode ? 1400 : 900);
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
      const text = await callClaude(prompt, 400);
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
          placeholder={
            entryIsRange
              ? "What did you do over this period?"
              : "What did you do today? (paste rough notes — AI can clean it up)"
          }
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
        {attachments.length > 0 && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: "0.35rem", marginTop: "0.4rem" }}>
            {attachments.map((a, i) => (
              <span
                key={`${a.name}-${i}`}
                style={{
                  fontFamily: SANS_FONT,
                  fontSize: "0.72rem",
                  color: "#666666",
                  border: "1px solid #E6E6E6",
                  borderRadius: "999px",
                  padding: "0.15rem 0.5rem",
                  display: "flex",
                  alignItems: "center",
                  gap: "0.3rem",
                }}
              >
                {a.name}
                <button
                  onClick={() => removeAttachment(i)}
                  style={{ border: "none", background: "none", cursor: "pointer", color: "#9A4B3A", padding: 0, fontSize: "0.8rem", lineHeight: 1 }}
                  aria-label={`Remove ${a.name}`}
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        )}
        {draftError && (
          <p style={{ fontFamily: SANS_FONT, fontSize: "0.78rem", color: "#9A4B3A", margin: "0.4rem 0 0" }}>{draftError}</p>
        )}
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
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <label
              style={{
                fontFamily: SANS_FONT,
                fontSize: "0.78rem",
                color: "#666666",
                cursor: "pointer",
                textDecoration: "underline",
              }}
            >
              Attach screenshot / file
              <input
                type="file"
                accept="image/*,.txt,.md,.csv,.json"
                multiple
                onChange={(e) => handleFilesSelected(e.target.files)}
                style={{ display: "none" }}
              />
            </label>
          </div>
          <div style={{ display: "flex", gap: "0.5rem" }}>
            <button
              onClick={draftFromNotes}
              onMouseEnter={() => setHoverDraftBtn(true)}
              onMouseLeave={() => setHoverDraftBtn(false)}
              disabled={(!draft.trim() && attachments.length === 0) || drafting}
              style={{
                fontFamily: SANS_FONT,
                fontSize: "0.85rem",
                fontWeight: 600,
                padding: "0.45rem 0.9rem",
                borderRadius: "4px",
                border: `1px solid ${hoverDraftBtn ? "#002FAF" : "#0C62FB"}`,
                background: "transparent",
                color: hoverDraftBtn ? "#002FAF" : "#0C62FB",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: "0.4rem",
              }}
            >
              {drafting && <Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} />}
              Draft with AI
            </button>
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
        {sortedEntries.map((e) => (
          <div key={e.id} style={{ marginBottom: "1.1rem" }}>
            <div style={{ fontFamily: "ui-monospace, monospace", fontSize: "0.75rem", color: "#666666", marginBottom: "0.35rem" }}>
              {entryDateLabel(e)}
            </div>
            <div style={{ borderLeft: "2px solid #E6E6E6", paddingLeft: "0.85rem", marginBottom: "0.7rem" }}>
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
        ))}
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
