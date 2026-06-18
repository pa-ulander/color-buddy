import * as vscode from 'vscode';
import { BasePanelProvider } from '../base/BasePanelProvider';
import type { AccessibilityViewData, AccessibilityUsageMatch } from '../../accessibilityViewProvider';
import type { FormatConversion } from '../../../utils/colorFormatConversions';
import { t, LocalizedStrings } from '../../../l10n/localization';

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

		// Bulk conversion button
		const bulkConversionSection = matches.length > 1 ? `
			<div style="margin-top: 16px; padding: 12px; background: var(--vscode-editor-background); border-radius: 4px; text-align: center;">
				<button id="bulk-convert-button" class="cb-bulk-button">
					<span class="codicon codicon-replace-all"></span>
					${t(LocalizedStrings.COMMAND_CONVERT_COLOR_BULK_CONVERT)}
				</button>
				<p style="margin: 8px 0 0 0; font-size: 0.85em; color: var(--vscode-descriptionForeground);">
					${t(LocalizedStrings.COMMAND_CONVERT_COLOR_BULK_CONVERT_HINT)}
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
		const conversionItems = formatVariations.map((conversion) => {
			const label = this.getFormatLabel(conversion.format);
			const isCurrent = conversion.format === currentFormat;
			const isInitialSelect = isCurrent;

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
			const convertIcon = `<a href="${convertCommandUri}" class="cb-icon-button" title="${t(LocalizedStrings.COMMAND_CONVERT_COLOR_REPLACE_TITLE, label)}"><i class="codicon codicon-replace"></i></a>`;

			// Copy functionality
			const copyPayload = {
				value: conversion.value,
				format: conversion.format,
				label: label
			};
			const copyEncodedPayload = encodeURIComponent(JSON.stringify(copyPayload));
			const copyCommandUri = `command:colorbuddy.copyColorAs?${copyEncodedPayload}`;
			const copyIcon = `<a href="${copyCommandUri}" class="cb-icon-button" title="${t(LocalizedStrings.COMMAND_CONVERT_COLOR_COPY_TITLE)}"><i class="codicon codicon-copy"></i></a>`;

			// Radio button for bulk conversion
			const matchIdPrefix = `match-${match.uri.toString().replace(/[^a-z0-9]/gi, '-')}-${match.range.start.line}-${match.range.start.character}`;
			const radioName = `format-${matchIdPrefix}`;
			
			return `
				<li class="cb-format-row ${isCurrent ? 'cb-current' : ''}">
					<input type="radio" 
						name="${this.escapeHtml(radioName)}" 
						value="${this.escapeHtml(conversion.format)}" 
						${isInitialSelect ? 'checked' : ''} 
						data-uri="${this.escapeHtml(match.uri.toString())}"
						data-start-line="${match.range.start.line}"
						data-start-char="${match.range.start.character}"
						data-end-line="${match.range.end.line}"
						data-end-char="${match.range.end.character}"
						data-normalized="${this.escapeHtml(data.normalizedColor)}"
						data-original="${this.escapeHtml(match.previewText.trim())}"
						class="cb-radio">
					<div class="cb-format-info">
						<span class="cb-format-label">${this.escapeHtml(label)}</span>
						<code class="cb-format-code">${this.escapeHtml(conversion.value)}</code>
					</div>
					<div class="cb-format-actions">
						${copyIcon}
						${convertIcon}
					</div>
				</li>
			`;
		}).join('');

		// Open file link
		const openEncodedPayload = encodeURIComponent(JSON.stringify([match.uri, { selection: match.range }]));
		const openCommandUri = `command:vscode.open?${openEncodedPayload}`;

		return `
			<details class="cb-usage-box" open>
				<summary class="cb-usage-header">
					<span class="codicon codicon-chevron-right"></span>
					<a href="${openCommandUri}" class="cb-file-link">
						${this.escapeHtml(fileName)}:${lineNumber}
					</a>
				</summary>
				<div class="cb-usage-content">
					<div class="cb-code-preview">
						${this.escapeHtml(match.previewText)}
					</div>
					<ul class="cb-format-list">
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

	protected getCustomScripts(): string {
		return `
			<script>
				(function() {
					const vscode = acquireVsCodeApi();
					const bulkButton = document.getElementById('bulk-convert-button');
					
					if (bulkButton) {
						bulkButton.addEventListener('click', () => {
							const selectedFormats = [];
							const radios = document.querySelectorAll('input[type="radio"]:checked');
							
							radios.forEach(radio => {
								selectedFormats.push({
									uri: radio.getAttribute('data-uri'),
									range: {
										start: { 
											line: parseInt(radio.getAttribute('data-start-line')), 
											character: parseInt(radio.getAttribute('data-start-char')) 
										},
										end: { 
											line: parseInt(radio.getAttribute('data-end-line')), 
											character: parseInt(radio.getAttribute('data-end-char')) 
										}
									},
									format: radio.value,
									normalizedColor: radio.getAttribute('data-normalized'),
									originalText: radio.getAttribute('data-original')
								});
							});
							
							vscode.postMessage({
								command: 'bulkConvert',
								conversions: selectedFormats
							});
						});
					}
				})();
			</script>
		`;
	}

	protected handleMessage(message: any): void {
		if (message.command === 'bulkConvert') {
			// Trigger a custom internal command or handle directly via extension controller
			// For now, we'll use a new command we'll register in ExtensionController
			vscode.commands.executeCommand('colorbuddy.bulkConvertColorFormat', message.conversions);
		}
	}

	protected getCustomStyles(): string {
		return `<style>
			.cb-usage-box {
				margin-bottom: 12px;
				border: 1px solid var(--vscode-panel-border);
				border-radius: 4px;
				background: var(--vscode-sideBar-background);
				overflow: hidden;
			}
			
			.cb-usage-header {
				cursor: pointer;
				padding: 4px 8px;
				background: var(--vscode-sideBarSectionHeader-background);
				user-select: none;
				display: flex;
				align-items: center;
				font-size: 12px;
				font-weight: 600;
				list-style: none; /* Hide default triangle */
			}
			
			.cb-usage-header::-webkit-details-marker {
				display: none; /* Hide for Safari */
			}
			
			.cb-usage-header .codicon-chevron-right {
				margin-right: 6px;
				transition: transform 0.1s ease;
			}
			
			.cb-usage-box[open] .cb-usage-header .codicon-chevron-right {
				transform: rotate(90deg);
			}
			
			.cb-file-link {
				color: var(--vscode-textLink-foreground);
				text-decoration: none;
			}
			
			.cb-file-link:hover {
				text-decoration: underline;
			}
			
			.cb-usage-content {
				padding: 8px 12px;
				border-top: 1px solid var(--vscode-panel-border);
			}
			
			.cb-code-preview {
				margin-bottom: 8px;
				padding: 6px;
				background: var(--vscode-editor-background);
				border: 1px solid var(--vscode-panel-border);
				border-radius: 3px;
				font-family: var(--vscode-editor-font-family);
				font-size: 11px;
				color: var(--vscode-descriptionForeground);
				white-space: pre-wrap;
				word-break: break-all;
			}
			
			.cb-format-list {
				list-style: none;
				margin: 0;
				padding: 0;
			}
			
			.cb-format-row {
				display: grid;
				grid-template-columns: auto auto auto 1fr;
				align-items: center;
				gap: 12px;
				padding: 6px 8px;
				border-bottom: 1px solid transparent;
			}
			
			.cb-format-row:last-child {
				border-bottom: none;
			}
			
			.cb-format-row:hover {
				background: var(--vscode-list-hoverBackground);
			}
			
			.cb-radio {
				margin: 0 !important;
				cursor: pointer;
			}
			
			.cb-format-info {
				display: contents !important;
			}
			
			.cb-format-label {
				display: inline-block !important;
				font-size: 11px !important;
				font-weight: 600 !important;
				color: var(--vscode-foreground) !important;
				text-align: right;
				padding-right: 8px;
				opacity: 1 !important;
				visibility: visible !important;
			}
			
			.cb-format-code {
				display: inline-block !important;
				font-family: var(--vscode-editor-font-family) !important;
				font-size: 11px !important;
				color: var(--vscode-foreground) !important;
				background: var(--vscode-textCodeBlock-background) !important;
				padding: 2px 6px;
				border-radius: 3px;
				white-space: nowrap;
				opacity: 1 !important;
				visibility: visible !important;
			}
			
			.cb-format-actions {
				display: flex;
				gap: 6px;
				justify-content: flex-end;
			}
			
			.cb-icon-button {
				display: flex;
				align-items: center;
				justify-content: center;
				width: 22px;
				height: 22px;
				color: var(--vscode-textLink-foreground);
				text-decoration: none;
				border-radius: 3px;
				cursor: pointer;
			}
			
			.cb-icon-button:hover {
				background: var(--vscode-toolbar-hoverBackground);
			}
			
			.cb-icon-button .codicon {
				font-size: 14px;
			}
		</style>`;
	}
}
