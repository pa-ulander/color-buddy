/**
 * Localization service for ColorBuddy extension
 * Provides type-safe internationalization using @vscode/l10n
 */

import * as l10n from '@vscode/l10n';

/**
 * Localized messages using actual English text as keys (l10n approach)
 */
export const LocalizedStrings = {
	// Extension lifecycle
	EXTENSION_ACTIVATING: 'ColorBuddy is activating...',
	EXTENSION_ACTIVATED: 'ColorBuddy activated successfully',
	EXTENSION_INDEXING: 'Indexing CSS files...',
	EXTENSION_INDEXING_COMPLETE: 'CSS indexing complete. Found {0} CSS variables.',
	EXTENSION_ERROR_CSS_INDEXING: 'Error indexing CSS file {0}: {1}',
	EXTENSION_ERROR_ACTIVATION: 'Error during ColorBuddy activation: {0}',
	EXTENSION_ERROR_REINDEX: 'Failed to re-index CSS files. Check the output console for details.',

	// Tooltip labels
	TOOLTIP_CSS_VARIABLE: 'CSS Variable',
	TOOLTIP_CSS_CLASS: 'CSS Class',
	TOOLTIP_TAILWIND_CLASS: 'Tailwind Class',
	TOOLTIP_COLOR: 'Color',
	TOOLTIP_RESOLVED_VALUE: 'Resolved Value',
	TOOLTIP_DEFAULT_THEME: 'Default Theme',
	TOOLTIP_LIGHT_THEME: 'Light Theme',
	TOOLTIP_DARK_THEME: 'Dark Theme',
	TOOLTIP_DEFINED_IN: 'Defined in',
	TOOLTIP_ALSO_DEFINED_IN: 'Also Defined In',
	TOOLTIP_ACCESSIBILITY: 'Accessibility',
	TOOLTIP_CONTRAST_ON_WHITE: 'Contrast on white',
	TOOLTIP_CONTRAST_ON_BLACK: 'Contrast on black',
	TOOLTIP_WCAG_AA: 'WCAG AA',
	TOOLTIP_WCAG_AAA: 'WCAG AAA',
	TOOLTIP_WCAG_PASS: 'Pass',
	TOOLTIP_WCAG_FAIL: 'Fail',
	TOOLTIP_NORMAL_TEXT: 'normal text',
	TOOLTIP_LARGE_TEXT: 'large text',

	// Color palette
	PALETTE_TITLE: 'Workspace Color Palette',
	PALETTE_NO_COLORS: 'No colors found in workspace',
	PALETTE_LOADING: 'Loading colors...',

	// Error messages
	ERROR_CIRCULAR_REFERENCE: 'Circular CSS variable reference detected: {0}',
	ERROR_FILE_READ: 'Failed to read file {0}: {1}',
	ERROR_COLOR_PARSING: 'Failed to parse color: {0}',

	// Additional tooltip strings
	TOOLTIP_PROPERTY: 'Property',
	TOOLTIP_VALUE: 'Value',
	TOOLTIP_FORMAT: 'Format',
	TOOLTIP_NORMALIZED: 'Normalized',
	TOOLTIP_RGB: 'RGB',
	TOOLTIP_VARIABLE: 'Variable',
	TOOLTIP_MAPS_TO: 'Maps to',
	TOOLTIP_VARIABLE_NOT_FOUND: 'CSS Variable Not Found',
	TOOLTIP_VARIABLE_NOT_FOUND_MESSAGE: 'This variable is not defined in any CSS files in the workspace.',
	TOOLTIP_VARIABLE_NOT_FOUND_HINT: 'Make sure the variable is declared in a CSS file.',
	TOOLTIP_COLOR_PREVIEW: 'Color Preview',
	TOOLTIP_FORMAT_HEX: 'Hex',
	TOOLTIP_FORMAT_RGBA: 'RGB/RGBA',
	TOOLTIP_FORMAT_HSLA: 'HSL/HSLA',
	TOOLTIP_FORMAT_TAILWIND_HSL: 'Tailwind HSL',
	TOOLTIP_FORMAT_UNKNOWN: 'Unknown',
	TOOLTIP_FORMATS_AVAILABLE: 'Available formats',
	TOOLTIP_FORMAT_HEX_ALPHA: 'Hex (with alpha)',
	TOOLTIP_FORMAT_RGB_LABEL: 'RGB',
	TOOLTIP_FORMAT_RGBA_LABEL: 'RGBA',
	TOOLTIP_FORMAT_HSL_LABEL: 'HSL',
	TOOLTIP_FORMAT_HSLA_LABEL: 'HSLA',
	TOOLTIP_FORMAT_TAILWIND_LABEL: 'Tailwind HSL',

	// Command strings
	COMMAND_COPY_COLOR_TITLE: 'Copy Color As...',
	COMMAND_COPY_COLOR_PLACEHOLDER: 'Select the format to copy',
	COMMAND_COPY_COLOR_NO_EDITOR: 'Open a file to copy a color value.',
	COMMAND_COPY_COLOR_NO_COLOR: 'Place the cursor on a color before running this command.',
	COMMAND_COPY_COLOR_SUCCESS: 'Copied color value: {0}',
	COMMAND_COPY_COLOR_ERROR: 'Failed to copy color value. Check the logs for details.',
	COMMAND_FIND_USAGES_TITLE: 'Find Color Usages',
	COMMAND_FIND_USAGES_PICK_VALUE: 'Select the color value to search',
	COMMAND_FIND_USAGES_PICK_FROM_PALETTE: 'Select a color to search from the workspace palette',
	COMMAND_FIND_USAGES_NO_COLOR: 'No color available for usage search. Place the cursor on a color or define workspace colors.',
	COMMAND_FIND_USAGES_SEARCHING: 'Searching for "{0}" usages...',
	COMMAND_FIND_USAGES_NO_RESULTS: 'No usages found for {0}.',
	COMMAND_FIND_USAGES_RESULTS_TITLE: 'Select a match to open',
	COMMAND_CONVERT_COLOR_TITLE: 'Convert Color Format',
	COMMAND_CONVERT_COLOR_PLACEHOLDER: 'Select the format to apply',
	COMMAND_CONVERT_COLOR_NO_EDITOR: 'Open a file to convert a color value.',
	COMMAND_CONVERT_COLOR_NO_COLOR: 'Place the cursor on a color before running this command.',
	COMMAND_CONVERT_COLOR_NO_ALTERNATIVES: 'No alternate color formats available for conversion.',
	COMMAND_CONVERT_COLOR_CURRENT_LABEL: 'Current format',
	COMMAND_CONVERT_COLOR_SUCCESS: 'Converted color to {0}.',
	COMMAND_CONVERT_COLOR_ERROR: 'Failed to convert color. Check the logs for details.',
	COMMAND_QUICK_ACTIONS_TITLE: 'Quick actions',
	COMMAND_QUICK_ACTION_COPY: 'Copy',
	COMMAND_QUICK_ACTION_CONVERT: 'Convert',
	COMMAND_QUICK_ACTION_ACCESSIBILITY: 'Test accessibility',
	COMMAND_QUICK_ACTION_FIND_USAGES: 'Find usages',
	COMMAND_QUICK_ACTION_PALETTE: 'Show palette',
	STATUS_BAR_USAGE_COUNT: 'Usage count',
	STATUS_BAR_CONTRAST_SUMMARY: 'Contrast summary',
	COMMAND_TEST_ACCESSIBILITY_TITLE: 'Test Color Accessibility',
	COMMAND_TEST_ACCESSIBILITY_NO_EDITOR: 'Open a file to test color accessibility.',
	COMMAND_TEST_ACCESSIBILITY_NO_COLOR: 'Place the cursor on a color before testing accessibility.',
	COMMAND_TEST_ACCESSIBILITY_RESULTS: 'Accessibility for {0}:\n{1}',
	COMMAND_TEST_ACCESSIBILITY_ERROR: 'Failed to evaluate color accessibility. Check the logs for details.'
} as const;

export type LocalizedMessage = typeof LocalizedStrings[keyof typeof LocalizedStrings];

/**
 * Get a localized string
 * @param message The English message (used as key and fallback)
 * @param args Optional arguments for string interpolation
 * @returns The localized string
 */
export function t(message: LocalizedMessage, ...args: Array<string | number>): string {
	if (args.length === 0) {
		return l10n.t(message);
	}
	// Format the message with positional arguments {0}, {1}, etc.
	return l10n.t(message, ...args);
}
