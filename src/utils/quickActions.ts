import * as vscode from 'vscode';
import { t, LocalizedStrings } from '../l10n/localization';

export type QuickActionSurface = 'hover' | 'statusBar';

interface QuickAction {
	command: string;
	label: string;
	args?: unknown[];
}

interface QuickActionOverride {
	args?: unknown[];
}

export interface QuickActionLinkPayload {
	target: string;
	source: QuickActionSurface;
	args?: unknown[];
}

interface AppendQuickActionsOptions {
	surface?: QuickActionSurface;
	overrides?: Record<string, QuickActionOverride>;
}

export const EXECUTE_QUICK_ACTION_COMMAND = 'colorbuddy.executeQuickAction';

const QUICK_ACTIONS: QuickAction[] = [
	// Panel 1: accessibilitySummaryPanel
	{ command: 'colorbuddy.testColorAccessibility', label: t(LocalizedStrings.COMMAND_QUICK_ACTION_DISPLAY_SUMMARY), args: [{ panel: 'summary' }] },
	
	// Panel 2: accessibilityTestResultPanel
	{ command: 'colorbuddy.testColorAccessibility', label: t(LocalizedStrings.COMMAND_QUICK_ACTION_ACCESSIBILITY), args: [{ panel: 'contrast' }] },
	
	// Panel 3: findUsagesPanel
	{ command: 'colorbuddy.findColorUsages', label: t(LocalizedStrings.COMMAND_QUICK_ACTION_FIND_USAGES), args: [{ panel: 'contexts' }] },
	
	// Panel 4: formatConversionPanel
	{ command: 'colorbuddy.findColorUsages', label: t(LocalizedStrings.COMMAND_QUICK_ACTION_CONVERT), args: [{ panel: 'formats' }] },
	
	// Utility actions (not panel-specific)
	{ command: 'colorbuddy.copyColorAs', label: t(LocalizedStrings.COMMAND_QUICK_ACTION_COPY) },
	{ command: 'colorbuddy.showColorPalette', label: t(LocalizedStrings.COMMAND_QUICK_ACTION_PALETTE) }
];

export function appendQuickActions(markdown: vscode.MarkdownString, options?: AppendQuickActionsOptions): void {
	const surface: QuickActionSurface = options?.surface ?? 'hover';
	
	// All actions are always enabled (Option 2: convert works for all colors)
	const links = QUICK_ACTIONS.map(action => {
		const payload: QuickActionLinkPayload = {
			target: action.command,
			source: surface
		};

		const override = options?.overrides?.[action.command];
		let args = override?.args ?? action.args;
		
		// Merge default action args with override args for testColorAccessibility and findColorUsages
		// This preserves the panel parameter from the action while using the override payload
		if ((action.command === 'colorbuddy.testColorAccessibility' || action.command === 'colorbuddy.findColorUsages') && override?.args && action.args) {
			const defaultPanel = (action.args[0] as { panel?: string })?.panel;
			const overridePayload = override.args[0] as Record<string, unknown>;
			args = [{ ...overridePayload, panel: overridePayload.panel ?? defaultPanel }];
		}
		
		if (args && args.length > 0) {
			payload.args = args;
		}

		const encodedPayload = encodeURIComponent(JSON.stringify(payload));
		const title = action.label.replace(/"/g, '\\"');
		
		// Render as clickable code-styled link
		return `[\`${action.label}\`](command:${EXECUTE_QUICK_ACTION_COMMAND}?${encodedPayload} "${title}")`;
	});

	markdown.appendMarkdown(`**${t(LocalizedStrings.COMMAND_QUICK_ACTIONS_TITLE)}:** \n\n ${links.join(' | ')}\n\n`);
}
