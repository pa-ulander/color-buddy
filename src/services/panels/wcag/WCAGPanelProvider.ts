import { BasePanelProvider } from '../base/BasePanelProvider';
import type { AccessibilityViewData } from '../../accessibilityViewProvider';
import { t, LocalizedStrings } from '../../../l10n/localization';

/**
 * Panel 2: WCAG Test Results
 * Shows detailed WCAG contrast test results against different backgrounds.
 */
export class WCAGPanelProvider extends BasePanelProvider {
	protected getTitle(): string {
		return 'WCAG Test Results';
	}

	protected getEmptyStateMessage(): string {
		return 'Trigger "Test accessibility" to see accessibility test results.';
	}

	protected renderContent(data: AccessibilityViewData | null): string {
		if (!data) {
			return this.renderEmptyState();
		}

		if (!data.report.samples.length) {
			return this.renderEmptyState();
		}

		return this.renderWCAGCard(data);
	}

	private renderWCAGCard(data: AccessibilityViewData): string {
		const details = data.report.samples.map((sample) => {
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

			return `
				<details class="cb-accordion" open>
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

		return `
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
	}
}
