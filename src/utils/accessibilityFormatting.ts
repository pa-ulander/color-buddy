import * as vscode from 'vscode';
import { AccessibilityReport } from '../types/accessibility';
import { t, LocalizedStrings } from '../l10n/localization';

const PASS_ICON = `<span style="color:#22c55e;">&#x2714;</span>`;
const FAIL_ICON = `<span style="color:#ef4444;">&#x2716;</span>`;

/**
 * Append a WCAG status section to the provided markdown instance without bullet lists.
 */
export function appendWcagStatusSection(markdown: vscode.MarkdownString, colorValue: string, report: AccessibilityReport): void {
	markdown.appendMarkdown(`**${t(LocalizedStrings.TOOLTIP_WCAG_STATUS)}:**\n\n`);
	markdown.appendMarkdown(`${t(LocalizedStrings.TOOLTIP_COLOR)}: \`${colorValue}\`\n\n`);

	for (const sample of report.samples) {
		const ratio = sample.contrastRatio.toFixed(2);
		markdown.appendMarkdown(`${sample.label} (${ratio}:1):\n`);
		for (const check of sample.checks) {
			const icon = check.outcome === 'pass' ? PASS_ICON : FAIL_ICON;
			markdown.appendMarkdown(`<div style="margin-left:1.25rem;">${icon}&nbsp;${check.label}</div>\n`);
		}
		markdown.appendMarkdown('\n');
	}
}
