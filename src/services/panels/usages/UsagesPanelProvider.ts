import { BasePanelProvider } from '../base/BasePanelProvider';
import type { AccessibilityViewData } from '../../accessibilityViewProvider';

/**
 * Panel 3: Find Usages
 * Shows search results for color usages across the workspace.
 */
export class UsagesPanelProvider extends BasePanelProvider {
	protected getTitle(): string {
		return 'Find Usages';
	}

	protected getEmptyStateMessage(): string {
		return 'Trigger "Find usages" to see where a color is used in your codebase.';
	}

	protected renderContent(data: AccessibilityViewData | null): string {
		if (!data) {
			return this.renderEmptyState();
		}

		return this.renderUsageMatches(data);
	}

	private renderUsageMatches(data: AccessibilityViewData): string {
		const matches = (data.usageMatches ?? []).filter(match => match.isConvertible !== false);
		const isSearching = data.colorName && data.colorName.includes('Searching');
		const formatVariations = data.conversions || [];

		if (matches.length === 0 && !isSearching) {
			return this.renderEmptyState('No usages found');
		}

		const searchValue = data.searchValue ?? data.label;
		
		// Render each match as a clickable entry
		const entries = matches.map(match => {
			const lineNumber = match.range.start.line + 1;

			const uriString = typeof match.uri === 'string' ? match.uri : match.uri.toString();
			const startChar = typeof match.range.start.character === 'number' ? match.range.start.character + 1 : 1;

			const uriWithFragment = `${uriString}#${lineNumber}:${startChar}`;
			const args = [uriWithFragment];
			const encodedArgs = encodeURIComponent(JSON.stringify(args));
			const commandUri = `command:vscode.open?${encodedArgs}`;

			return `
			<div class="cb-context-entry" style="cursor: pointer;">
				<p class="cb-context-label">
					<a href="${commandUri}" style="color: var(--vscode-textLink-foreground); text-decoration: none; word-break: break-all; overflow-wrap: break-word;">
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
		` : '';

		const resultsText = isSearching
			? `${matches.length} found so far...`
			: `${matches.length} result${matches.length !== 1 ? 's' : ''}`;

		return `
			<section class="cb-card">
				<header class="cb-section-header">
					<div>
						<p class="cb-eyebrow">Find Usages</p>
						<h4>Results for: ${this.escapeHtml(searchValue)}</h4>
					</div>
					<div class="cb-toolbar-meta">
						<span>${resultsText}</span>
					</div>
				</header>
				${progressSection}
				${entries}
			</section>
		`;
	}
}
