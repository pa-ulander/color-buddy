# ColorBuddy Backlog

Prioritized tasks and ideas grouped by area. Update statuses as work progresses and link to relevant files or issues when possible.

## Decorations & Visuals

*   Review swatch alignment in mixed Tailwind/CSS variable usage across additional sample files (`src/services/extensionController.ts`).
*   Extend inline decorations to other formats (e.g., `lab()` or `color(display-p3 ...)`) once detection is implemented (`src/services/colorDetector.ts`).
*   Add hover copy affordances so each format conversion triggers `colorbuddy.copyColorAs` (`src/services/provider.ts`, `src/utils/quickActions.ts`).
*   Surface perceptual brightness and closest CSS color name in hover tooltips (`src/services/provider.ts`, `src/utils/colorFormatConversions.ts`).

## Status Bar & UI Elements

*   Collect feedback on the hover/status bar usage and contrast metrics, refining formatting or thresholds as needed (`src/services/provider.ts`, `src/services/extensionController.ts`).
*   Consolidate the usage-identifier helper so hover and status bar metrics share one implementation (`src/services/extensionController.ts`, `src/services/provider.ts`).

## Commands & Quick Actions

*   Monitor feedback on the expanded quick action set (copy/convert/accessibility/usages/palette) and adjust ordering or add new commands based on UX priorities (`src/utils/quickActions.ts`, `src/services/provider.ts`, `src/services/extensionController.ts`).


## Telemetry

*   Validate the API telemetry reporter against the real backend once available and add contract tests or mocks if needed (`src/services/apiTelemetryReporter.ts`, `src/services/telemetry.ts`).
*   Analyze the new color insight telemetry to confirm sampling volume and surface follow-up tweaks (`src/services/telemetry.ts`, `src/services/extensionController.ts`, `src/services/provider.ts`).
*   Evaluate migrating credentials to VS Code `SecretStorage` or an external keychain once the backend flow stabilizes; document trade-offs versus `.env` files (`docs/telemetry-notes.md`, `src/utils/env.ts`, `src/services/telemetry.ts`).
*   Add a telemetry credential reload helper (command or auto-detect) if secret rotation becomes a regular workflow (`src/utils/env.ts`, `src/services/telemetry.ts`).
*   Work from `docs/telemetry-notes.md` when resuming telemetry tasks; keep the checklist updated after each session.


## Sass & Language Support

## Performance & Caching

*   Benchmark decoration refresh cost in large files (`StateManager`, `Cache`).
*   Outline throttling or batching strategies informed by benchmark findings (`StateManager`, `Cache`).
*   Pool decoration types and skip unchanged refresh chunks to cut refresh allocations (`StateManager`, `extensionController`).
*   Capture real-world perfLogger traces in large workspaces to validate scheduler tuning (`perfLogger`, `StateManager`) — initial analyzer script (`scripts/analyze-perf-log.js`) ready; still need sampling from sizable projects.
*   Evaluate decoration chunk/yield thresholds using analyzer output and update scheduler defaults (`extensionController`, `StateManager`) — cooperative yielding landed, still need real-workspace validation.
*   Investigate using incremental indexing for very large workspaces (`CSSParser`).
*   Gather perf logs from noisy production-like workspaces (multiple CSS pipelines, background tasks) to confirm scheduler resilience once access is available.

## Documentation & Release

*   Expand docs with a “How decorations work” section and troubleshooting tips (`README.md`).
*   Prepare marketing copy/screenshots for the next marketplace update (`img/`, `README.md`).

## Testing & Tooling

*   Backfill tests that cover hover copy affordances once implemented (`src/test/integration/defaultLanguages.test.ts`).
*   Add integration coverage for hover color naming/brightness metadata when the feature lands (`src/test/integration/defaultLanguages.test.ts`).
*   Extend CSS variable fixtures per language to cover non-literal scenarios (var usage) (`src/test/integration/cssVariableIntegration.test.ts`).

---

**Usage Tips**

*   Add new items under the appropriate heading; create new headings if needed.
*   Include file paths or test names to speed up navigation.
*   Move completed items to the worklog entry where they were finished if additional context is helpful.