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
	{ command: 'colorbuddy.testColorAccessibility', label: t(LocalizedStrings.COMMAND_QUICK_ACTION_DISPLAY_SUMMARY), args: [{ panel: 'summary' }] },
	{ command: 'colorbuddy.copyColorAs', label: t(LocalizedStrings.COMMAND_QUICK_ACTION_COPY) },
	{ command: 'colorbuddy.convertColorFormat', label: t(LocalizedStrings.COMMAND_QUICK_ACTION_CONVERT) },
	{ command: 'colorbuddy.testColorAccessibility', label: t(LocalizedStrings.COMMAND_QUICK_ACTION_ACCESSIBILITY), args: [{ panel: 'contrast' }] },
	{ command: 'colorbuddy.findColorUsages', label: t(LocalizedStrings.COMMAND_QUICK_ACTION_FIND_USAGES) },
	{ command: 'colorbuddy.showColorPalette', label: t(LocalizedStrings.COMMAND_QUICK_ACTION_PALETTE) }
];

export function appendQuickActions(markdown: vscode.MarkdownString, options?: AppendQuickActionsOptions): void {
	const surface: QuickActionSurface = options?.surface ?? 'hover';
	
	// Always show all actions but mark convert as disabled if no override
	const links = QUICK_ACTIONS.map(action => {
		const payload: QuickActionLinkPayload = {
			target: action.command,
			source: surface
		};

		const override = options?.overrides?.[action.command];
		let args = override?.args ?? action.args;
		
		// Check if this action should be disabled (no override for convert)
		const isDisabled = action.command === 'colorbuddy.convertColorFormat' && !override;
		
		// Merge default action args with override args for testColorAccessibility
		// This preserves the panel parameter from the action while using the override payload
		if (action.command === 'colorbuddy.testColorAccessibility' && override?.args && action.args) {
			const defaultPanel = (action.args[0] as { panel?: string })?.panel;
			const overridePayload = override.args[0] as Record<string, unknown>;
			args = [{ ...overridePayload, panel: overridePayload.panel ?? defaultPanel }];
		}
		
		if (args && args.length > 0) {
			payload.args = args;
		}

		const encodedPayload = encodeURIComponent(JSON.stringify(payload));
		const title = action.label.replace(/"/g, '\\"');
		
		// Render as button-like markdown with disabled state
		// Use markdown code block styling for button appearance
		if (isDisabled) {
			// Disabled: plain text with strike-through to indicate unavailable
			return `~~\`${action.label}\`~~`;
		} else {
			// Enabled: clickable code-styled link
			return `[\`${action.label}\`](command:${EXECUTE_QUICK_ACTION_COMMAND}?${encodedPayload} "${title}")`;
		}
	});

	markdown.appendMarkdown(`**${t(LocalizedStrings.COMMAND_QUICK_ACTIONS_TITLE)}:** \n\n ${links.join(' | ')}\n\n`);
}
