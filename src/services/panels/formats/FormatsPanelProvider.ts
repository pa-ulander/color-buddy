import { BasePanelProvider } from '../base/BasePanelProvider';
import type { AccessibilityViewData, AccessibilityUsageMatch } from '../../accessibilityViewProvider';
import type { FormatConversion } from '../../../utils/colorFormatConversions';

/**
 * Panel 4: Format Conversions
 * Shows each usage match with expandable conversion options.
 * Uses the same search results as UsagesPanelProvider.
 */
export class FormatsPanelProvider extends BasePanelProvider {
	protected getTitle(): string {
		return 'Format Conversions';
	}

	protected getEmptyStateMessage(): string {
		return 'Trigger "Convert" to convert between various color formats.';
	}

	protected renderContent(data: AccessibilityViewData | null): string {
		if (!data) {
			return this.renderEmptyState();
		}

		// Only render if we have conversions and usage matches
		const shouldRender = (data.usageMatches && data.usageMatches.length > 0) || (data.colorName?.includes('Searching') && data.searchValue);
		
		if (!shouldRender) {
			return this.renderEmptyState();
		}

		return this.renderConversionPanel(data);
	}

	private renderConversionPanel(data: AccessibilityViewData): string {
		const matches = (data.usageMatches || []).filter(match => match.isConvertible !== false);
		const isSearching = data.colorName?.includes('Searching');
		const searchValue = data.searchValue || data.label;
		const formatVariations = data.conversions || [];

		// Progress section when search is active
		const progressSection = isSearching ? `
			<div style="padding: 12px; background: var(--vscode-editor-background); border-radius: 4px; margin-bottom: 12px;">
				<div style="height: 4px; background: var(--vscode-progressBar-background); border-radius: 2px; overflow: hidden; position: relative;">
					<div style="position: absolute; top: 0; left: 0; right: 0; bottom: 0; background: var(--vscode-progressBar-background); animation: cb-progress 2s ease-in-out infinite;"></div>
				</div>
				<p style="margin: 8px 0 0 0; font-size: 0.9em; color: var(--vscode-descriptionForeground);">
					Looking for ${formatVariations.length} format variation${formatVariations.length !== 1 ? 's' : ''}
					${matches.length > 0 ? ` • Found ${matches.length} match${matches.length !== 1 ? 'es' : ''} so far` : ''}
				</p>
				${formatVariations.length > 0 && formatVariations.length <= 5 ? `
					<details style="margin-top: 8px;">
						<summary style="cursor: pointer; font-size: 0.9em; color: var(--vscode-descriptionForeground);">Show formats</summary>
						<ul style="margin: 4px 0 0 0; padding-left: 20px; font-size: 0.85em; color: var(--vscode-descriptionForeground);">
							${formatVariations.slice(0, 10).map(f => `<li><code>${this.escapeHtml(f.value)}</code></li>`).join('')}
						</ul>
					</details>
				` : ''}
			</div>
		` : '';

		const resultsText = isSearching
			? `${matches.length} found so far...`
			: `${matches.length} result${matches.length !== 1 ? 's' : ''}`;

		// Render each match as an expandable conversion box
		const matchBoxes = matches.map(match => this.renderMatchConversionBox(match, data, formatVariations)).join('');

		// Bulk conversion button (future feature)
		const bulkConversionSection = matches.length > 1 ? `
			<div style="margin-top: 16px; padding: 12px; background: var(--vscode-editor-background); border-radius: 4px; text-align: center;">
				<button style="
					padding: 8px 16px;
					background: var(--vscode-button-background);
					color: var(--vscode-button-foreground);
					border: none;
					border-radius: 4px;
					cursor: pointer;
					font-size: 0.9em;
					font-weight: 500;
				" disabled>
					<span class="codicon codicon-replace-all" style="margin-right: 6px;"></span>
					Bulk Convert (Coming Soon)
				</button>
				<p style="margin: 8px 0 0 0; font-size: 0.85em; color: var(--vscode-descriptionForeground);">
					Select formats using radio buttons, then convert all matches at once.
				</p>
			</div>
		` : '';

		return `
			<section class="cb-card">
				<header class="cb-section-header">
					<div>
						<p class="cb-eyebrow">Format Conversions</p>
						<h4>Convert: ${this.escapeHtml(searchValue)}</h4>
					</div>
					<div class="cb-toolbar-meta">
						<span>${resultsText}</span>
					</div>
				</header>
				${progressSection}
				${matchBoxes}
				${bulkConversionSection}
			</section>
		`;
	}

	/**
	 * Render an expandable conversion box for a single match.
	 */
	private renderMatchConversionBox(match: AccessibilityUsageMatch, data: AccessibilityViewData, formatVariations: FormatConversion[]): string {
		const fileName = match.relativePath || match.uri.fsPath.split('/').pop() || 'file';
		const lineNumber = match.range.start.line + 1;

		// Detect current format at this location
		const currentFormat = this.detectCurrentFormat(match, formatVariations);

		// Build conversion list for this specific match
		const conversionItems = formatVariations.map(conversion => {
			const label = this.getFormatLabel(conversion.format);
			const isCurrent = conversion.format === currentFormat;

			// Convert command payload
			const convertPayload = {
				uri: match.uri.toString(),
				range: {
					start: { line: match.range.start.line, character: match.range.start.character },
					end: { line: match.range.end.line, character: match.range.end.character }
				},
				normalizedColor: data.normalizedColor,
				originalText: match.previewText.trim(),
				format: conversion.format,
				source: 'panel' as const
			};
			const convertEncodedPayload = encodeURIComponent(JSON.stringify(convertPayload));
			const convertCommandUri = `command:colorbuddy.convertColorFormat?${convertEncodedPayload}`;
			const convertIcon = `<a href="${convertCommandUri}" class="cb-convert-icon" title="Convert to ${this.escapeHtml(label)}" style="color: var(--vscode-textLink-foreground); text-decoration: none; cursor: pointer; margin-right: 0.5rem;"><i class="codicon codicon-symbol-color"></i></a>`;

			// Copy functionality
			const copyPayload = {
				value: conversion.value,
				format: conversion.format,
				label: label
			};
			const copyEncodedPayload = encodeURIComponent(JSON.stringify(copyPayload));
			const copyCommandUri = `command:colorbuddy.copyColorAs?${copyEncodedPayload}`;
			const copyIcon = `<a href="${copyCommandUri}" class="cb-copy-icon" title="Copy to clipboard" style="opacity: 0.7; cursor: pointer;"><i class="codicon codicon-copy"></i></a>`;

			// Show green checkmark for current format
			const checkmark = isCurrent ? `<span class="cb-format-check">✓</span>` : `<span class="cb-format-check" style="visibility: hidden;">✓</span>`;

			return `
				<li class="cb-format-item ${isCurrent ? 'cb-current' : ''}" data-format="${this.escapeHtml(conversion.format)}" style="display: flex; align-items: center; padding: 4px 0; font-size: 0.9em; list-style: none;">
					${checkmark}
					<div style="flex: 1; margin-left: 0.5rem;">
						<strong style="margin-right: 0.5em;">${this.escapeHtml(label)}:</strong>
						<code style="background: var(--vscode-textCodeBlock-background); padding: 2px 4px; border-radius: 3px;">${this.escapeHtml(conversion.value)}</code>
					</div>
					${convertIcon}${copyIcon}
				</li>
			`;
		}).join('');

		// Open file link
		const openEncodedPayload = encodeURIComponent(JSON.stringify([match.uri, { selection: match.range }]));
		const openCommandUri = `command:vscode.open?${openEncodedPayload}`;

		return `
			<details class="cb-usage-box" open style="margin-bottom: 12px; border: 1px solid var(--vscode-panel-border); border-radius: 4px; padding: 8px;">
				<summary style="cursor: pointer; font-weight: 500; margin-bottom: 8px;">
					<a href="${openCommandUri}" style="color: var(--vscode-textLink-foreground); text-decoration: none;">
						${this.escapeHtml(fileName)}:${lineNumber}
					</a>
				</summary>
				<div style="padding-left: 12px; border-left: 2px solid var(--vscode-textLink-foreground); margin-left: 4px;">
					<code style="display: block; margin-bottom: 8px; font-size: 0.85em; color: var(--vscode-descriptionForeground);">${this.escapeHtml(match.previewText)}</code>
					<ul class="cb-list cb-format-list" style="margin: 0; padding: 0;">
						${conversionItems}
					</ul>
				</div>
			</details>
		`;
	}

	/**
	 * Detect which format is currently used at this match location.
	 * Returns the format string, or null if not detected.
	 */
	private detectCurrentFormat(match: AccessibilityUsageMatch, formatVariations: FormatConversion[]): string | null {
		const currentColorText = match.previewText.trim();

		// Find which format is actually at this location by looking for exact matches
		// We need to find the LONGEST match to avoid substring issues
		let currentFormat: string | null = null;
		let longestMatch = '';

		for (const conv of formatVariations) {
			const normalized = (str: string) => str.trim().toLowerCase().replace(/\s+/g, '');
			const convNormalized = normalized(conv.value);
			const textNormalized = normalized(currentColorText);

			// Check for exact word boundary match (not just substring)
			if (textNormalized.includes(convNormalized) && convNormalized.length > longestMatch.length) {
				// Verify it's not just a substring of another format
				const beforeIdx = textNormalized.indexOf(convNormalized);
				const beforeChar = beforeIdx > 0 ? currentColorText[beforeIdx - 1] : ' ';
				const afterIdx = textNormalized.indexOf(convNormalized) + convNormalized.length;
				const afterChar = afterIdx < textNormalized.length ? textNormalized[afterIdx] : ' ';

				// Accept if it's not surrounded by alphanumeric chars (i.e., it's a complete token)
				if (!/[a-z0-9]/.test(beforeChar) && !/[a-z0-9]/.test(afterChar)) {
					longestMatch = convNormalized;
					currentFormat = conv.format;
				}
			}
		}

		return currentFormat;
	}

	private getFormatLabel(format: string): string {
		switch (format) {
			case 'hex': return 'Hex';
			case 'hexAlpha': return 'Hex (with alpha)';
			case 'rgb': return 'RGB';
			case 'rgba': return 'RGBA';
			case 'hsl': return 'HSL';
			case 'hsla': return 'HSLA';
			case 'tailwindHsl': return 'Tailwind HSL';
			default: return format.toUpperCase();
		}
	}
}
