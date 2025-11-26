# Telemetry Implementation Notes

Use this checklist to resume telemetry work later.

## Current State

- Telemetry queue batches hover/status bar/color insight events and posts JSON payloads through `ApiTelemetryReporter`.
- Endpoint, API key header, and optional basic-auth credentials load from `.env` via `initializeEnvironment()`.
- Tests run with telemetry enabled still rely on stub callbacks; integration with a real backend is pending.
- Default retry logic requeues batches and respects `Retry-After` when the server responds with a non-2xx status code.

## Outstanding Tasks

1. **Backend validation**
   - Hit the actual `/colorbuddy/metrics` endpoint and confirm success responses include request IDs / retry headers.
   - Decide on payload schema versioning and document required fields for the backend team.
2. **Secret management**
   - Evaluate migrating credentials from `.env` to VS Code `SecretStorage` or an external keychain.
   - Investigate a reload signal/command so the reporter picks up rotated credentials without reloading the window.
3. **Observability**
   - Add debug logging toggle or performance counters to measure queue depth, flush frequency, and failure rates.
   - Consider exposing a command that dumps the pending queue for diagnostics.
4. **Testing**
   - Add unit/integration tests around `ApiTelemetryReporter` using nock or an HTTP test double.
   - Capture contract tests once the backend stabilizes to guard against payload regressions.
5. **Error handling UX**
   - Plan user-facing messaging (status bar / notification) when telemetry fails repeatedly while opt-in is enabled.

## Quick Start Checklist (When Resuming)

- Ensure `.env` contains up-to-date credentials (`COLORBUDDY_TELEMETRY_ENDPOINT`, API key or basic auth).
- Launch `npm run watch` and `npm run watch-tests` for rapid feedback.
- Use `npm test -- --grep "telemetry"` to validate fast after changes.
- For manual verification, enable telemetry in VS Code settings and interact with hover/status bar to enqueue events.
- Monitor the output panel for `[cb] telemetry` logs to confirm flush success or retry behaviour.

## Reference Material

- Reviewed: [VS Code Telemetry Extension Guide](https://code.visualstudio.com/api/extension-guides/telemetry)
   - Highlights: prefer `@vscode/extension-telemetry` when possible, always respect `isTelemetryEnabled` / `onDidChangeTelemetryEnabled`, tag custom settings with `telemetry` and `usesOnlineServices`, minimize collected data, avoid PII, and document events via `telemetry.json` when applicable.
   - Suggested follow-up: use the VS Code CLI with `--telemetry` to inspect emitted events and consider adding a `telemetry.json` file so ColorBuddy’s events appear in the dump.

## Decision Log

- Short term: secrets stay in `.env`; evaluate SecretStorage once backend contract is finalized.
- Reporter retries using exponential-equivalent delays (10s default) until a better backoff strategy is defined.
- No user-facing UI for credential entry yet; deferred until backend deployment timeline is clear.
