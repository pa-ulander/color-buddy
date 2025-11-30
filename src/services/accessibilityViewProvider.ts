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
}

export interface AccessibilityReportPresenter extends vscode.WebviewViewProvider {
	updateReport(data: AccessibilityViewData): void;
	reveal(preserveFocus?: boolean): void;
}

export class AccessibilityViewProvider implements AccessibilityReportPresenter {
	private view: vscode.WebviewView | null = null;
	private pendingData: AccessibilityViewData | null = null;

	constructor(private readonly extensionUri: vscode.Uri) {}

	resolveWebviewView(webviewView: vscode.WebviewView): void {
		this.view = webviewView;
		webviewView.webview.options = {
			enableScripts: false,
			localResourceRoots: [this.extensionUri]
		};
		this.render(webviewView, this.pendingData);

		webviewView.onDidDispose(() => {
			this.view = null;
		});
	}

	updateReport(data: AccessibilityViewData): void {
		this.pendingData = data;
		if (this.view) {
			this.render(this.view, data);
		}
	}

	getLastRenderedData(): AccessibilityViewData | null {
		return this.pendingData;
	}

	reveal(preserveFocus?: boolean): void {
		if (this.view && typeof this.view.show === 'function') {
			this.view.show(preserveFocus);
		}
	}

	private render(view: vscode.WebviewView, data: AccessibilityViewData | null): void {
		view.webview.html = data ? this.getReportHtml(data) : this.getPlaceholderHtml();
	}

	private getPlaceholderHtml(): string {
		return this.buildHtmlWrapper(`
			<div class="cb-empty">
				<p>${this.escapeHtml(t(LocalizedStrings.TOOLTIP_ACCESSIBILITY))}</p>
				<p>${this.escapeHtml('Trigger “Test accessibility” to see detailed contrast results.')}</p>
			</div>
		`);
	}

	private getReportHtml(data: AccessibilityViewData): string {
		const sampleSections = data.report.samples
			.map(sample => {
				const ratio = sample.contrastRatio.toFixed(2);
				const checks = sample.checks
					.map(check => {
						const pass = check.outcome === 'pass';
						return `
							<div class="cb-check">
								<span class="cb-check-icon ${pass ? 'cb-pass' : 'cb-fail'}">${pass ? '&#x2714;' : '&#x2716;'}</span>
								<span>${this.escapeHtml(check.label)}</span>
							</div>
						`;
					})
					.join('');
				return `
					<section class="cb-card">
						<header>
							<h3>${this.escapeHtml(sample.label)} <span class="cb-ratio">(${ratio}:1)</span></h3>
						</header>
						${checks}
					</section>
				`;
			})
			.join('');

		const conversionList = data.conversions.length > 0
			? `
				<section class="cb-card">
					<header>
						<h3>${this.escapeHtml(t(LocalizedStrings.TOOLTIP_FORMATS_AVAILABLE))}</h3>
					</header>
					<ul class="cb-list">
						${data.conversions.map(conversion => `<li><code>${this.escapeHtml(conversion.value)}</code></li>`).join('')}
					</ul>
				</section>
			`
			: '';

		return this.buildHtmlWrapper(`
			<section class="cb-card">
				<header>
					<h2>${this.escapeHtml(data.label)}</h2>
					<div class="cb-swatch" style="background:${this.escapeHtml(data.normalizedColor)}"></div>
				</header>
				<div class="cb-meta">
					<div>
						<p>${this.escapeHtml(t(LocalizedStrings.TOOLTIP_COLOR_NAME))}</p>
						<p><strong>${this.escapeHtml(data.colorName)}</strong> <code>${this.escapeHtml(data.colorHex)}</code></p>
					</div>
					<div>
						<p>${this.escapeHtml(t(LocalizedStrings.TOOLTIP_BRIGHTNESS))}</p>
						<p><strong>${data.brightness}%</strong></p>
					</div>
				</div>
			</section>
			${sampleSections}
			${conversionList}
		`);
	}

	private buildHtmlWrapper(bodyContent: string): string {
		return `<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8" />
	<meta name="viewport" content="width=device-width, initial-scale=1.0" />
	<title>${this.escapeHtml(t(LocalizedStrings.TOOLTIP_ACCESSIBILITY))}</title>
	<style>
		:root {
			color-scheme: light dark;
		}
		body {
			margin: 0;
			padding: 1rem;
			font-family: var(--vscode-font-family);
			font-size: var(--vscode-font-size);
			background: var(--vscode-sideBar-background);
			color: var(--vscode-sideBar-foreground);
		}
		.cb-card {
			background: var(--vscode-editor-background);
			border: 1px solid var(--vscode-sideBarSectionHeader-border);
			border-radius: 8px;
			padding: 0.75rem 1rem;
			margin-bottom: 1rem;
			box-shadow: 0 1px 2px rgba(0, 0, 0, 0.2);
		}
		.cb-card header {
			display: flex;
			justify-content: space-between;
			align-items: center;
			gap: 0.5rem;
		}
		.cb-swatch {
			width: 2rem;
			height: 2rem;
			border-radius: 999px;
			border: 2px solid var(--vscode-sideBar-foreground);
		}
		.cb-meta {
			display: flex;
			justify-content: space-between;
			gap: 1rem;
			flex-wrap: wrap;
		}
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
		.cb-check-icon {
			font-weight: bold;
		}
		.cb-pass {
			color: #22c55e;
		}
		.cb-fail {
			color: #ef4444;
		}
		.cb-list {
			list-style: none;
			padding-left: 0;
			margin: 0;
		}
		.cb-list li {
			margin: 0.25rem 0;
		}
		.cb-empty {
			text-align: center;
			opacity: 0.8;
		}
		code {
			background: var(--vscode-textCodeBlock-background, rgba(110,118,129,0.4));
			padding: 0.1rem 0.35rem;
			border-radius: 4px;
			font-size: 0.9em;
		}
	</style>
</head>
<body>
	${bodyContent}
</body>
</html>`;
	}

	private escapeHtml(value: string): string {
		return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
	}
}
