import * as vscode from 'vscode';
import type { AccessibilityReport } from '../types';
import type { FormatConversion } from '../utils/colorFormatConversions';
import { 
	BasePanelProvider,
	SummaryPanelProvider, 
	WCAGPanelProvider, 
	UsagesPanelProvider, 
	FormatsPanelProvider 
} from './panels';

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
	matchText?: string;
	isConvertible?: boolean;
}

export type AccessibilityPanelSection = 'summary' | 'contrast' | 'contexts' | 'formats';

export interface AccessibilityReportPresenter extends vscode.WebviewViewProvider {
	readonly viewId: string;
	updateReport(data: AccessibilityViewData, section?: AccessibilityPanelSection): void;
	updateCurrentFormat(format: string): void;
	reveal(preserveFocus?: boolean): void;
	revealSection(section: AccessibilityPanelSection, preserveFocus?: boolean): void;
	getSectionProviders(): BasePanelProvider[];
	getLastRenderedData(): AccessibilityViewData | null;
	getCurrentUsageMatches(): AccessibilityUsageMatch[] | undefined;
}

const SECTION_VIEW_IDS: Record<AccessibilityPanelSection, string> = {
	summary: 'colorbuddy.accessibilitySummary',
	contrast: 'colorbuddy.accessibilityContrast',
	contexts: 'colorbuddy.accessibilityContexts',
	formats: 'colorbuddy.accessibilityFormats'
};

export class AccessibilityViewProvider implements AccessibilityReportPresenter {
	private readonly providers: Record<AccessibilityPanelSection, BasePanelProvider>;
	private lastRenderedData: AccessibilityViewData | null = null;

	constructor(extensionUri: vscode.Uri) {
		this.providers = {
			summary: new SummaryPanelProvider(extensionUri, 'summary'),
			contrast: new WCAGPanelProvider(extensionUri, 'contrast'),
			contexts: new UsagesPanelProvider(extensionUri, 'contexts'),
			formats: new FormatsPanelProvider(extensionUri, 'formats')
		};
	}

	get viewId(): string {
		return SECTION_VIEW_IDS.summary;
	}

	resolveWebviewView(webviewView: vscode.WebviewView, context: vscode.WebviewViewResolveContext, token: vscode.CancellationToken): void {
		this.providers.summary.resolveWebviewView(webviewView, context, token);
	}

	getSectionProviders(): BasePanelProvider[] {
		return Object.values(this.providers);
	}

	updateReport(data: AccessibilityViewData, section?: AccessibilityPanelSection): void {
		this.lastRenderedData = data;
		if (section) {
			// Update only the specified section
			const provider = this.providers[section];
			if (provider) {
				provider.updateView(data);
			}
		} else {
			// Update all sections (legacy behavior)
			for (const provider of Object.values(this.providers)) {
				provider.updateView(data);
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

	getCurrentUsageMatches(): AccessibilityUsageMatch[] | undefined {
		return this.lastRenderedData?.usageMatches;
	}

	/**
	 * Update current format visually in formats panel without re-rendering
	 */
	updateCurrentFormat(_format: string): void {
		// Note: This functionality can be re-implemented if needed
		// For now, the formats panel will re-render fully on updates
	}

	reveal(preserveFocus?: boolean): void {
		this.revealSection('summary', preserveFocus);
	}
}
