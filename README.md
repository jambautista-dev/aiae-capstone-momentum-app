# Momentum — Power Apps Code App

A work-diary app built as a **Power Apps code app**: React + TypeScript, developed locally, backed by a Dataverse table, published into Power Apps. This is the same Momentum concept from the capstone spec, rebuilt on the platform your team actually delivers on.

This runs standalone right now (entries save to your browser via a local stub service), so you can demo it immediately. The steps below wire it to a real Dataverse table when you're ready.

## What's different from the plain web-app version

| | Plain artifact version | This version |
|---|---|---|
| Data store | In-browser key-value storage | Dataverse table |
| Runtime | Claude.ai only | Local dev (Vite) → published into Power Apps |
| Auth | None | Microsoft Entra, inherited from your Power Platform environment |
| Governance | None | Subject to your environment's DLP policies, sharing limits, Conditional Access |

## Prerequisites
- A Power Platform environment with code apps enabled
- Node.js (LTS) and Git
- The Power Apps CLI:
  ```bash
  npm install --global @microsoft/power-apps-cli
  npm install --global @microsoft/power-apps
  ```

## 1. Create the Dataverse table
In the Maker Portal (make.powerapps.com), create a table for entries — e.g. **Work Journal Entries** — with columns:

| Display name | Type | Notes |
|---|---|---|
| Start Date | Date only | defaults to today |
| End Date | Date only | equals Start Date for a single-day entry; later for a range entry |
| Entry Text | Multiple lines of text | the log line — may cover a single day or a range |
| Tags | Text | comma-separated quick-tags |
| Reflection | Multiple lines of text | AI-generated one-liner |

Note the table's **logical name** (e.g. `cr123_workjournalentry` — your publisher prefix will differ) — you'll need it below.

## 2. Install this project
```bash
npm install
pa app init --display-name "Momentum" --environment-id <your-environment-id>
```

## 3. Connect it to your Dataverse table
```bash
pa connection create --connector shared_commondataserviceforapps
pa connection list                     # copy the connection ID it returns

pa app add data-source `
  --connector "shared_commondataserviceforapps" `
  --connection-id "<connection-id>" `
  --table "<your table logical name>" `
  --dataset "<your Dataverse environment URL>"
```

This generates `src/generated/models/WorkJournalEntryModel.ts` and `src/generated/services/WorkJournalEntryService.ts`.

## 4. Swap the stub for the generated service
Open `src/services/WorkJournalEntryService.ts` — it's a drop-in stub with the same shape (`create`, `getall`, `update`) backed by localStorage so the app runs before you've connected data. Once step 3 is done, change the single import at the top of `src/App.tsx`:

```diff
- import { WorkJournalEntryService } from "./services/WorkJournalEntryService";
+ import { WorkJournalEntryService } from "./generated/services/WorkJournalEntryService";
```

You'll also need to align the field names in `App.tsx` (`startDate`, `endDate`, `entryText`, `tags`, `reflection`) with whatever the generator names your actual Dataverse columns — check `src/generated/models/WorkJournalEntryModel.ts` after generation.

## 5. Run and publish
```bash
npm run dev        # local dev server, opens "Local Play" — use the same browser profile as your tenant
npm run build
pa app push        # publishes to Power Apps, returns a shareable URL
```

## A governance note worth mentioning in your demo
The AI features (per-entry reflection, quarterly draft generation, promotion coaching, and entry-drafting from notes/attachments) currently call the Anthropic API directly from the browser for simplicity. For a real deployment inside your environment's DLP policy, the better pattern is to move that call behind a **Power Automate flow** (code apps support adding flows as a data source) or an **Azure OpenAI / AI Builder connector**, so no API key lives in client code and the call is subject to the same governance as everything else in the environment. Flagging this tradeoff explicitly is a good talking point for a Power Platform audience — it shows you understand the managed-platform value prop, not just the code.

## Known scope limits (worth stating plainly, not hiding)
- **Attachments** for the entry-drafting assist support images (sent to Claude's vision API) and plain text files (txt/md/csv/json, read directly). PDFs, Word docs, and Excel files are **not parsed** — adding that would require bundling extra libraries, which was cut to keep the build light. Attachments are transient: used once to help draft an entry, never persisted.
- **Promotion coaching "Get coaching now"** sends all logged entries every call, with no date filtering — fine for a demo, but would need pagination/summarization for months of real use.
- Pillar labels are hardcoded to Slalom's four Me@Slalom pillars for this release (not user-editable), to keep the app scoped.

## Reference
- [Code apps overview](https://learn.microsoft.com/power-apps/developer/code-apps/overview)
- [Connect your code app to data](https://learn.microsoft.com/power-apps/developer/code-apps/how-to/connect-to-data)
- [Power Apps CLI reference](https://learn.microsoft.com/power-apps/developer/code-apps/reference/cli)
