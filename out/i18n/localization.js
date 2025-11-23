"use strict";
/**
 * Localization service for ColorBuddy extension
 * Provides type-safe internationalization using vscode-nls
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.LocalizedStrings = void 0;
exports.t = t;
exports.tm = tm;
exports.format = format;
const nls = __importStar(require("vscode-nls"));
// Initialize vscode-nls localization
const localize = nls.loadMessageBundle();
/**
 * Type-safe string keys for localization
 */
exports.LocalizedStrings = {
    // Extension lifecycle
    EXTENSION_ACTIVATING: 'extension.activating',
    EXTENSION_ACTIVATED: 'extension.activated',
    EXTENSION_INDEXING: 'extension.indexing',
    EXTENSION_INDEXING_COMPLETE: 'extension.indexingComplete',
    EXTENSION_ERROR_CSS_INDEXING: 'extension.error.cssIndexing',
    EXTENSION_ERROR_ACTIVATION: 'extension.error.activation',
    // Tooltip labels
    TOOLTIP_CSS_VARIABLE: 'tooltip.cssVariable',
    TOOLTIP_CSS_CLASS: 'tooltip.cssClass',
    TOOLTIP_TAILWIND_CLASS: 'tooltip.tailwindClass',
    TOOLTIP_COLOR: 'tooltip.color',
    TOOLTIP_RESOLVED_VALUE: 'tooltip.resolvedValue',
    TOOLTIP_DEFAULT_THEME: 'tooltip.defaultTheme',
    TOOLTIP_LIGHT_THEME: 'tooltip.lightTheme',
    TOOLTIP_DARK_THEME: 'tooltip.darkTheme',
    TOOLTIP_DEFINED_IN: 'tooltip.definedIn',
    TOOLTIP_ALSO_DEFINED_IN: 'tooltip.alsoDefinedIn',
    TOOLTIP_ACCESSIBILITY: 'tooltip.accessibility',
    TOOLTIP_CONTRAST_ON_WHITE: 'tooltip.contrastOnWhite',
    TOOLTIP_CONTRAST_ON_BLACK: 'tooltip.contrastOnBlack',
    TOOLTIP_WCAG_AA: 'tooltip.wcagAA',
    TOOLTIP_WCAG_AAA: 'tooltip.wcagAAA',
    TOOLTIP_WCAG_PASS: 'tooltip.wcagPass',
    TOOLTIP_WCAG_FAIL: 'tooltip.wcagFail',
    TOOLTIP_NORMAL_TEXT: 'tooltip.normalText',
    TOOLTIP_LARGE_TEXT: 'tooltip.largeText',
    // Color palette
    PALETTE_TITLE: 'palette.title',
    PALETTE_NO_COLORS: 'palette.noColors',
    PALETTE_LOADING: 'palette.loading',
    // Error messages
    ERROR_CIRCULAR_REFERENCE: 'error.circularReference',
    ERROR_FILE_READ: 'error.fileRead',
    ERROR_COLOR_PARSING: 'error.colorParsing',
    // Additional tooltip strings
    TOOLTIP_PROPERTY: 'tooltip.property',
    TOOLTIP_VALUE: 'tooltip.value',
    TOOLTIP_FORMAT: 'tooltip.format',
    TOOLTIP_NORMALIZED: 'tooltip.normalized',
    TOOLTIP_RGB: 'tooltip.rgb',
    TOOLTIP_VARIABLE: 'tooltip.variable',
    TOOLTIP_MAPS_TO: 'tooltip.mapsTo',
    TOOLTIP_VARIABLE_NOT_FOUND: 'tooltip.variableNotFound',
    TOOLTIP_VARIABLE_NOT_FOUND_MESSAGE: 'tooltip.variableNotFoundMessage',
    TOOLTIP_VARIABLE_NOT_FOUND_HINT: 'tooltip.variableNotFoundHint',
    TOOLTIP_COLOR_PREVIEW: 'tooltip.colorPreview',
    TOOLTIP_FORMAT_HEX: 'tooltip.formatHex',
    TOOLTIP_FORMAT_RGBA: 'tooltip.formatRgba',
    TOOLTIP_FORMAT_HSLA: 'tooltip.formatHsla',
    TOOLTIP_FORMAT_TAILWIND_HSL: 'tooltip.formatTailwindHsl',
    TOOLTIP_FORMAT_UNKNOWN: 'tooltip.formatUnknown',
};
/**
 * Get a localized string
 * @param key The localization key
 * @param args Optional arguments for string interpolation
 * @returns The localized string
 */
function t(key, ...args) {
    return localize(key, key, ...args);
}
/**
 * Get a localized markdown string
 * @param key The localization key
 * @param args Optional arguments for string interpolation
 * @returns The localized string (same as t(), but semantically indicates markdown content)
 */
function tm(key, ...args) {
    return localize(key, key, ...args);
}
/**
 * Format a localized string with arguments
 * @param message The message template
 * @param args Arguments to interpolate
 * @returns Formatted string
 */
function format(message, ...args) {
    return message.replace(/\{(\d+)\}/g, (match, index) => {
        const argIndex = parseInt(index, 10);
        return args[argIndex] !== undefined ? String(args[argIndex]) : match;
    });
}
//# sourceMappingURL=localization.js.map