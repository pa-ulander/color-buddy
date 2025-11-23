"use strict";
/**
 * Application-wide constants for ColorBuddy extension.
 * All magic numbers and hardcoded values should be defined here.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.CSS_VAR_IN_FUNCTION_PATTERN = exports.CSS_VAR_PATTERN = exports.TAILWIND_HSL_PATTERN = exports.HSL_FUNCTION_PATTERN = exports.RGB_FUNCTION_PATTERN = exports.HEX_COLOR_PATTERN = exports.CONTRAST_RATIO_OFFSET = exports.LUMINANCE_BLUE_COEFFICIENT = exports.LUMINANCE_GREEN_COEFFICIENT = exports.LUMINANCE_RED_COEFFICIENT = exports.SRGB_GAMMA = exports.SRGB_TO_LINEAR_DIVISOR = exports.SRGB_TO_LINEAR_OFFSET = exports.SRGB_TO_LINEAR_FACTOR_LOW = exports.SRGB_TO_LINEAR_THRESHOLD = exports.COLOR_PRECISION_DECIMALS = exports.PERCENT_TO_DECIMAL = exports.TEST_EPSILON = exports.LOG_PREFIX = exports.DEDUP_PENDING_COMPUTATIONS = exports.CACHE_VERSION_CHECK = exports.WCAG_AA_LARGE = exports.WCAG_AA_NORMAL = exports.WCAG_AAA_LARGE = exports.WCAG_AAA_NORMAL = exports.RGB_MAX = exports.RGB_MIN = exports.LIGHTNESS_MAX = exports.LIGHTNESS_MIN = exports.SATURATION_MAX = exports.SATURATION_MIN = exports.HUE_MAX = exports.HUE_MIN = exports.ALPHA_MAX = exports.ALPHA_MIN = exports.DEFAULT_ALPHA = exports.SPECIFICITY_ID = exports.SPECIFICITY_CLASS_MULTIPLE = exports.SPECIFICITY_CLASS_BASE = exports.SPECIFICITY_ROOT = exports.SVG_SWATCH_HEIGHT = exports.SVG_SWATCH_WIDTH = exports.SVG_SWATCH_STROKE_WIDTH = exports.SVG_SWATCH_STROKE = exports.COLOR_SWATCH_BORDER = exports.COLOR_SWATCH_MARGIN = exports.COLOR_SWATCH_SIZE = exports.EXCLUDE_PATTERN = exports.CSS_FILE_PATTERN = exports.MAX_CSS_FILES = void 0;
exports.CSS_CLASS_COLOR_PATTERN = exports.CSS_VAR_DECLARATION_PATTERN = exports.CSS_CLASS_ATTRIBUTE_PATTERN = exports.TAILWIND_CLASS_PATTERN = void 0;
// ============================================================================
// File System Constants
// ============================================================================
/** Maximum number of CSS files to index at startup */
exports.MAX_CSS_FILES = 100;
/** Glob pattern for finding CSS files */
exports.CSS_FILE_PATTERN = '**/*.css';
/** Glob pattern for excluding directories from CSS file search */
exports.EXCLUDE_PATTERN = '**/node_modules/**';
// ============================================================================
// Decoration Constants
// ============================================================================
/** Size of color swatch decorations (in pixels) */
exports.COLOR_SWATCH_SIZE = 10;
/** Margin around color swatch decorations */
exports.COLOR_SWATCH_MARGIN = '1px 4px 0 0';
/** Border style for color swatch decorations */
exports.COLOR_SWATCH_BORDER = '1px solid #fff';
/** Default border color for SVG color swatches */
exports.SVG_SWATCH_STROKE = 'white';
/** Border width for SVG color swatches */
exports.SVG_SWATCH_STROKE_WIDTH = 1;
/** Width of SVG color swatch (in pixels) */
exports.SVG_SWATCH_WIDTH = 10;
/** Height of SVG color swatch (in pixels) */
exports.SVG_SWATCH_HEIGHT = 10;
// ============================================================================
// CSS Specificity Constants
// ============================================================================
/** Specificity score for :root selector */
exports.SPECIFICITY_ROOT = 1;
/** Base specificity score for class selectors */
exports.SPECIFICITY_CLASS_BASE = 10;
/** Specificity increment for each additional class */
exports.SPECIFICITY_CLASS_MULTIPLE = 10;
/** Specificity score for ID selectors */
exports.SPECIFICITY_ID = 100;
// ============================================================================
// Color Value Constants
// ============================================================================
/** Default alpha/opacity value */
exports.DEFAULT_ALPHA = 1.0;
/** Minimum alpha/opacity value */
exports.ALPHA_MIN = 0.0;
/** Maximum alpha/opacity value */
exports.ALPHA_MAX = 1.0;
/** Minimum hue value (degrees) */
exports.HUE_MIN = 0;
/** Maximum hue value (degrees) */
exports.HUE_MAX = 360;
/** Minimum saturation value (percentage) */
exports.SATURATION_MIN = 0;
/** Maximum saturation value (percentage) */
exports.SATURATION_MAX = 100;
/** Minimum lightness value (percentage) */
exports.LIGHTNESS_MIN = 0;
/** Maximum lightness value (percentage) */
exports.LIGHTNESS_MAX = 100;
/** Minimum RGB component value */
exports.RGB_MIN = 0;
/** Maximum RGB component value */
exports.RGB_MAX = 255;
// ============================================================================
// WCAG Accessibility Constants
// ============================================================================
/** WCAG AAA contrast ratio requirement for normal text */
exports.WCAG_AAA_NORMAL = 7.0;
/** WCAG AAA contrast ratio requirement for large text */
exports.WCAG_AAA_LARGE = 4.5;
/** WCAG AA contrast ratio requirement for normal text */
exports.WCAG_AA_NORMAL = 4.5;
/** WCAG AA contrast ratio requirement for large text */
exports.WCAG_AA_LARGE = 3.0;
// ============================================================================
// Performance Constants
// ============================================================================
/** Whether to check document version when accessing cache */
exports.CACHE_VERSION_CHECK = true;
/** Whether to deduplicate pending color computations */
exports.DEDUP_PENDING_COMPUTATIONS = true;
// ============================================================================
// Logging Constants
// ============================================================================
/** Prefix for all console log messages */
exports.LOG_PREFIX = '[cb]';
// ============================================================================
// Testing Constants
// ============================================================================
/** Epsilon value for floating-point comparisons in tests */
exports.TEST_EPSILON = 0.01;
// ============================================================================
// Color Conversion Constants
// ============================================================================
/** Factor for converting percentage to decimal */
exports.PERCENT_TO_DECIMAL = 100;
/** Number of decimal places for rounding color values */
exports.COLOR_PRECISION_DECIMALS = 2;
/** Threshold for sRGB to linear RGB conversion */
exports.SRGB_TO_LINEAR_THRESHOLD = 0.03928;
/** Factor for sRGB to linear RGB conversion (low values) */
exports.SRGB_TO_LINEAR_FACTOR_LOW = 12.92;
/** Offset for sRGB to linear RGB conversion (high values) */
exports.SRGB_TO_LINEAR_OFFSET = 0.055;
/** Divisor for sRGB to linear RGB conversion (high values) */
exports.SRGB_TO_LINEAR_DIVISOR = 1.055;
/** Gamma value for sRGB to linear RGB conversion */
exports.SRGB_GAMMA = 2.4;
/** Red coefficient for relative luminance calculation (WCAG formula) */
exports.LUMINANCE_RED_COEFFICIENT = 0.2126;
/** Green coefficient for relative luminance calculation (WCAG formula) */
exports.LUMINANCE_GREEN_COEFFICIENT = 0.7152;
/** Blue coefficient for relative luminance calculation (WCAG formula) */
exports.LUMINANCE_BLUE_COEFFICIENT = 0.0722;
/** Offset for contrast ratio calculation to avoid division by zero */
exports.CONTRAST_RATIO_OFFSET = 0.05;
// ============================================================================
// Regex Patterns (as constants for reuse)
// ============================================================================
/** Pattern for matching hex colors */
exports.HEX_COLOR_PATTERN = /#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})\b/g;
/** Pattern for matching RGB/RGBA functions */
exports.RGB_FUNCTION_PATTERN = /\b(?:rgb|rgba)\(([^\n]*?)\)/gi;
/** Pattern for matching HSL/HSLA functions */
exports.HSL_FUNCTION_PATTERN = /\b(?:hsl|hsla)\(([^\n]*?)\)/gi;
/** Pattern for matching Tailwind compact HSL format */
exports.TAILWIND_HSL_PATTERN = /(?<![\w#(])([0-9]+(?:\.[0-9]+)?\s+[0-9]+(?:\.[0-9]+)?%\s+[0-9]+(?:\.[0-9]+)?%(?:\s*\/\s*(?:0?\.\d+|1(?:\.0+)?))?)/g;
/** Pattern for matching CSS variable references */
exports.CSS_VAR_PATTERN = /var\(\s*(--[\w-]+)\s*\)/g;
/** Pattern for matching CSS variables wrapped in color functions */
exports.CSS_VAR_IN_FUNCTION_PATTERN = /\b(hsl|hsla|rgb|rgba)\(\s*var\(\s*(--[\w-]+)\s*\)\s*\)/gi;
/** Pattern for matching Tailwind color utility classes */
exports.TAILWIND_CLASS_PATTERN = /\b(bg|text|border|ring|shadow|from|via|to|outline|decoration|divide|accent|caret)-(\w+(?:-\w+)?)\b/g;
/** Pattern for matching CSS class attributes */
exports.CSS_CLASS_ATTRIBUTE_PATTERN = /class\s*=\s*["']([^"']+)["']/g;
/** Pattern for matching CSS variable declarations */
exports.CSS_VAR_DECLARATION_PATTERN = /(--[\w-]+)\s*:\s*([^;]+);/g;
/** Pattern for matching CSS class with color properties */
exports.CSS_CLASS_COLOR_PATTERN = /\.([\.\w-]+)\s*\{[^}]*?(color|background-color|border-color|background)\s*:\s*([^;]+);/g;
//# sourceMappingURL=constants.js.map