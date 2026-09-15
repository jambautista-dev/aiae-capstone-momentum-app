# Implementation Plan: Dedicated Log Page

## Open question: routing vs. view-state toggle

**Recommendation: (b) — a simple view-state toggle within `App`, no new dependency.**

| | View-state toggle | Client-side routing (e.g. react-router) |
|---|---|---|
| New dependency | None | Yes — adds a router lib + config to a project that has none today |
| URL / deep-linking | No dedicated URL for Log vs Compose | Yes — bookmarkable, shareable URLs |
| Fit for this app | Good — this is a small, single-user, single-screen tool with two modes, not a multi-page site | Overkill for 2 views |
| Power Apps code app hosting | Simpler — static hosting has no routing config to get wrong (no server-side rewrites needed for deep links) | Adds a deployment risk: client-side routes need a fallback/rewrite rule configured in hosting, which isn't set up here |
| Effort | Low — one `view` state variable + a small tab control | Higher — install, configure, wrap app, learn/maintain |
| Future-proofing | If the app grows to genuinely distinct pages later, routing can be added then | Premature for the app's current scope |

Given the app is intentionally small (per README's "known scope limits" framing) and gains no real benefit from a dedicated URL today, a view-state toggle is the lower-risk, lower-effort choice. Revisit real routing only if/when more pages are added.

## Other design decisions (stating explicitly, not deciding silently)

- **New files**: introduce `src/components/EntryRow.tsx` (shared row rendering: pillar icon + text + tags + date) and `src/components/LogPage.tsx` (search bar, filter chips, grouped list). Keeps `App.tsx` from growing further and lets the existing inline "Your log" preview under Compose reuse `EntryRow` instead of duplicating markup.
- **Compose view's existing inline log preview is left as-is** (date shown above the entry). The new Log page's row layout (date/range on the right) is a distinct presentation used only on the Log page, per the reference. `EntryRow` will accept a `layout: "stacked" | "inline-date"` prop (naming TBD at implementation time) so both views share the same pillar-icon/text/tags rendering without fighting over one fixed layout.
- **Date grouping key**: group by `entry.startDate` (using the existing `formatDate` helper for the header, e.g. "Sep 11, 2026"). A multi-day range entry is grouped under its start date but still displays its full range on the row itself (reusing `entryDateLabel`), consistent with how ranges are already handled elsewhere in the app.
- **Tag filter behavior**: chips are multi-select. An entry matches if it has *any* of the currently active chip tags (OR), combined with an AND against the search text match. Clicking an active chip again deselects it (per spec).
- **Search matching**: case-insensitive substring match against `entryText` or `tags`.
- **Truncation**: single-line truncate with ellipsis (CSS `text-overflow: ellipsis` + `white-space: nowrap` + `overflow: hidden`) on the entry-text line within a row.
- **No avatar / "who logged this" column** — intentionally omitted, per spec, since this is single-user.
- **Testing approach**: this repo has no test runner installed (no Jest/Vitest). "Test after each step" below means a manual check in the running app via `npm run dev`, described concretely per step. Adding automated tests is out of scope unless requested separately.

## Steps

1. **Add view-state toggle shell.** Add a `view` state (`"compose" | "log"`) to `App`, defaulting to `"compose"`. Add a small two-item tab control near the header ("Compose" / "Log") that switches which section renders. Render a temporary placeholder (`<p>Log page coming soon</p>`) for the `"log"` view.
   - *Test*: Run the app, confirm clicking each tab swaps the visible section and the existing Compose view (textarea, quick-tags, Save entry, inline log, quarterly reflection section) is unaffected.

2. **Extract `EntryRow` component.** Create `src/components/EntryRow.tsx`, moving the existing pillar-icon-circle + entry-text + tags + reflection markup out of `App.tsx`'s inline log map into this component. Wire the existing Compose-view inline log to use it.
   - *Test*: Confirm the inline "Your log" list under Compose renders identically to before (same icon circles, text, tag pills, reflection line) — no visual regression.

3. **Add date-grouping utility.** Add a pure function (e.g. in `src/data/` or a new small `src/utils/` module) that takes `WorkJournalEntry[]` and returns groups keyed by `startDate`, sorted newest-group-first, each with a `label` (via `formatDate`) and its entries.
   - *Test*: Temporarily log the grouped output to the console with a few sample entries spanning different days and same-day duplicates; confirm correct grouping, order, and per-group entry counts.

4. **Add search + tag-filter state and pure filter function.** Add `logSearch` and `logActiveTags` state (scoped to the Log page). Add a pure function that filters entries by case-insensitive text match (entryText or tags) AND active-tag OR-match.
   - *Test*: Temporarily render the filtered count in the placeholder Log view and manually verify it updates correctly while typing in a search box and toggling tag chips (wired minimally, before full UI).

5. **Build `LogPage` component shell.** Create `src/components/LogPage.tsx` with: a search input, a row of filter chips for `QUICK_TAGS` (reusing existing chip styling/active-state pattern from the composer), and an empty-state message ("No entries match" / "Nothing logged yet"). Wire it into `App`'s `"log"` view in place of the placeholder, passing `entries` and using the step 3/4 utilities.
   - *Test*: In the browser, type in search and click chips; confirm the (still date-flat, ungrouped) list filters correctly and the empty state appears when nothing matches.

6. **Render grouped results with date headers.** Using the grouping utility from step 3 on the filtered list from step 4, render a date header per group (label + "N entries" / "1 entry" singular handling), and render each entry via `EntryRow` in the "date on the right" layout, with entry-text truncation.
   - *Test*: With entries across multiple days (including a same-day pair and a range entry), confirm headers, correct singular/plural counts, and that a long entry truncates with an ellipsis instead of wrapping/breaking layout.

7. **End-to-end pass.** Manually verify: switching Compose ↔ Log preserves state correctly (no data loss, no stale filters carrying over unexpectedly), saving a new entry from Compose shows up correctly grouped/filterable on the Log page, and the Compose view's own inline log preview still works.
   - *Test*: Full manual walkthrough covering all of the above in one sitting.

8. **Branding pass.** Check the new UI against `.github/instructions/branding.instructions.md`: Slalom Blue present and used for active/primary states, Coral Red as the only secondary accent (if used at all here), sentence case (no all-caps except short eyebrow labels), flush-left/ragged-right text, max 3 type sizes, correct font stacks (Lora for entry copy, sans stack for UI chrome/labels), ~1.1 line-height for body copy.
   - *Test*: Visual review of the Log page against the checklist above.

**Not in scope for this plan** (explicitly deferred per your instructions): Compact/Cards/Timeline view-switcher — flagged as a future nice-to-have only.

---
Stopping here for review — let me know if you want any step adjusted before I start building step 1.
