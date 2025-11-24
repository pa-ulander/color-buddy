# ColorBuddy Backlog

Prioritized tasks and ideas grouped by area. Update statuses as work progresses and link to relevant files or issues when possible.

## Decorations & Visuals
- [x] Review swatch alignment in mixed Tailwind/CSS variable usage across additional sample files (`src/services/extensionController.ts`).
- [ ] Extend inline decorations to other formats (e.g., `lab()` or `color(display-p3 ...)`) once detection is implemented (`src/services/colorDetector.ts`).

## Sass & Language Support
- [ ] Confirm Sass color picker behavior in workspaces with custom language IDs or syntaxes (`extensionController.ensureDocumentIndexed`).
- [ ] Explore adding Less/Stylus parity tests similar to Sass coverage (`src/test/integration`).

## Performance & Caching
- [x] Benchmark decoration refresh cost in large files (`StateManager`, `Cache`).
- [ ] Outline throttling or batching strategies informed by benchmark findings (`StateManager`, `Cache`).
- [ ] Investigate using incremental indexing for very large workspaces (`CSSParser`).

## Documentation & Release
- [ ] Expand docs with a “How decorations work” section and troubleshooting tips (`README.md`).
- [ ] Prepare marketing copy/screenshots for the next marketplace update (`img/`, `README.md`).

## Testing & Tooling
- [x] Add regression test ensuring Tailwind class detection skips CSS variable names (covering recent fix).
- [ ] Evaluate adding smoke tests for key commands (e.g., `colorbuddy.showColorPalette`).

---

**Usage Tips**
- Add new items under the appropriate heading; create new headings if needed.
- Include file paths or test names to speed up navigation.
- Move completed items to the worklog entry where they were finished if additional context is helpful.
