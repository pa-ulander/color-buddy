# ColorBuddy Worklog

A running record of collaboration sessions. Each entry captures the date, completed work, decisions, and follow-ups so future sessions can pick up quickly.

---

## 2025-11-24

**Context**
- Continued ColorBuddy restoration work after reintroducing swatches and Sass parity in v0.0.3.

**Done**
- Created long-term project tracking scaffolding (`.github/worklog.md`, `.github/backlog.md`).
- Added integration coverage confirming Tailwind/CSS variable swatch alignment in `examples/example.css`.
- Added regression test ensuring Tailwind class detection skips CSS variable names.
- Benchmarked `refreshEditor` against a large synthetic CSS document and captured results in `logs/metrics/2025-11-24-refresh-benchmark.json`.
- Replaced `examples/example.css` dependency with a dedicated fixture and refreshed the integration suite.
- Added a refresh scheduler with dynamic batching, chunked decoration application, and version-aware caching.
- Tuned decoration chunk sizes, added decoration pooling + chunk diffing, and logged refreshed benchmark results (~210 ms).
- Added a performance logging integration test that enables `perfLogger`, runs synthetic multi-editor refresh cycles, exports traces to `logs/metrics`, and asserts cache/timer telemetry availability.
- Added command smoke tests covering `colorbuddy.showColorPalette` (populated and empty paths) and `colorbuddy.exportPerformanceLogs` (enable prompt plus export flow).

**Decisions**
- Use in-repo Markdown docs for ongoing collaboration history and backlog management.

**Follow-ups**
- Outline throttling or batching strategies based on the new benchmark data.
- Update worklog with new entries at the end of each session.
- Capture real-workspace perf logs (with `perfLogger`) to tune the adaptive scheduler toward <200 ms refreshes.

---

## 2025-11-24 (Session 2)

**Context**
- Followed up on scheduler tuning by inspecting the latest exported perf trace.

**Done**
- Added `scripts/analyze-perf-log.js` plus `npm run analyze-perf-log` for quick parsing of exported perf logs.
- Ran the analyzer against `perf-logger-trace-2025-11-24T18-03-49.md` and documented the findings in `logs/metrics/2025-11-24-refresh-benchmark.md`.

**Decisions**
- Treat the new analyzer as the primary entry point for summarizing perf metrics before manual tuning.

**Follow-ups**
- Use analyzer output to recalibrate decoration chunk/yield thresholds and update scheduler defaults.
- Gather traces from large, real-world workspaces to validate improvements.

---

## 2025-11-24 (Session 3)

**Context**
- Created maintainer-facing documentation so PMs and developers can run the new perf analysis flow.

**Done**
- Authored `docs/pm-or-dev-howto.md` covering the performance logging and analyzer workflow for extension maintainers.
- Updated backlog to reflect the new documentation deliverable.

**Decisions**
- Keep performance diagnostics guidance out of the end-user README; centralize maintainership docs under `docs/`.

**Follow-ups**
- Extend the guide later with scheduler tuning checklists once new defaults are finalized.

---

## 2025-11-24 (Session 4)

**Context**
- Began tuning the refresh scheduler based on trace analysis and documented the new workflow expectations.

**Done**
- Added cooperative yielding between decoration chunks (async `applyCSSVariableDecorations`) and logged the behavior via `perfLogger`.
- Introduced `DECORATION_CHUNK_YIELD_DELAY_MS` constant to centralize pacing tweaks.
- Updated maintainer guide with a scheduler tuning checklist and noted the change in the refresh benchmark log.

**Decisions**
- Yield after each decoration chunk when multiple batches are required to keep the event loop responsive without shrinking chunk sizes yet.

**Follow-ups**
- Re-run perf traces in large workspaces to verify the yielding change keeps refresh max times below 200–250 ms.
- Revisit chunk size defaults if traces still show sustained spikes.

---

## 2025-11-24 (Session 5)

**Context**
- Validated the new yielding behaviour by capturing and analyzing a fresh performance trace.

**Done**
- Exported `perf-logger-trace-2025-11-24T20-25-27.md` using the maintainer workflow.
- Ran `scripts/analyze-perf-log.js` to confirm refresh averages (23.52 ms) and maxima (30.04 ms) stay well under the 200–250 ms budget.
- Logged the new trace metrics in `logs/metrics/2025-11-24-refresh-benchmark.md` for future comparisons.

**Decisions**
- No additional chunk size or debounce tweaks required until heavier workspaces show regressions.

**Follow-ups**
- Collect traces from larger, organically noisy workspaces (beyond the integration harness) to ensure the scheduler scales.

---

## 2025-11-24 (Session 6)

**Context**
- Ensured documented default language coverage matches runtime behaviour.

**Done**
- Added automated parity checks that keep `DEFAULT_LANGUAGES` in sync with `package.json` defaults and the README list.
- Introduced literal color pipeline tests that exercise detection, color provider output, and hover generation across every default language.

**Decisions**
- Guard documentation parity with tests instead of maintaining manual checklists.

**Follow-ups**
- Extend coverage to explicitly exercise wildcard `"*"` selectors and CSS variable scenarios per language.

---

## 2025-11-25 (Session 7)

**Context**
- Expanded language-by-language verification starting with PHP coverage.

**Done**
- Created PHP fixture (`src/test/integration/fixtures/php/color-snippets.php`) representing common literal color patterns.
- Added integration test (`src/test/integration/phpLanguage.test.ts`) to assert detection, color provider output, and hover swatch rendering for PHP documents.

**Decisions**
- Reuse the full hover pipeline assertions from unit coverage to ensure parity with in-editor behaviour.

**Follow-ups**
- Replicate the fixture-driven approach for the remaining default languages (HTML, XML, etc.) to complete full coverage.

---

## 2025-11-25 (Session 8)

**Context**
- Completed the language-wide coverage pass using shared fixtures and integration tests.

**Done**
- Authored `src/test/integration/defaultLanguages.test.ts` to iterate every `DEFAULT_LANGUAGE`, asserting detection, hover swatch markup, and correct color-provider gating.
- Added in-memory fixtures for each language to mimic realistic color usage patterns without needing disk-backed files.
- Seeded `cssVariableIntegration.test.ts` with registry-backed fixtures to confirm CSS variable hovers work across representative languages.

**Decisions**
- Mirror the controller's allowed-format filtering in tests to respect VS Code native color providers for CSS-family languages.

**Follow-ups**
- Layer Tailwind utility coverage and expand CSS variable fixtures to additional languages as needed.

---

## 2025-11-25 (Session 9)

**Context**
- Added Tailwind coverage to keep parity between CSS variable metadata and utility class detections.

**Done**
- Created `src/test/integration/fixtures/css/tailwind-registry.css` to seed Tailwind utility mappings for the integration harness.
- Authored `src/test/integration/tailwindIntegration.test.ts` exercising Tailwind color classes across HTML, TS/JS variants, Vue, Svelte, Markdown/MDX, and PHP.
- Ran the full test suite (`npm test` → 314 passing) to confirm the new Tailwind integration suite and existing coverage remain green.

**Decisions**
- Keep Tailwind fixtures CSS-backed so registry resolution mirrors runtime behaviour, avoiding bespoke Tailwind parsers in tests.

**Follow-ups**
- Extend Tailwind fixtures to cover state variants (`hover:`, `focus:`) and multi-color utilities, aligning with the open backlog item for non-literal scenarios.

---

## 2025-11-25 (Session 10)

**Context**
- Converted default language coverage to file-backed fixtures per user request for explicit mockups per language.

**Done**
- Added dedicated sample files under `src/test/integration/fixtures/languages/` for every default language (43 fixtures total).
- Updated `src/test/integration/defaultLanguages.test.ts` to load fixtures from disk, enforce one-to-one coverage with `DEFAULT_LANGUAGES`, and reuse VS Code language overrides for assertions.
- Re-ran focused (`npm test -- --grep "Default language integration coverage"`) and full (`npm test`) suites to validate the new fixtures (all 314 tests passing).

**Decisions**
- Resolve fixture paths relative to the project root so compiled test output can access source fixtures without bundling duplicates into `out/`.

**Follow-ups**
- Build on the new fixture directory when expanding non-literal CSS variable/Tailwind scenarios per backlog.

---

## 2025-11-25 (Session 12)

**Context**
- Phase 1 follow-up to surface status bar metrics and polish hover content before tackling telemetry wiring.

**Done**
- Swapped the status bar text for a palette-only glyph and wired it through the quick-action router so the VS Code highlight behavior returns.
- Added usage counting and contrast summary metrics to the status bar tooltip with shared helpers for hover reuse.
- Enriched hover tooltips across literals, CSS variables, and classes with usage counts plus contrast summaries while keeping quick actions intact.
- Introduced shared usage-identifier helpers in `Provider` and updated unit coverage to assert the new hover and status bar output.
- Ran `npm test -- --grep "Default language literal pipeline"` to confirm hover/status bar suites stay green.

**Decisions**
- Reused existing localized usage/contrast strings for hover to avoid duplicating translation keys.

**Follow-ups**
- Hook status bar and hover metrics into the telemetry reporter once event shapes are finalized.
- Consider centralizing the usage-identifier helper so controller/provider share a single source.

---

## 2025-11-25 (Session 13)

**Context**
- Completed Phase 1 by instrumenting the new surface metrics (status bar + hover) with opt-in telemetry and fresh coverage.

**Done**
- Extended `Telemetry` with color insight events, consolidated contrast mapping helpers, and kept opt-in gating intact.
- Routed status bar metrics through `recordStatusBarTelemetry` and passed the shared telemetry instance into `Provider` for hover instrumentation.
- Ensured hover tooltips emit telemetry alongside their metrics and refreshed tests to validate event payloads and opt-out handling.
- Added targeted telemetry tests to `extension.test.ts` to assert hover/status bar events fire only when telemetry is enabled.

**Decisions**
- Reuse serialized contrast samples (background/ratio/level) for telemetry payloads so future consumers can chart data without extra parsing.

**Follow-ups**
- Replace the console stub with a backend reporter once collection infrastructure is ready.
- Analyze captured telemetry to tune sampling and identify any high-volume edge cases.

---

## 2025-11-25 (Session 11)

**Context**
- Delivered CSS variable coverage across every default language using file-backed fixtures, aligning with the user directive for explicit mockups.

**Done**
- Authored 43 CSS variable fixtures under `src/test/integration/fixtures/css-variables/`, mirroring the default language list.
- Refactored `src/test/integration/cssVariableIntegration.test.ts` to load fixtures from disk, assert mapping parity with `DEFAULT_LANGUAGES`, and reuse provider gating logic.
- Ran targeted (`npm test -- --grep "CSS variable integration"`) and full (`npm test`) suites to validate the expanded coverage (347 passing).

---

## 2025-11-25 (Session 12)

**Context**
- Continued the fixture expansion directive by wiring Tailwind utilities across every default language.

**Done**
- Refactored `src/test/integration/tailwindIntegration.test.ts` to load the new per-language Tailwind fixtures, assert parity with `DEFAULT_LANGUAGES`, and verify both `--primary` and `--accent` mappings.
- Confirmed hover output references Tailwind variables for all languages while ensuring color providers ignore Tailwind classes.
- Re-ran the full integration suite (`npm test`) to validate the updated Tailwind coverage (380 passing).
- Expanded Tailwind fixtures/tests to cover multi-color utilities (`from-`, `via-`, `to-`) across every default language.

**Decisions**
- Keep Tailwind fixture content on disk alongside other language fixtures to maintain consistent test inputs and reuse future multi-color cases.

**Follow-ups**
- Revisit Tailwind coverage if additional utility families (e.g., gradients or outline variants) gain registry mappings.

**Decisions**
- Store CSS variable fixtures alongside existing literals to reuse them when layering additional non-literal scenarios.

**Follow-ups**
- Extend the Tailwind fixtures with state modifiers and multi-color utilities to finish the outstanding non-literal coverage item.

---

## 2025-11-25 (Session 13)

**Context**
- Removed dependency on deleted example assets by migrating the SASS color-provider test to the new fixture suite.

**Done**
- Added `src/test/integration/fixtures/sass/hsl-colors.sass` with direct `hsl`/`hsla` samples for the native color provider.
- Pointed `sassColorProvider.test.ts` at the fixture path and verified the scenario with focused and full `npm test` runs (380 passing).

**Decisions**
- Keep specialty fixtures under `src/test/integration/fixtures/` so integration tests remain self-contained and resilient to documentation asset changes.

**Follow-ups**
- Consider adding variants that cover custom SASS language IDs once configuration-driven selector testing begins.

---

## 2025-11-25 (Session 14)

**Context**
- Validated Sass/LESS/Stylus color picker behaviour after introducing per-language fixtures.

**Done**
- Updated `extensionController.ensureDocumentIndexed` to treat CSS-like documents by file extension, ensuring custom language identifiers (e.g., bespoke Sass IDs) are indexed and pick up color data.
- Added `src/test/services/extensionController.ensureDocumentIndexed.test.ts` covering custom Sass language ids and cache busting behaviour.
- Reworked `sassColorProvider.test.ts` to use the controller harness, added coverage for custom Sass language ids, and introduced Less/Stylus parity tests.
- Created `src/test/integration/fixtures/less/hsl-colors.less` and `src/test/integration/fixtures/stylus/hsl-colors.styl` for the new integration scenarios.
- Trimmed completed Sass/Tailwind backlog entries and noted the remaining follow-up for other custom CSS-like identifiers.

**Decisions**
- Classify CSS-like documents (and native color provider overrides) using file extensions so custom language identifiers inherit the correct pipeline without additional configuration.

**Follow-ups**
- Add fixtures/tests that mirror custom language overrides for SCSS/LESS and `.pcss` syntaxes once representative samples are available.

---

## 2025-11-25 (Session 15)

**Context**
- Implemented remaining custom language coverage for SCSS/LESS overrides and validated watcher-driven CSS reindex flows.

**Done**
- Adjusted `extensionController` native color-provider gating to rely on language IDs only, keeping custom overrides active while retaining CSS-like indexing by extension.
- Added `src/test/integration/fixtures/scss/hsl-colors.scss` and expanded `sassColorProvider.test.ts` with SCSS/LESS remap coverage alongside existing Sass cases.
- Authored `cssWatcher.test.ts` to drive synthetic create/change events through the file-system watcher stub and assert registry reindex behaviour.
- Updated backlog to leave only the pending `.pcss` override follow-up.

**Decisions**
- Treat native color-provider deferral as language-id specific so remapped `.scss`/`.less` files still surface literal colors through ColorBuddy.

**Follow-ups**
- Extend override tests to `.pcss` once fixtures exist and consider adding watcher delete-event coverage to confirm registry cleanup paths.

---

## 2025-11-25 (Session 16)

**Context**
- Closed out the pending `.pcss` override follow-up by exercising PostCSS documents in both color provider and indexing flows.

**Done**
- Added `src/test/integration/fixtures/postcss/hsl-colors.pcss` with representative variable and media query usage.
- Expanded `Preprocessor Document Colors` integration suite to cover native and remapped PostCSS language identifiers.
- Augmented `extensionController.ensureDocumentIndexed` service tests to confirm `.pcss` files trigger parsing based on file extension even when language IDs change.
- Cleared the completed `.pcss` backlog item.

**Follow-ups**
- Add watcher delete-event coverage to guarantee registry cleanup paths behave as expected.

---

## 2025-11-25 (Session 17)

**Context**
- Finished the watcher cleanup follow-up to ensure registry state stays accurate when source CSS files are removed.

**Done**
- Enhanced `cssWatcher.test.ts` to validate delete-event handlers clear registry entries without triggering extra parses.
- Removed the completed watcher item from `.github/backlog.md`.
- Ran focused integration coverage to confirm the watcher scenario passes alongside the full suite.

**Follow-ups**
- None for this area; remaining backlog items focus on decoration performance and extended language fixtures.

---

## 2025-11-25 (Session 18)

**Context**
- Wrapped the session by validating PostCSS override support, watcher cleanup handling, and keeping documentation aligned with the new coverage.

**Done**
- Confirmed `Preprocessor Document Colors`, `ExtensionController.ensureDocumentIndexed`, `CSS Watcher Integration`, and the full `npm test` suite remain green after PostCSS and watcher enhancements.
- Ensured `.pcss` fixtures and delete-event assertions are documented in the worklog and pruned from the backlog.

**Follow-ups**
- Continue with the remaining backlog priorities (decoration performance experiments, expanded fixture scenarios) when ready.

---

## 2025-11-25 (Session 19)

**Context**
- Kicked off Phase 1 quick wins by enhancing hover tooltips with multi-format conversions.

**Done**
- Added `Provider.appendFormatConversions` to surface hex, RGBA, HSL, and Tailwind representations across literal, variable, and class hovers.
- Extended localization strings, updated hover assertions, and ran the default language hover suite (`npm test -- --grep "Default language literal pipeline"`).

**Decisions**
- Limit conversions to the active resolved color for now; revisit per-context variants after UX validation.

**Follow-ups**
- Add copy affordances or quick commands for the new format list (tracked in backlog).
- Evaluate richer color space support (LAB/LCH) once parser/formatter utilities grow.

---

## 2025-11-25 (Session 20)

**Context**
- Continued Phase 1 quick wins by delivering the status bar color indicator.

**Done**
- Introduced a shared `colorFormatConversions` utility and reused it within the hover provider and new status bar pipeline.
- Added a status bar item in `ExtensionController` that tracks the active cursor color, surfaces format conversions in the tooltip, and responds to editor/selection events.
- Updated localization strings, backlog/worklog, and reran the default language hover pipeline tests (`npm test -- --grep "Default language literal pipeline"`).

**Decisions**
- Keep the status bar text limited to color/value pairs for the initial release; contrast badges and quick actions are follow-up work.

**Follow-ups**
- Implement the status bar enrichments (contrast, usage counts, quick commands) now listed in the backlog.

---

## 2025-11-25 (Session 21)

**Context**
- Advanced the Phase 1 command palette deliverables starting with the “Copy Color As…” workflow.

**Done**
- Added `colorbuddy.copyColorAs` command wiring that reuses shared format conversions, clipboard support, and localized messaging.
- Expanded command integration tests to cover no-editor/no-color scenarios and the clipboard happy path, including new test harness controls for active editor, quick pick results, and clipboard writes.
- Updated the manifest, localization catalog, backlog, and worklog to reflect the new command entry and Phase 1 progress.

**Decisions**
- Reuse the standalone command for upcoming hover/status bar quick actions instead of duplicating copy logic in multiple surfaces.

**Follow-ups**
- Connect the hover format list and status bar quick actions to the new command, and iterate on additional commands (`Find Color Usages`, `Test Accessibility`) outlined in the backlog.

---

## 2025-11-25 (Session 22)

**Context**
- Continued Phase 1 command work by finishing the “Find Color Usages” workflow and hardening the command suite.

**Done**
- Completed the `colorbuddy.findColorUsages` command pipeline, including palette fallback, workspace search integration, and quick pick result handling.
- Added integration tests covering no-color, successful search, and no-result paths using the enhanced text-search harness utilities.
- Replaced the deleted sample references with a dedicated find-color-usages fixture and shimmed VS Code text search typings so the new command and tests compile cleanly.
- Trimmed the completed backlog item for the find-usages command and recorded the worklog update for traceability.

**Follow-ups**
- Explore ranking/grouping strategies for large result sets and consider surfacing the command via status bar or hover quick actions in a future pass.

---

## 2025-11-25 (Session 23)

**Context**
- Advanced Phase 1 quick commands by delivering the “Test Color Accessibility” experience.

**Done**
- Added `colorbuddy.testColorAccessibility`, wiring command registration, localization, and controller logic that surfaces contrast summaries via the provider’s new accessibility report helper.
- Introduced `AccessibilityReport` types, exposed a reusable `Provider.getAccessibilityReport`, and backed the command with dedicated integration tests alongside the existing find-color-usages fixture.
- Updated the manifest, backlog, and worklog to reflect the completed accessibility command, ensuring the command suite now covers copy, find usages, and accessibility checks.

**Follow-ups**
- Extend the accessibility command to accept custom background colors and surface quick actions from the status bar or hover UI when the UX design is finalized.

---

## 2025-11-25 (Session 24)

**Context**
- Continued Phase 1 command palette enhancements by adding inline format conversion.

**Done**
- Delivered `colorbuddy.convertColorFormat` with full command registration, localization, quick pick UX, and in-editor replacement logic that reuses shared format conversions.
- Added integration tests for no-editor/no-color and successful conversion paths, capturing applied edits to verify replacements while reusing the existing fixtures.
- Cleared the convert-format backlog item to reflect the completed command work.

**Follow-ups**
- Consider offering format presets or remembering the last chosen conversion per language when iterating on status bar and hover quick actions.

---

## 2025-11-25 (Session 25)

**Context**
- Picked up the Phase 1 quick actions item to wire command shortcuts into the status bar tooltip and hover tooltips.

**Done**
- Added `appendQuickActions` helper plus localized labels, reused it in the status bar tooltip, and trusted the markdown so command links execute.
- Updated the hover provider to append quick actions across literal, variable, and class tooltips while reusing the shared helper.
- Extended hover and status bar tests to assert the new quick action links, then re-ran the full `npm test` suite (403 passing).

**Decisions**
- Centralize quick action rendering via a shared utility so future surfaces (e.g., hover footers, palette entries) stay consistent.

**Follow-ups**
- Explore expanding the quick action set (e.g., “Find usages”) once UX sign-off arrives and monitor feedback on command ordering.

---

## 2025-11-25 (Session 26)

**Context**
- Implemented an opt-in telemetry path for the new quick actions so usage analytics respect user consent.

**Done**
- Added `colorbuddy.enableTelemetry` setting (default off) and a `Telemetry` service that only records quick action events when users opt in.
- Routed hover/status bar quick action links through a wrapper command that logs telemetry before delegating to the underlying command and encodes the surface in the payload.
- Updated quick action helper/tests to verify the new command URI, added telemetry-focused unit coverage, and ran `npm test -- --grep "Quick action command"` to validate the new suite.
- Documented the telemetry toggle in `README.md` and refreshed the backlog to track post-launch feedback.

**Decisions**
- Use a shared execute command wrapper so future quick action surfaces can reuse telemetry gating without duplicating logic.

**Follow-ups**
- Revisit telemetry once we have backend wiring (replace console logging with real reporting) and determine additional events worth tracking post opt-in.

---

## 2025-11-25 (Session 27)

**Context**
- Expanded the quick action set to cover the remaining Phase 1 commands for faster access from hover and the status bar.

**Done**
- Added localized quick action labels for “Find usages” and “Show palette”, wired the commands into the shared `appendQuickActions` helper, and verified both hover/status bar payloads include the new entries.
- Updated hover/status bar tests to assert the additional targets and re-ran `npm test -- --grep "Default language literal pipeline"` (covers quick action suites) to confirm everything stays green.

**Decisions**
- Keep quick action ordering focused on most common tasks (copy, convert) while surfacing discovery tools afterward; revisit ordering if telemetry/feedback suggests otherwise.

**Follow-ups**
- Monitor adoption of the expanded quick actions and gather UX input before adding any further commands or reordering.


---

## 2025-11-26 (Session 28)

**Context**
- Locked down telemetry configuration so credentials never live in VS Code settings.

**Done**
- Added a reusable environment loader (`src/utils/env.ts`) that hydrates `.env` files via `dotenv` and exposes telemetry secrets.
- Updated `Telemetry` to read the endpoint/credentials from the environment, handle API key or basic auth headers, and drop the manifest setting.
- Implemented an API telemetry reporter (`src/services/apiTelemetryReporter.ts`) that posts queued batches to the configured endpoint and records response metadata.
- Documented the new workflow in `README.md`, committed `.env.example`, and ignored `.env` to keep secrets local.
- Ran `npm run compile` and `npm test -- --grep "telemetry"` to revalidate the build and telemetry suites.
- Captured follow-up notes in `docs/telemetry-notes.md` so the telemetry implementation can resume smoothly later.

**Decisions**
- Use environment variables as the short-term secret store; revisit VS Code `SecretStorage` once the backend stabilizes.

**Follow-ups**
- Add a lightweight reload hook or command if backend credential rotation becomes frequent.
- Complete the actual backend wiring once the production reporter is available.


## 2025-11-26 (Session 29)

**Context**
- Kicked off planning for the next enhancement cycle after the telemetry infrastructure landed.

**Done**
- Pruned `.github/backlog.md` to remove completed testing/tooling items and align remaining entries with the current feature set.
- Added new backlog bullets for hover copy affordances, hover color naming/brightness metadata, and related test coverage so upcoming work is traceable.
- Reviewed future enhancements and selected the immediate focus areas (hover copy UI, shared usage identifier helper, hover color insights, real-workspace perf traces).

**Decisions**
- Tackle hover copy affordances first, followed by shared usage identifier consolidation, then color naming/brightness, while scheduling real-workspace perf logging alongside implementation work.

**Follow-ups**
- Start implementing hover copy affordances using `colorbuddy.copyColorAs` and add regression coverage.
- Plan a pass to consolidate usage metric helpers across status bar and hover surfaces.
- Prototype color naming and brightness utilities for hover tooltips and expand integration fixtures.
- Schedule perfLogger runs against large workspaces to validate refresh tuning.

---
