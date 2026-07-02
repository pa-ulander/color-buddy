import { BasePanelProvider } from '../base/BasePanelProvider';
import type { AccessibilityViewData } from '../../accessibilityViewProvider';
import { t, LocalizedStrings } from '../../../l10n/localization';

/**
 * Panel 1: Display Summary
 * Shows color preview, metadata, variable contexts, WCAG status, and available formats.
 */
export class SummaryPanelProvider extends BasePanelProvider {
	protected getTitle(): string {
		return 'Color Summary';
	}

	protected getEmptyStateMessage(): string {
		return 'Hover on a CSS rule or color in the editor to see a quick accessibility summary.';
	}

	protected renderContent(data: AccessibilityViewData | null): string {
		if (!data) {
			return this.renderEmptyState();
		}

		return this.renderSummaryCards(data);
	}

	private renderSummaryCards(data: AccessibilityViewData): string {
		const parts: string[] = [];

		// Card 1: Color Information
		parts.push(this.renderColorInfoCard(data));

		// Card 2: WCAG Status
		parts.push(this.renderWCAGCard(data));

		// Card 3: Available Formats
		if (data.conversions.length > 0) {
			parts.push(this.renderFormatsCard(data));
		}

		return `<div class="cb-stack">${parts.join('\n')}</div>`;
	}

	private renderColorInfoCard(data: AccessibilityViewData): string {
		const headerType = data.cssVariableName
			? 'CSS VARIABLE'
			: data.tailwindClass
			? 'TAILWIND CLASS'
			: data.cssClassName
			? 'CSS CLASS'
			: 'CSS CLASS';

		const infoItems: string[] = [];

		if (data.cssVariableName) {
			infoItems.push(`
				<div>
					<p style="margin-bottom: 0.25rem; color: var(--vscode-descriptionForeground); font-size: 0.85rem;">${this.escapeHtml(t(LocalizedStrings.TOOLTIP_VARIABLE))}</p>
					<p><code>${this.escapeHtml(data.cssVariableName)}</code></p>
				</div>
			`);
		}

		infoItems.push(`
			<div>
				<p style="margin-bottom: 0.25rem; color: var(--vscode-descriptionForeground); font-size: 0.85rem;">Closest CSS color</p>
				<p><strong>${this.escapeHtml(data.colorName)}</strong> <code>${this.escapeHtml(data.colorHex)}</code></p>
			</div>
		`);

		infoItems.push(`
			<div>
				<p style="margin-bottom: 0.25rem; color: var(--vscode-descriptionForeground); font-size: 0.85rem;">Perceptual brightness</p>
				<p><strong>${data.brightness}%</strong></p>
			</div>
		`);

		let variableContextsHtml = '';
		if (data.variableContexts && data.variableContexts.length > 0) {
			variableContextsHtml = '<div style="margin-top: 1rem; padding-top: 1rem; border-top: 1px solid var(--vscode-sideBarSectionHeader-border);">';

			for (const context of data.variableContexts) {
				let cssColor = context.resolvedValue;
				if (/^\d+(\.\d+)?\s+\d+(\.\d+)?%\s+\d+(\.\d+)?%/.test(cssColor)) {
					cssColor = `hsl(${cssColor})`;
				}

				const swatchStyle = `width: 10px; height: 10px; border-radius: 2px; background: ${this.escapeHtml(cssColor)}; border: 1px solid white; display: inline-block; vertical-align: middle; margin-right: 0.5rem;`;
				const uriWithFragment = `${context.uri.toString()}#${context.line + 1}`;
				const args = [uriWithFragment];
				const encodedArgs = encodeURIComponent(JSON.stringify(args));
				const commandUri = `command:vscode.open?${encodedArgs}`;

				variableContextsHtml += `
					<p style="margin: 0.5rem 0;">
						<span style="${swatchStyle}"></span>
						<strong>${this.escapeHtml(context.label)}:</strong> <code>${this.escapeHtml(context.resolvedValue)}</code>
					</p>
					<p style="font-size: 0.85rem; color: var(--vscode-descriptionForeground); margin: 0 0 0.5rem 1.5rem;">
						${this.escapeHtml(t(LocalizedStrings.TOOLTIP_DEFINED_IN))} <a href="${commandUri}" style="color: var(--vscode-textLink-foreground); text-decoration: none;">${this.escapeHtml(context.location)}</a>
					</p>
				`;
			}

			variableContextsHtml += '</div>';
		}

		const chips: string[] = [];
		if (typeof data.usageCount === 'number') {
			chips.push(`<span class="cb-chip">Usage count: ${data.usageCount}</span>`);
		}
		if (data.cssVariableName) {
			chips.push(`<span class="cb-chip">${this.escapeHtml(t(LocalizedStrings.TOOLTIP_VARIABLE))}: ${this.escapeHtml(data.cssVariableName)}</span>`);
		}

		const chipsHtml = chips.length > 0 ? `<div class="cb-chip-row">${chips.join('\n')}</div>` : '';

		return `
			<section class="cb-card">
				<header class="cb-section-header">
					<div>
						<p class="cb-eyebrow">${this.escapeHtml(headerType)}</p>
						<h2 style="font-size: 1.5rem; font-weight: 400; color: var(--vscode-editor-foreground);">${this.escapeHtml(data.label)}</h2>
					</div>
					<div class="cb-swatch" style="background:${this.escapeHtml(data.normalizedColor)}; width: 4rem; height: 4rem;"></div>
				</header>
				<div class="cb-summary-grid">${infoItems.join('\n')}</div>
				${variableContextsHtml}
				${chipsHtml}
			</section>
		`;
	}

	private renderWCAGCard(data: AccessibilityViewData): string {
		const parts: string[] = [];

		parts.push(`
			<section class="cb-card">
				<header class="cb-section-header">
					<div>
						<p class="cb-eyebrow">WCAG STATUS</p>
						<h3 style="display: flex; align-items: center; gap: 0.5rem;">
							<span>Color</span>
							<code style="font-size: 0.9rem; font-weight: normal;">${this.escapeHtml(data.normalizedColor)}</code>
						</h3>
					</div>
				</header>
		`);

		for (const sample of data.report.samples) {
			const ratio = sample.contrastRatio.toFixed(2);
			parts.push(`
				<details class="cb-accordion" open>
					<summary>
						<span>${this.escapeHtml(sample.label)}</span>
						<span class="cb-ratio">${ratio}:1</span>
					</summary>
					<div class="cb-accordion-body">
			`);

			for (const check of sample.checks) {
				const pass = check.outcome === 'pass';
				parts.push(`
					<div class="cb-check">
						<span class="cb-check-icon ${pass ? 'cb-pass' : 'cb-fail'}">${pass ? '&#x2714;' : '&#x2716;'}</span>
						<span>${this.escapeHtml(check.label)}</span>
					</div>
				`);
			}

			parts.push(`
					</div>
				</details>
			`);
		}

		parts.push(`</section>`);

		return parts.join('\n');
	}

	private renderFormatsCard(data: AccessibilityViewData): string {
		const parts: string[] = [];

		parts.push(`
			<section class="cb-card">
				<header class="cb-section-header">
					<div>
						<p class="cb-eyebrow">${this.escapeHtml(t(LocalizedStrings.TOOLTIP_FORMATS_AVAILABLE))}</p>
						<h3>Available formats</h3>
					</div>
				</header>
				<div style="display: flex; flex-direction: column; gap: 0.5rem; margin-top: 0.5rem;">
		`);

		for (const conversion of data.conversions) {
			const formatLabel = this.getFormatLabel(conversion.format);
			const copyTitle = t(LocalizedStrings.COMMAND_QUICK_ACTION_COPY);

			const payload = {
				value: conversion.value,
				format: conversion.format,
				source: 'statusBar' as const
			};
			const encodedPayload = encodeURIComponent(JSON.stringify(payload));
			const commandUri = `command:colorbuddy.copyColorAs?${encodedPayload}`;

			parts.push(`
				<div style="display: flex; align-items: center; justify-content: space-between; padding: 8px 0;">
					<div style="display: flex; align-items: baseline; gap: 0.5rem;">
						<strong style="min-width: 100px; text-transform: uppercase; font-size: 0.75rem; color: var(--vscode-descriptionForeground);">${this.escapeHtml(formatLabel)}:</strong>
						<code style="font-size: 0.9rem; color: var(--vscode-textLink-foreground);">${this.escapeHtml(conversion.value)}</code>
					</div>
					<a href="${commandUri}"
						title="${this.escapeHtml(copyTitle)}"
						style="color: #ffffff; text-decoration: none; cursor: pointer; transition: opacity 0.2s;"
						onmouseover="this.style.opacity='0.7'"
						onmouseout="this.style.opacity='1'">
						<i class="codicon codicon-copy" style="font-size: 16px;"></i>
					</a>
				</div>
			`);
		}

		parts.push(`
				</div>
			</section>
		`);

		return parts.join('\n');
	}

	private getFormatLabel(format: string): string {
		switch (format) {
			case 'hex': return 'Hex';
			case 'hexAlpha': return 'Hex';
			case 'rgb': return 'RGB';
			case 'rgba': return 'RGBA';
			case 'hsl': return 'HSL';
			case 'hsla': return 'HSLA';
			case 'tailwindHsl': return 'Tailwind';
			default: return format;
		}
	}
}
