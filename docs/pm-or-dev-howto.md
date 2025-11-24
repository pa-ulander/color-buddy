# Project Manager & Developer Guide

## Performance Debugging Workflow

Use this flow when the team needs to validate decoration scheduler changes or investigate editor refresh slowdowns.

1. Enable `colorbuddy.enablePerformanceLogging` in VS Code settings (workspace or user scope). This turns on the `perfLogger` instrumentation while the extension runs.
2. Exercise the extension in the target workspace—open large CSS-heavy files, trigger edits, and let the swatch scheduler settle.
3. Run the `ColorBuddy: Export Performance Logs` command. Save the generated Markdown trace to the repository (they land under `logs/metrics/`).
4. From the repo root, execute `npm run analyze-perf-log -- <trace-file> [--sort=avg|max|count] [--limit=n]`. The helper script at `scripts/analyze-perf-log.js` summarizes the “Performance Metrics Summary” block and highlights the slowest stages.
5. Review the observations output:
   - `applyCSSVariableDecorations` averages reveal how costly decoration rendering remains.
   - `refreshEditor.execute:*` entries expose per-editor scheduler timings (watch the max column for spikes above 200 ms).
   - `computeColorData` times help confirm parsing work stays negligible.
6. Capture the key numbers in `logs/metrics/2025-11-24-refresh-benchmark.md` (or future benchmark notes) so regressions are easy to spot during planning retros.

### Follow-up Actions

- If refresh averages exceed targets, adjust chunk sizes or debounce thresholds in `src/services/stateManager.ts` and `src/services/extensionController.ts` before repeating the workflow.
- Share analyzer output in sprint reviews to align PMs and developers on the perf budget and upcoming work.

### Scheduler Tuning Checklist

Follow these steps whenever decoration batching defaults change (for example, after enabling inter-chunk yielding in `applyCSSVariableDecorations`):

1. Re-run the “Performance Debugging Workflow” above against a large CSS-heavy workspace.
2. Confirm `refreshEditor.execute:*` metrics stay below the current budget (target <200 ms on average, <250 ms max).
3. Inspect `applyCSSVariableDecorations` averages to ensure chunk changes actually lower wall-clock time; if they rise, revisit `DECORATION_CHUNK_SIZE` and `DECORATION_CHUNK_YIELD_DELAY_MS` in `src/utils/constants.ts`.
4. Check that `computeColorData` remains inexpensive (<5 ms avg); unexpected spikes can mask decoration wins.
5. Capture the before/after numbers in `logs/metrics/*-refresh-benchmark.md` so the next iteration has a clear baseline.
