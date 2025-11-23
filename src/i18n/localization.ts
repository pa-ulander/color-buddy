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
} as const;

/**
 * Get a localized string
 * @param message The English message (used as key and fallback)
 * @param args Optional arguments for string interpolation
 * @returns The localized string
 */
export function t(message: string, ...args: Array<string | number>): string {
	if (args.length === 0) {
		return l10n.t(message);
	}
	// Format the message with positional arguments {0}, {1}, etc.
	return l10n.t(message, ...args);
}
