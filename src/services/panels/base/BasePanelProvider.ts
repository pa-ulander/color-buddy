import * as vscode from 'vscode';
import type { AccessibilityViewData, AccessibilityPanelSection } from '../../accessibilityViewProvider';

const PANEL_STYLE_FILES = ['reset.css', 'vscode.css'] as const;

const SECTION_VIEW_IDS: Record<AccessibilityPanelSection, string> = {
	summary: 'colorbuddy.accessibilitySummaryPanel',
	contrast: 'colorbuddy.accessabilityTestResultPanel',
	contexts: 'colorbuddy.findUsagesPanel',
	formats: 'colorbuddy.formatConversionPanel'
};

export interface PanelRenderOptions {
	embed?: boolean;
}

/**
 * Base class for all accessibility panel providers.
 * Provides common functionality for webview setup, styling, and HTML generation.
 */
export abstract class BasePanelProvider {
	protected webviewView: vscode.WebviewView | null = null;
	protected lastRenderedData: AccessibilityViewData | null = null;

	constructor(
		protected readonly extensionUri: vscode.Uri,
		protected readonly section: AccessibilityPanelSection
	) {}

	/**
	 * Get the VS Code view ID for this panel.
	 */
	get viewId(): string {
		return SECTION_VIEW_IDS[this.section];
	}

	/**
	 * Resolve the webview view. Called by VS Code when the view is first shown.
	 */
	resolveWebviewView(
		webviewView: vscode.WebviewView,
		_context: vscode.WebviewViewResolveContext,
		_token: vscode.CancellationToken
	): void {
		this.webviewView = webviewView;

		webviewView.webview.options = {
			enableScripts: true,
			enableCommandUris: true,
			localResourceRoots: [
				vscode.Uri.joinPath(this.extensionUri, 'media'),
				vscode.Uri.joinPath(this.extensionUri, 'node_modules', '@vscode', 'codicons', 'dist')
			]
		};

		webviewView.webview.html = this.getWebviewHtml(webviewView.webview, this.lastRenderedData);

		// Handle webview visibility changes
		webviewView.onDidChangeVisibility(() => {
			if (webviewView.visible && this.lastRenderedData) {
				this.updateView(this.lastRenderedData);
			}
		});

		// Handle webview disposal
		webviewView.onDidDispose(() => {
			this.webviewView = null;
		});
	}

	/**
	 * Update the panel with new data.
	 */
	updateView(data: AccessibilityViewData): void {
		this.lastRenderedData = data;
		if (this.webviewView) {
			this.webviewView.webview.html = this.getWebviewHtml(this.webviewView.webview, data);
		}
	}

	/**
	 * Reveal the panel in the UI.
	 */
	reveal(preserveFocus?: boolean): void {
		if (this.webviewView) {
			this.webviewView.show(preserveFocus);
			return;
		}

		const focusCommand = `${this.viewId}.focus`;
		void Promise.resolve(vscode.commands.executeCommand(focusCommand)).catch((error: unknown) => {
			console.error('[cb] Failed to focus accessibility panel', error);
		});
	}

	/**
	 * Get the last rendered data for testing purposes.
	 */
	getLastRenderedData(): AccessibilityViewData | null {
		return this.lastRenderedData;
	}

	/**
	 * Generate the complete HTML for the webview.
	 */
	protected getWebviewHtml(webview: vscode.Webview, data: AccessibilityViewData | null): string {
		// Get URIs for style files
		const styleUris = PANEL_STYLE_FILES.map(file =>
			webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'media', 'webview', file))
		);

		// Get codicon font URI - direct reference to font file
		const codiconFontUri = webview.asWebviewUri(
			vscode.Uri.joinPath(this.extensionUri, 'node_modules', '@vscode', 'codicons', 'dist', 'codicon.ttf')
		);

		return `<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8">
	<!--
		Use a content security policy to only allow loading specific resources in the webview
	-->
	<meta http-equiv="Content-Security-Policy" content="default-src 'none'; font-src ${webview.cspSource}; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'none';">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<title>${this.getTitle()}</title>
	${styleUris.map(uri => `<link rel="stylesheet" href="${uri}">`).join('\n\t')}
	<style>
		@font-face {
			font-family: "codicon";
			font-display: block;
			src: url("${codiconFontUri}") format("truetype");
		}
		
		.codicon[class*='codicon-'] {
			font: normal normal normal 16px/1 codicon;
			display: inline-block;
			text-decoration: none;
			text-rendering: auto;
			text-align: center;
			-webkit-font-smoothing: antialiased;
			-moz-osx-font-smoothing: grayscale;
			user-select: none;
			-webkit-user-select: none;
			-ms-user-select: none;
		}
		
		.codicon.codicon-copy::before { content: "\\ebcc"; }
	</style>
	${this.getCustomStyles()}
</head>
<body>
	${this.renderContent(data)}
</body>
</html>`;
	}

	/**
	 * Get custom styles for this panel.
	 */
	protected getCustomStyles(): string {
		return `<style>
		body {
			padding: 12px;
			font-size: 13px;
			line-height: 1.6;
			color: var(--vscode-foreground);
			background: var(--vscode-sideBar-background);
		}
		.cb-card {
			background: var(--vscode-editor-background);
			border-radius: 8px;
			padding: 16px;
			margin-bottom: 16px;
			box-shadow: 0 1px 3px rgba(0,0,0,0.12);
		}
		.cb-section-header {
			display: flex;
			justify-content: space-between;
			align-items: flex-start;
			margin-bottom: 16px;
			padding-bottom: 12px;
			border-bottom: 1px solid var(--vscode-sideBarSectionHeader-border);
		}
		.cb-eyebrow {
			text-transform: uppercase;
			font-size: 0.75rem;
			letter-spacing: 0.5px;
			color: var(--vscode-descriptionForeground);
			margin: 0 0 4px 0;
			font-weight: 600;
		}
		.cb-swatch {
			width: 48px;
			height: 48px;
			border-radius: 8px;
			border: 1px solid var(--vscode-panel-border);
			flex-shrink: 0;
		}
		.cb-check {
			display: flex;
			align-items: center;
			gap: 0.5rem;
		}
		.cb-check-icon {
			font-weight: bold;
			font-size: 1rem;
		}
		.cb-pass {
			color: #22c55e;
		}
		.cb-fail {
			color: #ef4444;
		}
		.cb-toolbar-meta {
			font-size: 0.85rem;
			color: var(--vscode-descriptionForeground);
		}
		.cb-list {
			list-style: none;
			margin: 0;
			padding: 0;
		}
		.cb-context-entry, .cb-format-item {
			padding: 8px 12px;
			border-radius: 6px;
			margin-bottom: 4px;
			border-left: 3px solid transparent;
		}
		.cb-context-entry:hover, .cb-format-item:hover {
			background: var(--vscode-list-hoverBackground);
		}
		.cb-context-label {
			font-weight: 500;
			margin: 0 0 4px 0;
		}
		.cb-summary-grid {
			display: grid;
			grid-template-columns: 1fr;
			gap: 12px;
			margin-bottom: 12px;
		}
		.cb-format-item.cb-current {
			background: var(--vscode-list-inactiveSelectionBackground);
			border-left-color: var(--vscode-charts-green);
			padding-left: calc(0.5rem - 3px);
		}
		.cb-format-check {
			color: var(--vscode-charts-green, #22c55e);
			font-weight: bold;
			font-size: 1rem;
			width: 1.2rem;
			flex-shrink: 0;
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
		@keyframes cb-progress {
			0% { transform: translateX(-100%); }
			50% { transform: translateX(100%); }
			100% { transform: translateX(-100%); }
		}
	</style>`;
	}

	/**
	 * Get the title for this panel.
	 */
	protected abstract getTitle(): string;

	/**
	 * Render the content for this panel.
	 * Subclasses must implement this method.
	 */
	protected abstract renderContent(data: AccessibilityViewData | null): string;

	/**
	 * Render an empty state when no data is available.
	 */
	protected renderEmptyState(message?: string): string {
		const label = message || this.getEmptyStateMessage();
		return `
			<div class="cb-empty">
				<p>${this.escapeHtml(label)}</p>
			</div>
		`;
	}

	/**
	 * Get the empty state message for this panel.
	 */
	protected abstract getEmptyStateMessage(): string;

	/**
	 * Escape HTML special characters.
	 */
	protected escapeHtml(value: string): string {
		return value
			.replace(/&/g, '&amp;')
			.replace(/</g, '&lt;')
			.replace(/>/g, '&gt;')
			.replace(/"/g, '&quot;')
			.replace(/'/g, '&#39;');
	}
}
