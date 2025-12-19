import * as vscode from 'vscode';
import type { AccessibilityReport } from '../types';
import type { FormatConversion } from '../utils/colorFormatConversions';
import { t, LocalizedStrings } from '../l10n/localization';

export interface AccessibilityViewData {
	label: string;
	normalizedColor: string;
	colorName: string;
	colorHex: string;
	brightness: number;
	report: AccessibilityReport;
	conversions: FormatConversion[];
	usageCount?: number;
	cssVariableName?: string;
	tailwindClass?: string;
	cssClassName?: string;
	variableContexts?: AccessibilityVariableContext[];
	usageMatches?: AccessibilityUsageMatch[];
	searchValue?: string;
	currentFormatValue?: string;
	editorRange?: vscode.Range;
	editorUri?: string;
	section?: 'summary' | 'contrast' | 'contexts' | 'formats';
}

export interface AccessibilityVariableContext {
	label: string;
	value: string;
	resolvedValue: string;
	location: string;
	uri: vscode.Uri;
	line: number;
}

export interface AccessibilityUsageMatch {
	uri: vscode.Uri;
	range: vscode.Range;
	previewText: string;
	relativePath: string;
}

export type AccessibilityPanelSection = 'summary' | 'contrast' | 'contexts' | 'formats';

export interface AccessibilityReportPresenter extends vscode.WebviewViewProvider {
	readonly viewId: string;
	updateReport(data: AccessibilityViewData, section?: AccessibilityPanelSection): void;
	reveal(preserveFocus?: boolean): void;
	revealSection(section: AccessibilityPanelSection, preserveFocus?: boolean): void;
	getSectionProviders(): AccessibilitySectionProvider[];
	getLastRenderedData(): AccessibilityViewData | null;
}

const PANEL_STYLE_FILES = ['reset.css', 'vscode.css'] as const;
const SECTION_VIEW_IDS: Record<AccessibilityPanelSection, string> = {
	summary: 'colorbuddy.accessibilitySummary',
	contrast: 'colorbuddy.accessibilityContrast',
	contexts: 'colorbuddy.accessibilityContexts',
	formats: 'colorbuddy.accessibilityFormats'
};

interface SectionRenderOptions {
	embed?: boolean;
}

export class AccessibilityViewProvider implements AccessibilityReportPresenter {
	private readonly providers: Record<AccessibilityPanelSection, AccessibilitySectionProvider>;
	private lastRenderedData: AccessibilityViewData | null = null;

	constructor(extensionUri: vscode.Uri) {
		this.providers = {
			summary: new AccessibilitySectionProvider(extensionUri, 'summary'),
			contrast: new AccessibilitySectionProvider(extensionUri, 'contrast'),
			contexts: new AccessibilitySectionProvider(extensionUri, 'contexts'),
			formats: new AccessibilitySectionProvider(extensionUri, 'formats')
		};
	}

	get viewId(): string {
		return SECTION_VIEW_IDS.summary;
	}

	resolveWebviewView(webviewView: vscode.WebviewView, context: vscode.WebviewViewResolveContext, token: vscode.CancellationToken): void {
		this.providers.summary.resolveWebviewView(webviewView, context, token);
	}

	getSectionProviders(): AccessibilitySectionProvider[] {
		return Object.values(this.providers);
	}

	updateReport(data: AccessibilityViewData, section?: AccessibilityPanelSection): void {
		this.lastRenderedData = data;
		if (section) {
			// Update only the specified section
			const provider = this.providers[section];
			if (provider) {
				provider.updateReport(data);
			}
		} else {
			// Update all sections (legacy behavior)
			for (const provider of Object.values(this.providers)) {
				provider.updateReport(data);
			}
		}
	}

	revealSection(section: AccessibilityPanelSection, preserveFocus?: boolean): void {
		const provider = this.providers[section];
		if (!provider) {
			return;
		}
		provider.reveal(preserveFocus);
	}

	getLastRenderedData(): AccessibilityViewData | null {
		return this.lastRenderedData;
	}

	reveal(preserveFocus?: boolean): void {
		this.revealSection('summary', preserveFocus);
	}
}

export class AccessibilitySectionProvider implements vscode.WebviewViewProvider {
	private view: vscode.WebviewView | null = null;
	private pendingData: AccessibilityViewData | null = null;

	constructor(private readonly extensionUri: vscode.Uri, readonly section: AccessibilityPanelSection) {}

	get viewId(): string {
		return SECTION_VIEW_IDS[this.section];
	}

	resolveWebviewView(webviewView: vscode.WebviewView, _context: vscode.WebviewViewResolveContext, _token: vscode.CancellationToken): void {
		this.view = webviewView;
		webviewView.webview.options = {
			enableScripts: true,
			enableCommandUris: true,
			localResourceRoots: [this.extensionUri]
		};
		this.render(webviewView, this.pendingData);

		webviewView.onDidDispose(() => {
			if (this.view === webviewView) {
				this.view = null;
			}
		});
	}

	updateReport(data: AccessibilityViewData): void {
		this.pendingData = data;
		if (this.view) {
			this.render(this.view, data);
		}
	}

	reveal(preserveFocus?: boolean): void {
		if (this.view) {
			this.view.show?.(preserveFocus);
			return;
		}
		void vscode.commands.executeCommand(`${this.viewId}.focus`);
	}

	private render(view: vscode.WebviewView, data: AccessibilityViewData | null): void {
		view.webview.html = this.buildHtml(view.webview, data);
	}

	private buildHtml(webview: vscode.Webview, data: AccessibilityViewData | null): string {
		const styleLinks = PANEL_STYLE_FILES.map(fileName => {
			const uri = webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'media', 'webview', fileName));
			return `<link rel="stylesheet" href="${uri}">`;
		}).join('\n');

		const codiconsUri = webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'node_modules', '@vscode', 'codicons', 'dist', 'codicon.css'));
		
		return `<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8" />
	<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; font-src ${webview.cspSource}; script-src ${webview.cspSource} 'unsafe-inline';" />
	<meta name="viewport" content="width=device-width, initial-scale=1.0" />
	<title>${this.escapeHtml(t(LocalizedStrings.TOOLTIP_ACCESSIBILITY))}</title>
	<link href="${codiconsUri}" rel="stylesheet" />
	${styleLinks}
	<style>
		:root { color-scheme: light dark; }
		body {
			padding: 1rem;
			background: var(--vscode-sideBar-background);
			color: var(--vscode-sideBar-foreground);
		}
		.cb-stack {
			display: flex;
			flex-direction: column;
			gap: 1rem;
		}
		.cb-card {
			background: var(--vscode-panelSection-background, var(--vscode-editor-background));
			border: 1px solid var(--vscode-panelSection-border, var(--vscode-sideBarSectionHeader-border));
			border-radius: 8px;
			padding: 1rem;
			box-shadow: 0 1px 2px rgba(0, 0, 0, 0.15);
		}
		.cb-section-header {
			display: flex;
			justify-content: space-between;
			align-items: center;
			gap: 1rem;
			margin-bottom: 1rem;
		}
		.cb-eyebrow {
			text-transform: uppercase;
			letter-spacing: 0.08em;
			font-size: 0.75rem;
			color: var(--vscode-descriptionForeground);
			margin: 0 0 0.2rem;
		}
		.cb-section-header h2,
		.cb-section-header h3 {
			margin: 0;
		}
		.cb-toolbar {
			display: flex;
			align-items: center;
			gap: 0.75rem;
		}
		.cb-toolbar-meta span {
			display: block;
			font-size: 0.65rem;
			letter-spacing: 0.08em;
			text-transform: uppercase;
			color: var(--vscode-descriptionForeground);
		}
		.cb-toolbar-meta code {
			display: block;
			margin-top: 0.15rem;
		}
		.cb-swatch {
			width: 3rem;
			height: 3rem;
			border-radius: 999px;
			border: 2px solid var(--vscode-sideBar-foreground);
			flex-shrink: 0;
		}
		.cb-summary-grid {
			display: grid;
			grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
			gap: 1rem;
		}
		.cb-chip-row {
			display: flex;
			flex-wrap: wrap;
			gap: 0.5rem;
			margin-top: 1rem;
		}
		.cb-chip {
			background: var(--vscode-badge-background);
			color: var(--vscode-badge-foreground);
			border-radius: 999px;
			padding: 0.18rem 0.75rem;
			font-size: 0.85rem;
		}
		.cb-accordion {
			border: 1px solid var(--vscode-sideBarSectionHeader-border);
			border-radius: 8px;
			margin: 0.5rem 0;
			background: var(--vscode-sideBarSectionHeader-background, var(--vscode-editorWidget-background));
		}
		.cb-accordion summary {
			cursor: pointer;
			list-style: none;
			display: flex;
			justify-content: space-between;
			align-items: center;
			gap: 0.75rem;
			padding: 0.6rem 0.9rem;
			font-weight: 600;
		}
		.cb-accordion summary::-webkit-details-marker { display: none; }
		.cb-accordion-body { padding: 0 0.9rem 0.75rem; }
		.cb-ratio {
			font-size: 0.85rem;
			color: var(--vscode-descriptionForeground);
		}
		.cb-check {
			display: flex;
			align-items: center;
			gap: 0.5rem;
			padding: 0.25rem 0;
		}
		.cb-check-icon { font-weight: bold; }
		.cb-pass { color: #22c55e; }
		.cb-fail { color: #ef4444; }
		.cb-context-entry {
			border: 1px solid var(--vscode-sideBarSectionHeader-border);
			border-radius: 6px;
			padding: 0.6rem 0.75rem;
			margin-bottom: 0.5rem;
			background: var(--vscode-sideBarSectionHeader-background, transparent);
		}
		.cb-context-label { font-weight: 600; margin-bottom: 0.25rem; }
		.cb-context-source { font-size: 0.85rem; color: var(--vscode-descriptionForeground); }
		.cb-list {
			list-style: none;
			padding-left: 0;
			margin: 0;
			display: flex;
			flex-direction: column;
			gap: 0.35rem;
		}
		.cb-empty {
			text-align: center;
			padding: 2rem 1rem;
			border: 1px dashed var(--vscode-sideBarSectionHeader-border);
			border-radius: 8px;
			color: var(--vscode-descriptionForeground);
		}
		code {
			background: var(--vscode-textCodeBlock-background, rgba(110,118,129,0.3));
			padding: 0.1rem 0.35rem;
			border-radius: 4px;
			font-size: 0.9em;
		}
		.copy-button {
			cursor: pointer;
			opacity: 0.7;
			transition: opacity 0.2s;
		}
		.copy-button:hover {
			opacity: 1;
		}
	</style>
</head>
<body>
	${this.getSectionContent(data)}
</body>
</html>`;
	}

	private getSectionContent(data: AccessibilityViewData | null): string {
		if (!data) {
			return this.renderEmptyStateForSection();
		}

		switch (this.section) {
			case 'summary':
				return this.renderSummarySection(data);
			case 'contrast':
				return this.renderContrastSection(data);
			case 'contexts':
				return this.renderContextsSection(data);
			case 'formats':
				return this.renderFormatsSection(data);
			default:
				return this.renderEmptyState();
		}
	}

	private renderEmptyStateForSection(): string {
		let message: string;
		switch (this.section) {
			case 'summary':
				message = 'Click on a CSS rule or color in the editor to see an accessibility summary.';
				break;
			case 'contrast':
				message = 'Trigger "Test accessibility" to see accessibility test results.';
				break;
			case 'contexts':
				message = 'Trigger "Find usages" to see where a color is used in your codebase.';
				break;
			case 'formats':
				message = 'Trigger "Convert" to convert between various color formats.';
				break;
			default:
				message = t(LocalizedStrings.ACCESSIBILITY_VIEW_EMPTY_HINT);
		}
		return this.renderEmptyState(message);
	}

	private renderEmptyState(message?: string): string {
		const label = message ?? t(LocalizedStrings.ACCESSIBILITY_VIEW_EMPTY_HINT);
		return `
			<div class="cb-empty">
				<p>${this.escapeHtml(label)}</p>
			</div>
		`;
	}

	private renderSummarySection(data: AccessibilityViewData): string {
		// Render the complete tooltip-style summary
		return this.renderTooltipStyleSummary(data);
	}

	private renderTooltipStyleSummary(data: AccessibilityViewData): string {
		const parts: string[] = [];

		// Main card container
		parts.push(`<section class="cb-card">`);

		// Header section with swatch and variable name
		const headerType = data.cssVariableName 
			? t(LocalizedStrings.TOOLTIP_CSS_VARIABLE)
			: data.tailwindClass
			? t(LocalizedStrings.TOOLTIP_TAILWIND_CLASS)
			: data.cssClassName
			? t(LocalizedStrings.TOOLTIP_CSS_CLASS)
			: t(LocalizedStrings.TOOLTIP_COLOR_PREVIEW);

		parts.push(`
			<header class="cb-section-header">
				<div>
					<p class="cb-eyebrow">${this.escapeHtml(headerType)}</p>
					<h2><code>${this.escapeHtml(data.label)}</code></h2>
				</div>
				<div class="cb-swatch" style="background:${this.escapeHtml(data.normalizedColor)}"></div>
			</header>
		`);

		// Variable name and color insights
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
				<p style="margin-bottom: 0.25rem; color: var(--vscode-descriptionForeground); font-size: 0.85rem;">${this.escapeHtml(t(LocalizedStrings.TOOLTIP_COLOR_NAME))}</p>
				<p><strong>${this.escapeHtml(data.colorName)}</strong> <code>${this.escapeHtml(data.colorHex)}</code></p>
			</div>
		`);

		infoItems.push(`
			<div>
				<p style="margin-bottom: 0.25rem; color: var(--vscode-descriptionForeground); font-size: 0.85rem;">${this.escapeHtml(t(LocalizedStrings.TOOLTIP_BRIGHTNESS))}</p>
				<p><strong>${data.brightness}%</strong></p>
			</div>
		`);

		parts.push(`<div class="cb-summary-grid">${infoItems.join('\n')}</div>`);

		// Variable contexts if applicable - matching tooltip format
		if (data.variableContexts && data.variableContexts.length > 0) {
			parts.push(`<div style="margin-top: 1rem; padding-top: 1rem; border-top: 1px solid var(--vscode-sideBarSectionHeader-border);">`);
			
			for (const context of data.variableContexts) {
				// Parse the color value to get a valid CSS color
				// Handle Tailwind HSL format (e.g., "12 76% 61%") by wrapping in hsl()
				let cssColor = context.resolvedValue;
				if (/^\d+(\.\d+)?\s+\d+(\.\d+)?%\s+\d+(\.\d+)?%/.test(cssColor)) {
					// Tailwind HSL format - wrap in hsl()
					cssColor = `hsl(${cssColor})`;
				}
				
				// Inline swatch matching tooltip style
				const swatchStyle = `width: 10px; height: 10px; border-radius: 2px; background: ${this.escapeHtml(cssColor)}; border: 1px solid white; display: inline-block; vertical-align: middle; margin-right: 0.5rem;`;
				
				// Create clickable link to file location
				const fileLink = `${context.uri.toString()}#L${context.line + 1}`;
				
				parts.push(`
					<p style="margin: 0.5rem 0;">
						<span style="${swatchStyle}"></span>
						<strong>${this.escapeHtml(context.label)}:</strong> <code>${this.escapeHtml(context.resolvedValue)}</code>
					</p>
					<p style="font-size: 0.85rem; color: var(--vscode-descriptionForeground); margin: 0 0 0.5rem 1.5rem;">
						${this.escapeHtml(t(LocalizedStrings.TOOLTIP_DEFINED_IN))} <a href="${fileLink}" style="color: var(--vscode-textLink-foreground); text-decoration: none;">${this.escapeHtml(context.location)}</a>
					</p>
				`);
			}
			
			parts.push(`</div>`);
		}

		// Usage count and Variable chip
		const chips: string[] = [];
		if (typeof data.usageCount === 'number') {
			chips.push(`<span class="cb-chip">${this.escapeHtml(t(LocalizedStrings.STATUS_BAR_USAGE_COUNT))}: ${data.usageCount}</span>`);
		}
		if (data.cssVariableName) {
			chips.push(`<span class="cb-chip">${this.escapeHtml(t(LocalizedStrings.TOOLTIP_VARIABLE))}: ${this.escapeHtml(data.cssVariableName)}</span>`);
		}
		
		if (chips.length > 0) {
			parts.push(`<div class="cb-chip-row">${chips.join('\n')}</div>`);
		}

		parts.push(`</section>`);

		// WCAG Status as separate card
		parts.push(`
			<section class="cb-card">
				<header class="cb-section-header">
					<div>
						<p class="cb-eyebrow">${this.escapeHtml(t(LocalizedStrings.TOOLTIP_WCAG_STATUS))}</p>
						<h3>${this.escapeHtml(t(LocalizedStrings.TOOLTIP_COLOR))}</h3>
					</div>
					<div class="cb-toolbar-meta">
						<code>${this.escapeHtml(data.normalizedColor)}</code>
					</div>
				</header>
		`);

		// Contrast checks as accordions
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

		// Available formats as separate card
		if (data.conversions.length > 0) {
			parts.push(`
				<section class="cb-card">
					<header class="cb-section-header">
						<div>
							<p class="cb-eyebrow">${this.escapeHtml(t(LocalizedStrings.TOOLTIP_FORMATS_AVAILABLE))}</p>
							<h3>${this.escapeHtml(t(LocalizedStrings.TOOLTIP_FORMATS_AVAILABLE))}</h3>
						</div>
					</header>
					<ul class="cb-list">
			`);
			
			for (const conversion of data.conversions) {
				// Get format label (RGB, RGBA, HSLA, etc.)
				const formatLabel = this.getFormatLabel(conversion.format);
				const copyTitle = t(LocalizedStrings.COMMAND_QUICK_ACTION_COPY);
				
				// Create command URI with payload - same as tooltips
				const payload = {
					value: conversion.value,
					format: conversion.format,
					source: 'statusBar' as const
				};
				const encodedPayload = encodeURIComponent(JSON.stringify(payload));
				const commandUri = `command:colorbuddy.copyColorAs?${encodedPayload}`;
				
				parts.push(`
					<li>
						<strong>${this.escapeHtml(formatLabel)}:</strong> 
						<a href="${commandUri}" 
							title="${this.escapeHtml(copyTitle)}"
							style="color: var(--vscode-textLink-foreground); text-decoration: none;">
							<code>${this.escapeHtml(conversion.value)}</code> <span class="codicon codicon-clippy"></span>
						</a>
					</li>
				`);
			}
			
			parts.push(`
					</ul>
				</section>
			`);
		}
		
		return `<div class="cb-stack">${parts.join('\n')}</div>`;
	}

	private renderSummaryCard(data: AccessibilityViewData): string {
		const chips = this.renderMetadataChips(data);
		return `
			<section class="cb-card">
				<header class="cb-section-header">
					<div>
						<p class="cb-eyebrow">${this.escapeHtml(t(LocalizedStrings.TOOLTIP_ACCESSIBILITY))}</p>
						<h2>${this.escapeHtml(data.label)}</h2>
					</div>
					<div class="cb-toolbar">
						<div class="cb-swatch" style="background:${this.escapeHtml(data.normalizedColor)}"></div>
						<div class="cb-toolbar-meta">
							<span>${this.escapeHtml(t(LocalizedStrings.TOOLTIP_COLOR))}</span>
							<code>${this.escapeHtml(data.normalizedColor)}</code>
						</div>
					</div>
				</header>
				<div class="cb-summary-grid">
					<div>
						<p>${this.escapeHtml(t(LocalizedStrings.TOOLTIP_COLOR_NAME))}</p>
						<p><strong>${this.escapeHtml(data.colorName)}</strong> <code>${this.escapeHtml(data.colorHex)}</code></p>
					</div>
					<div>
						<p>${this.escapeHtml(t(LocalizedStrings.TOOLTIP_BRIGHTNESS))}</p>
						<p><strong>${data.brightness}%</strong></p>
					</div>
				</div>
				${chips}
			</section>
		`;
	}

	private renderContrastSection(data: AccessibilityViewData, options?: SectionRenderOptions): string {
		const contrastBody = this.renderContrastBody(data, options);
		if (options?.embed) {
			return contrastBody;
		}

		const stack: string[] = [];
		stack.push(this.renderSummaryCard(data));
		if (contrastBody) {
			stack.push(contrastBody);
		} else {
			stack.push(this.renderEmptyState(t(LocalizedStrings.ACCESSIBILITY_VIEW_EMPTY_CONTRAST)));
		}
		const contexts = this.renderContextsSection(data, { embed: true });
		if (contexts) {
			stack.push(contexts);
		}
		return `<div class="cb-stack">${stack.join('\n')}</div>`;
	}

	private renderContrastBody(data: AccessibilityViewData, options?: SectionRenderOptions): string {
		if (!data.report.samples.length) {
			return options?.embed ? '' : '';
		}
		const details = data.report.samples.map((sample, index) => {
			const ratio = sample.contrastRatio.toFixed(2);
			const checks = sample.checks.map(check => {
				const pass = check.outcome === 'pass';
				return `
					<div class="cb-check">
						<span class="cb-check-icon ${pass ? 'cb-pass' : 'cb-fail'}">${pass ? '&#x2714;' : '&#x2716;'}</span>
						<span>${this.escapeHtml(check.label)}</span>
					</div>
				`;
			}).join('');
			const shouldOpen = options?.embed ? true : index === 0;
			return `
				<details class="cb-accordion" ${shouldOpen ? 'open' : ''}>
					<summary>
						<span>${this.escapeHtml(sample.label)}</span>
						<span class="cb-ratio">${ratio}:1</span>
					</summary>
					<div class="cb-accordion-body">
						${checks}
					</div>
				</details>
			`;
		}).join('');

		const card = `
			<section class="cb-card">
				<header class="cb-section-header">
					<div>
						<p class="cb-eyebrow">${this.escapeHtml(t(LocalizedStrings.TOOLTIP_WCAG_STATUS))}</p>
						<h3>${this.escapeHtml(t(LocalizedStrings.ACCESSIBILITY_VIEW_TEST_RESULTS_TITLE))}</h3>
					</div>
				</header>
				${details}
			</section>
		`;
		return card;
	}

	private renderContextsSection(data: AccessibilityViewData, options?: SectionRenderOptions): string {
		// If we have usage matches, display them (find usages results)
		if (data.usageMatches && data.usageMatches.length > 0) {
			return this.renderUsageMatches(data, options);
		}
		
		// Otherwise, show variable contexts if available
		const contexts = data.variableContexts ?? [];
		if (contexts.length === 0) {
			return options?.embed ? '' : this.renderEmptyState(t(LocalizedStrings.ACCESSIBILITY_VIEW_EMPTY_CONTEXTS));
		}
		const entries = contexts.map(context => {
			// Use simple URI with line fragment
			const uriString = typeof context.uri === 'string' ? context.uri : context.uri.toString();
			const lineNumber = context.line + 1;
			const uriWithFragment = `${uriString}#${lineNumber}`;
			const args = [uriWithFragment];
			const encodedArgs = encodeURIComponent(JSON.stringify(args));
			const commandUri = `command:vscode.open?${encodedArgs}`;
			
			return `
			<div class="cb-context-entry">
				<p class="cb-context-label">${this.escapeHtml(context.label)}</p>
				<p><code>${this.escapeHtml(context.resolvedValue)}</code></p>
				<p class="cb-context-source">
					${this.escapeHtml(t(LocalizedStrings.TOOLTIP_DEFINED_IN))} 
					<a href="${commandUri}" style="color: var(--vscode-textLink-foreground); text-decoration: none;">${this.escapeHtml(context.location)}</a>
				</p>
			</div>
		`;
		}).join('');

		const card = `
			<section class="cb-card">
				<header class="cb-section-header">
					<div>
						<p class="cb-eyebrow">${this.escapeHtml(t(LocalizedStrings.TOOLTIP_VARIABLE))}</p>
						<h3>${this.escapeHtml(t(LocalizedStrings.TOOLTIP_VARIABLE))}</h3>
					</div>
				</header>
				${entries}
			</section>
		`;
		return card;
	}

	private renderUsageMatches(data: AccessibilityViewData, options?: SectionRenderOptions): string {
		const matches = data.usageMatches ?? [];
		const isSearching = data.colorName && data.colorName.includes('Searching');
		const formatVariations = data.conversions || [];
		
		if (matches.length === 0 && !isSearching) {
			return options?.embed ? '' : this.renderEmptyState('No usages found');
		}

		const searchValue = data.searchValue ?? data.label;
		const entries = matches.map(match => {
			const lineNumber = match.range.start.line + 1;
			
			// Use simple URI with line/column fragment (standard VS Code format)
			const uriString = typeof match.uri === 'string' ? match.uri : match.uri.toString();
			const startChar = typeof match.range.start.character === 'number' ? match.range.start.character + 1 : 1;
			
			// Format: file:///path#L{line}:{char}
			const uriWithFragment = `${uriString}#${lineNumber}:${startChar}`;
			const args = [uriWithFragment];
			const encodedArgs = encodeURIComponent(JSON.stringify(args));
			const commandUri = `command:vscode.open?${encodedArgs}`;
			
			return `
			<div class="cb-context-entry" style="cursor: pointer;">
				<p class="cb-context-label">
					<a href="${commandUri}" style="color: var(--vscode-textLink-foreground); text-decoration: none;">
						${this.escapeHtml(match.relativePath)}:${lineNumber}
					</a>
				</p>
				<p style="font-size: 0.9em; color: var(--vscode-descriptionForeground);"><code>${this.escapeHtml(match.previewText)}</code></p>
			</div>
		`;
		}).join('');

		// Show search progress if still searching
		const progressSection = isSearching ? `
			<div style="padding: 12px; background: var(--vscode-editor-inactiveSelectionBackground); border-radius: 4px; margin-bottom: 12px;">
				<div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px;">
					<div class="codicon codicon-loading codicon-modifier-spin" style="font-size: 16px;"></div>
					<p style="margin: 0; font-weight: 500;">
						Searching workspace...
					</p>
				</div>
				<div style="margin-bottom: 8px;">
					<div style="height: 4px; background: var(--vscode-progressBar-background); border-radius: 2px; overflow: hidden;">
						<div class="cb-progress-bar" style="height: 100%; background: var(--vscode-progressBar-background); width: 100%; animation: cb-progress 1.5s ease-in-out infinite;"></div>
					</div>
				</div>
				<p style="margin: 0; font-size: 0.9em; color: var(--vscode-descriptionForeground);">
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
			<style>
				@keyframes cb-progress {
					0% { transform: translateX(-100%); }
					50% { transform: translateX(100%); }
					100% { transform: translateX(-100%); }
				}
			</style>
		` : '';

		const resultsText = isSearching 
			? `${matches.length} found so far...` 
			: `${matches.length} result${matches.length !== 1 ? 's' : ''}`;

		const card = `
			<section class="cb-card">
				<header class="cb-section-header">
					<div>
						<p class="cb-eyebrow">Find Usages</p>
						<h3>Results for: ${this.escapeHtml(searchValue)}</h3>
					</div>
					<div class="cb-toolbar-meta">
						<span>${resultsText}</span>
					</div>
				</header>
				${progressSection}
				${entries}
			</section>
		`;
		return card;
	}

	private renderFormatsSection(data: AccessibilityViewData, options?: SectionRenderOptions): string {
		if (!data.conversions.length) {
			return options?.embed ? '' : this.renderEmptyState(t(LocalizedStrings.ACCESSIBILITY_VIEW_EMPTY_FORMATS));
		}

		const currentValue = data.currentFormatValue;
		const listItems = data.conversions.map(conversion => {
			const isCurrent = conversion.value === currentValue;
			const label = this.getFormatLabel(conversion.format);
			
			// Build payload for copy command
			const payload = {
				value: conversion.value,
				format: conversion.format,
				label: label
			};
			const encodedPayload = encodeURIComponent(JSON.stringify(payload));
			const commandUri = `command:colorbuddy.copyColorAs?${encodedPayload}`;
			const copyIcon = `<a href="${commandUri}" class="cb-copy-icon" title="Copy to clipboard"><i class="codicon codicon-copy"></i></a>`;
			
			return `<li class="cb-format-item ${isCurrent ? 'cb-current' : ''}">
				<strong>${this.escapeHtml(label)}:</strong> 
				<code>${this.escapeHtml(conversion.value)}</code>
				${copyIcon}
			</li>`;
		}).join('');

		const card = `
			<section class="cb-card">
				<header class="cb-section-header">
					<div>
						<h3>${this.escapeHtml(t(LocalizedStrings.TOOLTIP_FORMATS_AVAILABLE))}</h3>
					</div>
				</header>
				<ul class="cb-list cb-format-list">
					${listItems}
				</ul>
			</section>
		`;
		return card;
	}

	private renderMetadataChips(data: AccessibilityViewData): string {
		const chips: string[] = [];
		if (typeof data.usageCount === 'number') {
			chips.push(`${this.escapeHtml(t(LocalizedStrings.STATUS_BAR_USAGE_COUNT))}: ${data.usageCount}`);
		}
		if (data.cssVariableName) {
			chips.push(`${this.escapeHtml(t(LocalizedStrings.TOOLTIP_VARIABLE))}: ${this.escapeHtml(data.cssVariableName)}`);
		}
		if (data.tailwindClass) {
			chips.push(`${this.escapeHtml(t(LocalizedStrings.TOOLTIP_TAILWIND_CLASS))}: ${this.escapeHtml(data.tailwindClass)}`);
		}
		if (data.cssClassName) {
			chips.push(`${this.escapeHtml(t(LocalizedStrings.TOOLTIP_CSS_CLASS))}: ${this.escapeHtml(data.cssClassName)}`);
		}
		if (!chips.length) {
			return '';
		}
		return `
			<div class="cb-chip-row">
				${chips.map(text => `<span class="cb-chip">${text}</span>`).join('')}
			</div>
		`;
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

	private escapeHtml(value: string): string {
		return value
			.replace(/&/g, '&amp;')
			.replace(/</g, '&lt;')
			.replace(/>/g, '&gt;')
			.replace(/"/g, '&quot;')
			.replace(/'/g, '&#39;');
	}
}
