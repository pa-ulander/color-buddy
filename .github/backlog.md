# ColorBuddy Backlog

Prioritized tasks and ideas grouped by area. Update statuses as work progresses and link to relevant files or issues when possible.

## Status Legend

- `[todo]` Not started yet.
- `[doing]` Currently being worked on.
- `[done]` Completed; move details to `worklog.md` and prune from this list once logged.

## Board Overview

- **Doing**: Nothing currently in progress.
- **Next Up**: Merge Option 2 (convert-at-definition) to dev; manual testing of convert-at-definition feature.
- **Done**: Session 62 (Dec 23) - **Option 2 Implementation Complete (Phase 3 Edge Cases)**: Fixed 2 failing findColorUsages tests (workspace folder mock + text search matches); added circular reference edge case test (verifies protection via visited Set); all 449 tests passing; feature branch ready for merge (`Testing & Tooling`, `Commands & Quick Actions`). Session 61 (Dec 23) - **Fixed Accessibility Panel Links + Cross-Project Search (VERIFIED WORKING)**: Fixed broken definition links in summary panel using TDD (changed from simple URI to command:vscode.open format); constrained Find Usages to current project only (added getActiveWorkspaceFolder, removed fallback to first workspace, added RelativePattern + strict path filtering with path.sep, three-layer filtering prevents cross-project results - user verified working); updated 4 link tests; added workspace mocks to test environment; all 448 tests passing (`Hover & Tooltips`, `Commands & Quick Actions`, `Testing & Tooling`). Session 58 Continuation (Dec 20-21) - **Format Conversion Panel Complete**: Fixed three bugs - (1) panel stale data causing append instead of replace (recalculate range after edit), (2) format list jumping (stable sort with predefined order), (3) convert showing for references (disabled state with strike-through for CSS vars/classes); added visual highlighting (green checkmark + border for current format); implemented TDD with 5 new tests; all 425 tests passing; manual testing verified (`Commands & Quick Actions`, `Hover & Tooltips`, `Testing & Tooling`). Session 58 - **Fixed Format Conversion Panel Logic**: Changed conversion logic to check `payload.source === 'panel'` instead of `payload.format` - fixes three bugs: (1) panel no longer refreshes when clicking formats (stops jumpiness), (2) editor now updates correctly when clicking formats, (3) Convert quick action works again (opens panel); added 'panel' to ConvertColorCommandSource type; all 420 tests passing (`Commands & Quick Actions`). Session 57 - **Fixed WCAG Panel UI Bug**: Both "Contrast on white" and "Contrast on black" accordions now expand by default in WCAG TEST RESULTS panel; removed conditional expansion logic that only opened first sample (`Hover & Tooltips`). Session 56 - **10x Search Performance Optimization**: Replaced 10 sequential searches with single regex search using VS Code's native ripgrep - reduced search time from 100+ seconds to 1-3 seconds in large Laravel projects; added progressive results streaming (updates every 5 matches); enhanced panel UI with animated progress indicator, live match counter, and format variation display (`Commands & Quick Actions`, `Performance & Caching`). Session 55 - Fixed three critical performance issues plus made search configurable: (1) Disabled 2-second refresh interval causing dev slowness; (2) Fixed VSIX package bloat - excluded 238+ development files, reduced from 596 to 32 files, VSIX loads in 1-2 seconds; (3) Optimized Find Usages - uses VS Code's native findTextInFiles (ripgrep) with smart fallback, completes in 1-2 seconds with native search or ~10 seconds max with fallback; (4) Added configurable `searchExcludePatterns` setting so users can customize which directories to skip when searching (`Decorations & Visuals`, `Documentation & Release`, `Commands & Quick Actions`). Session 54 - Fixed 44 failing tests (JSON parsing in quick actions, performance test timeout, quick action order expectations), added strict TDD enforcement rules, fixed panel routing bug ("Test Accessibility" now opens WCAG TEST RESULTS panel), fixed Find Usages zero results bug (now always finds at least one match by including metadata and using exact clicked text) - all 417 tests passing (`Testing & Tooling`, `Commands & Quick Actions`). Session 53 - Added "Display summary" quick action, implemented go-to-definition (ctrl+click) navigation for colors, fixed panel opening behavior, removed auto-panel opening on color selection (`Commands & Quick Actions`, `Hover & Tooltips`). Session 52 - Fixed HTML file decoration persistence (tab switching, double swatches, script tag disappearance), added 2-second refresh interval (`Decorations & Visuals`). Session 51 - Removed all telemetry code and .env configuration from extension (v0.0.4 will ship without telemetry) (`Telemetry`, `Documentation & Release`).

## Decorations & Visuals

*   [done] HTML file decorations now persist correctly across tab switches, extension activation, and embedded contexts (Session 52: `src/services/extensionController.ts`).
*   [done] Double swatches in HTML `<style>` tags and inline styles eliminated via context filtering (Session 52: `src/services/extensionController.ts`).
*   [done] Literal colors in `<script>` tags now persist via ColorBuddy provider (Session 52: `src/services/extensionController.ts`).
*   [done] Disabled 2-second polling refresh interval that was causing severe performance degradation; restored event-driven approach with existing handlers (Session 55: `src/services/extensionController.ts`).
*   [todo] Review swatch alignment in mixed Tailwind/CSS variable usage across additional sample files (`src/services/extensionController.ts`).
*   [todo] Extend inline decorations to other formats (e.g., `lab()` or `color(display-p3 ...)`) once detection is implemented (`src/services/colorDetector.ts`).

## Hover & Tooltips

*   [done] Accessibility panel definition links now use working `command:vscode.open?` format instead of broken simple URI format - copied implementation from WCAG panel (Session 61: `src/services/accessibilityViewProvider.ts`, `src/test/integration/accessibilityViewLinks.test.ts`).
*   [done] Convert quick action now shows as disabled (strike-through `~~\`Convert\`~~`) for CSS variables, Tailwind classes, and CSS classes since they cannot be directly converted - only literal colors show enabled convert (Session 58 Continuation: `src/utils/quickActions.ts`, `src/utils/commandPayloads.ts`).
*   [done] Quick actions in tooltips use native markdown formatting (code blocks + strike-through) due to VS Code security constraints - no custom CSS/HTML allowed in hover providers (Session 58 Continuation: `src/utils/quickActions.ts`).
*   [todo] Gather feedback on the new WCAG layout and copy icon hover affordance shipped in Session 23 (`src/services/provider.ts`, `src/utils/quickActions.ts`).
*   [todo] Explore advanced color formats (Lab/LCH/OKLCH) once detection support lands (`src/utils/colorFormatConversions.ts`).
*   [todo] Add optional multi-background accessibility comparisons in hover/status bar tooltips (`src/services/provider.ts`).

## Status Bar & UI Elements

*   [todo] Collect feedback on the hover/status bar usage metrics, new WCAG layout, and copy icon affordances to see if additional formatting tweaks are required (`src/services/provider.ts`, `src/services/extensionController.ts`).

## Commands & Quick Actions

*   [done] **Option 2: Convert-at-Definition - COMPLETE (Session 59, 62)** - Implementation finished with all tests passing: TDD approach with Registry lookup tests (Phase 1), handler implementation with 6 helper methods (Phase 2), UI updates removing disabled state (Phase 3), localization strings (Phase 4), integration tests (Phase 5); edge cases tested (nested variables, circular refs, Tailwind classes, format variations); 449 tests passing; feature branch `feature/convert-at-definition` ready to merge to dev (`src/services/extensionController.ts`, `src/services/registry.ts`, `src/utils/quickActions.ts`, `src/test/integration/convertAtDefinition.test.ts`).
*   [done] **Find Usages Constrained to Current Project Only** - Fixed cross-project search bug in multi-root workspaces: added getActiveWorkspaceFolder() (no fallback to first workspace), used RelativePattern for VS Code API constraint, added strict path filtering with path.sep (prevents prefix matching), three-layer filtering ensures results only from active file's project; search now rejects results from sibling projects (e.g., ~/projects/tailwind-color-gutter when working in ~/projects/colorbuddy) (Session 61: `src/services/extensionController.ts`, `src/test/integration/reindexCommand.test.ts`).
*   [done] **Format Conversion Panel Feature Complete** - All bugs fixed and manually tested: (1) Panel data refreshes correctly after each conversion (recalculates range), (2) Format list maintains stable order (predefined sort), (3) Convert action disabled for references with strike-through UI, (4) Visual highlighting shows current format with green checkmark + border (Session 58 Continuation: `src/services/extensionController.ts`, `src/services/accessibilityViewProvider.ts`, `src/utils/colorFormatConversions.ts`, `src/utils/quickActions.ts`, `src/utils/commandPayloads.ts`).
*   [done] Format conversion logic fixed to check `payload.source === 'panel'` instead of `payload.format` - correctly distinguishes quick action clicks (should open panel) from panel format clicks (should convert in editor); added 'panel' to ConvertColorCommandSource type (Session 58: `src/services/extensionController.ts`, `src/types/commands.ts`).
*   [done] Format conversion panel receives editor context and renders correctly - shows "Converting: [color]" header, displays all format variations with convert + copy icons, builds proper command URIs with complete payload (Session 58: `src/services/accessibilityViewProvider.ts`).
*   [done] **CRITICAL PERFORMANCE FIX** - Find Usages optimized with single regex search: Replaced 10 sequential native searches with ONE regex pattern using alternation `(?:pattern1|pattern2|...)`, reduced search time from 100+ seconds to 1-3 seconds in large workspaces; added progressive results streaming (updates panel every 5 matches); enhanced UI with animated progress bar, spinning loader, and live match counter (Session 56: `src/services/extensionController.ts`, `src/services/accessibilityViewProvider.ts`).
*   [done] "Display summary" quick action added as first button in tooltips, opens ACCESSIBILITY SUMMARY panel (Session 53: `src/utils/quickActions.ts`, `src/l10n/localization.ts`).
*   [done] Go-to-definition (ctrl+click) navigation implemented for CSS variables, Tailwind classes, and CSS classes via DefinitionProvider (Session 53: `src/services/extensionController.ts`).
*   [done] Auto-opening of accessibility panel on color selection removed; panel now opens only via explicit quick action (Session 53: `src/services/extensionController.ts`).
*   [done] Accessibility Summary panel now displays the same content as hover tooltips when a color is clicked/selected, with working copy functionality using command URIs and codicons (`src/services/extensionController.ts`, `src/services/accessibilityViewProvider.ts`).
*   [done] Find Usages panel working - command handler and panel rendering implemented, results display correctly with clickable file links (`src/services/extensionController.ts`, `src/services/accessibilityViewProvider.ts`, `src/types/commands.ts`).
*   [done] Third panel renamed from "Variable contexts" to "Find usages" with new data structures and rendering for search results (`package.json`, `src/services/accessibilityViewProvider.ts`).
*   [done] Find Usages command refactored to accept payload from tooltips, search all color format variations, and display in panel instead of QuickPick (`src/services/extensionController.ts`, `src/services/provider.ts`).
*   [todo] Test go-to-definition with nested CSS variable references and complex Tailwind configs (`src/services/extensionController.ts`).
*   [todo] Consider adding "Peek Definition" support for inline preview of color declarations (`src/services/extensionController.ts`).
*   [todo] Monitor feedback on the expanded quick action set and new ordering (Display summary first) (`src/utils/quickActions.ts`, `src/services/provider.ts`, `src/services/extensionController.ts`).
*   [done] Accessibility Activity Bar view is back to four native panels (Summary, WCAG checks, Variable Contexts, and Format conversions) so each section has its own collapsible viewlet again (`package.json`, `src/services/accessibilityViewProvider.ts`).
*   [done] Summary panel renders the key accessibility report sections (summary card, WCAG checks, and variable contexts) so UX can review results without switching panels, while format conversions remain available in their dedicated view (`src/services/accessibilityViewProvider.ts`).
*   [done] Activity Bar accessibility report view now adopts VS Code-style panels/toolbar layout per the sample references (`src/services/extensionController.ts`, `src/services/accessibilityViewProvider.ts`, `README.md`).
*   [done] Accessibility report layout now mirrors the official VS Code webview view sample by loading `media/webview/reset.css` + `vscode.css` and relying on the native Activity Bar toolbar (`src/services/accessibilityViewProvider.ts`, `media/webview/*.css`).
*   [done] Accessibility Activity Bar view now exposes just two native panels—Summary (with metadata, contexts, formats) and Test Results (WCAG samples)—matching the revised UX request (`package.json`, `src/services/accessibilityViewProvider.ts`, `src/l10n/localization.ts`).
*   [done] Accessibility Activity Bar view now uses a single collapsible "Accessibility test results" panel (summary view) that renders all content in one stack (`package.json`, `src/services/accessibilityViewProvider.ts`, `src/services/extensionController.ts`).
*   [todo] Gather user feedback on the updated Activity Bar accessibility panel and queue any follow-up polish (`src/services/extensionController.ts`, `src/services/accessibilityViewProvider.ts`, `README.md`).
*   [done] Hover/status bar quick actions now forward usage counts plus CSS variable/Tailwind metadata to the Activity Bar accessibility report so payload-only invocations render full context (`src/services/extensionController.ts`, `src/services/provider.ts`, `src/utils/accessibilityMetadata.ts`, `src/services/accessibilityViewProvider.ts`).
*   [todo] Coordinate with PR owners to fast-forward or close `feature/quick-action-convert` now that its payload code path has merged into `feature/webviews`; mirror any required clean-up in GitHub (`git branch`, related PR).
*   [done] Status bar quick actions now include accessibility payload args so the Test Accessibility command receives normalized colors (`src/services/extensionController.ts`, `src/test/extension.test.ts`).
*   [done] Convert quick action consumes hover/status bar context so caret placement is optional when triggering Convert (`src/services/provider.ts`, `src/services/extensionController.ts`, `src/utils/commandPayloads.ts`).
*   [done] Accessibility quick action now reuses hover/status bar payloads, so it no longer needs an active editor and the command output mirrors the hover summary (`src/services/provider.ts`, `src/services/extensionController.ts`, `src/types/commands.ts`, `src/test/extension.test.ts`).
*   [done] Accessibility command results use a notice-style summary (plain text with PASS/FAIL icons) so notifications match the hover layout while respecting VS Code notification styling limits (`src/utils/accessibilityFormatting.ts`, `src/services/extensionController.ts`, `src/test/integration/reindexCommand.test.ts`).


## Sass & Language Support

## Performance & Caching

*   [done] **CRITICAL OPTIMIZATION** - Find Usages now uses single regex search with VS Code's native ripgrep instead of 10 sequential searches - 10x performance improvement (Session 56: `src/services/extensionController.ts`).
*   [done] Added progressive results streaming - panel updates every 5 matches for real-time feedback during search (Session 56: `src/services/extensionController.ts`).
*   [done] Added diagnostic logging for search performance troubleshooting - logs pattern length, exclude configs, workspace folders, callback counts, and timing breakdown (Session 56: `src/services/extensionController.ts`).
*   [todo] Benchmark decoration refresh cost in large files (`StateManager`, `Cache`).
*   [todo] Outline throttling or batching strategies informed by benchmark findings (`StateManager`, `Cache`).
*   [todo] Pool decoration types and skip unchanged refresh chunks to cut refresh allocations (`StateManager`, `extensionController`).
*   [todo] Capture real-world perfLogger traces in large workspaces to validate scheduler tuning (`perfLogger`, `StateManager`) — initial analyzer script (`scripts/analyze-perf-log.js`) ready; still need sampling from sizable projects.
*   [todo] Evaluate decoration chunk/yield thresholds using analyzer output and update scheduler defaults (`extensionController`, `StateManager`) — cooperative yielding landed, still need real-workspace validation.
*   [todo] Investigate using incremental indexing for very large workspaces (`CSSParser`).
*   [todo] Gather perf logs from noisy production-like workspaces (multiple CSS pipelines, background tasks) to confirm scheduler resilience once access is available.

## Documentation & Release
*   [done] Updated `copilot-instructions.md` with Find Usages implementation details, test infrastructure patterns, and debugging tips (Session 50) (`.github/copilot-instructions.md`).
*   [done] Restructured `future-enhancements.md` to separate completed features from planned roadmap (Session 50) (`.github/future-enhancements.md`).*   [todo] Expand docs with a “How decorations work” section and troubleshooting tips (`README.md`).
*   [todo] Prepare marketing copy/screenshots for the next marketplace update (`img/`, `README.md`).

## Testing & Tooling
*   [done] All 448 tests passing after Session 61 work (420 baseline + 5 quickActions tests + 4 updated accessibility link tests + workspace mocks) (`npm test`).
*   [done] Added workspace folder mocks to test environment - mockWorkspaceFolder with test path, mocked workspace.workspaceFolders and workspace.getWorkspaceFolder() for integration tests (Session 61: `src/test/integration/reindexCommand.test.ts`).
*   [done] Updated 4 accessibility link tests to expect command:vscode.open format instead of simple URI format (Session 61: `src/test/integration/accessibilityViewLinks.test.ts`).
*   [done] Created comprehensive quickActions test suite with 5 tests verifying disabled state rendering for CSS variables, Tailwind classes, and CSS class names - uses TDD approach (Session 58 Continuation: `src/test/utils/quickActions.test.ts`).
*   [done] All 425 tests passing after Session 58 Continuation work (420 baseline + 5 new quickActions tests) (`npm test`).
*   [done] 
*   [done] Fixed 44 failing tests caused by bugs in Sessions 51-53: JSON parsing errors in quick action tests, performance test timeout from background interval, and outdated quick action order expectations (Session 54: `src/test/extension.test.ts`, `src/services/extensionController.ts`).
*   [done] Added strict TDD (Test-Driven Development) enforcement rules to copilot instructions - made RULE ZERO with mandatory workflow and prominent warnings (Session 54: `.github/copilot-instructions.md`).
*   [done] Skip `htmlRefreshInterval` in test mode using `context.extensionMode === vscode.ExtensionMode.Test` to prevent timing issues and test interference (Session 54: `src/services/extensionController.ts`).
*   [todo] Extend CSS variable fixtures per language to cover non-literal scenarios (var usage) (`src/test/integration/cssVariableIntegration.test.ts`).

---

**Usage Tips**

*   Add new items under the appropriate heading; create new headings if needed.
*   Include file paths or test names to speed up navigation.
*   Move completed items (tagged `[done]`) to the worklog entry where they were finished, then remove them from this backlog after logging.