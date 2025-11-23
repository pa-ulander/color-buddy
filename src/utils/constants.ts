/**
 * Application-wide constants for ColorBuddy extension.
 * All magic numbers and hardcoded values should be defined here.
 */

// ============================================================================
// File System Constants
// ============================================================================

/** Maximum number of CSS files to index at startup */
export const MAX_CSS_FILES = 100;

/** Glob pattern for finding CSS files */
export const CSS_FILE_PATTERN = '**/*.css';

/** Glob pattern for excluding directories from CSS file search */
export const EXCLUDE_PATTERN = '**/node_modules/**';

// ============================================================================
// Decoration Constants
// ============================================================================

/** Size of color swatch decorations (in pixels) */
export const COLOR_SWATCH_SIZE = 10;

/** Margin around color swatch decorations */
export const COLOR_SWATCH_MARGIN = '1px 4px 0 0';

/** Border style for color swatch decorations */
export const COLOR_SWATCH_BORDER = '1px solid #fff';

/** Content text used for color swatch decorations */
export const COLOR_SWATCH_CONTENT = ' ';

/** Default border color for SVG color swatches */
export const SVG_SWATCH_STROKE = 'white';

/** Border width for SVG color swatches */
export const SVG_SWATCH_STROKE_WIDTH = 1;

/** Width of SVG color swatch (in pixels) */
export const SVG_SWATCH_WIDTH = 10;

/** Height of SVG color swatch (in pixels) */
export const SVG_SWATCH_HEIGHT = 10;

// ============================================================================
// CSS Specificity Constants
// ============================================================================

/** Specificity score for :root selector */
export const SPECIFICITY_ROOT = 1;

/** Base specificity score for class selectors */
export const SPECIFICITY_CLASS_BASE = 10;

/** Specificity increment for each additional class */
export const SPECIFICITY_CLASS_MULTIPLE = 10;

/** Specificity score for ID selectors */
export const SPECIFICITY_ID = 100;

// ============================================================================
// Color Value Constants
// ============================================================================

/** Default alpha/opacity value */
export const DEFAULT_ALPHA = 1.0;

/** Minimum alpha/opacity value */
export const ALPHA_MIN = 0.0;

/** Maximum alpha/opacity value */
export const ALPHA_MAX = 1.0;

/** Minimum hue value (degrees) */
export const HUE_MIN = 0;

/** Maximum hue value (degrees) */
export const HUE_MAX = 360;

/** Minimum saturation value (percentage) */
export const SATURATION_MIN = 0;

/** Maximum saturation value (percentage) */
export const SATURATION_MAX = 100;

/** Minimum lightness value (percentage) */
export const LIGHTNESS_MIN = 0;

/** Maximum lightness value (percentage) */
export const LIGHTNESS_MAX = 100;

/** Minimum RGB component value */
export const RGB_MIN = 0;

/** Maximum RGB component value */
export const RGB_MAX = 255;

// ============================================================================
// WCAG Accessibility Constants
// ============================================================================

/** WCAG AAA contrast ratio requirement for normal text */
export const WCAG_AAA_NORMAL = 7.0;

/** WCAG AAA contrast ratio requirement for large text */
export const WCAG_AAA_LARGE = 4.5;

/** WCAG AA contrast ratio requirement for normal text */
export const WCAG_AA_NORMAL = 4.5;

/** WCAG AA contrast ratio requirement for large text */
export const WCAG_AA_LARGE = 3.0;

// ============================================================================
// Performance Constants
// ============================================================================

/** Whether to check document version when accessing cache */
export const CACHE_VERSION_CHECK = true;

/** Whether to deduplicate pending color computations */
export const DEDUP_PENDING_COMPUTATIONS = true;

// ============================================================================
// Logging Constants
// ============================================================================

/** Prefix for all console log messages */
export const LOG_PREFIX = '[cb]';

// ============================================================================
// Testing Constants
// ============================================================================

/** Epsilon value for floating-point comparisons in tests */
export const TEST_EPSILON = 0.01;

// ============================================================================
// Color Conversion Constants
// ============================================================================

/** Factor for converting percentage to decimal */
export const PERCENT_TO_DECIMAL = 100;

/** Number of decimal places for rounding color values */
export const COLOR_PRECISION_DECIMALS = 2;

/** Threshold for sRGB to linear RGB conversion */
export const SRGB_TO_LINEAR_THRESHOLD = 0.03928;

/** Factor for sRGB to linear RGB conversion (low values) */
export const SRGB_TO_LINEAR_FACTOR_LOW = 12.92;

/** Offset for sRGB to linear RGB conversion (high values) */
export const SRGB_TO_LINEAR_OFFSET = 0.055;

/** Divisor for sRGB to linear RGB conversion (high values) */
export const SRGB_TO_LINEAR_DIVISOR = 1.055;

/** Gamma value for sRGB to linear RGB conversion */
export const SRGB_GAMMA = 2.4;

/** Red coefficient for relative luminance calculation (WCAG formula) */
export const LUMINANCE_RED_COEFFICIENT = 0.2126;

/** Green coefficient for relative luminance calculation (WCAG formula) */
export const LUMINANCE_GREEN_COEFFICIENT = 0.7152;

/** Blue coefficient for relative luminance calculation (WCAG formula) */
export const LUMINANCE_BLUE_COEFFICIENT = 0.0722;

/** Offset for contrast ratio calculation to avoid division by zero */
export const CONTRAST_RATIO_OFFSET = 0.05;

// ============================================================================
// Regex Patterns (as constants for reuse)
// ============================================================================

/** Pattern for matching hex colors */
export const HEX_COLOR_PATTERN = /#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})\b/g;

/** Pattern for matching RGB/RGBA functions */
export const RGB_FUNCTION_PATTERN = /\b(?:rgb|rgba)\(([^\n]*?)\)/gi;

/** Pattern for matching HSL/HSLA functions */
export const HSL_FUNCTION_PATTERN = /\b(?:hsl|hsla)\(([^\n]*?)\)/gi;

/** Pattern for matching Tailwind compact HSL format */
export const TAILWIND_HSL_PATTERN = /(?<![\w#(])([0-9]+(?:\.[0-9]+)?\s+[0-9]+(?:\.[0-9]+)?%\s+[0-9]+(?:\.[0-9]+)?%(?:\s*\/\s*(?:0?\.\d+|1(?:\.0+)?))?)/g;

/** Pattern for matching CSS variable references */
export const CSS_VAR_PATTERN = /var\(\s*(--[\w-]+)\s*\)/g;

/** Pattern for matching CSS variables wrapped in color functions */
export const CSS_VAR_IN_FUNCTION_PATTERN = /\b(hsl|hsla|rgb|rgba)\(\s*var\(\s*(--[\w-]+)\s*\)\s*\)/gi;

/** Pattern for matching Tailwind color utility classes */
export const TAILWIND_CLASS_PATTERN = /\b(bg|text|border|ring|shadow|from|via|to|outline|decoration|divide|accent|caret)-(\w+(?:-\w+)?)\b/g;

/** Pattern for matching CSS class attributes */
export const CSS_CLASS_ATTRIBUTE_PATTERN = /class\s*=\s*["']([^"']+)["']/g;

/** Pattern for matching CSS variable declarations */
export const CSS_VAR_DECLARATION_PATTERN = /(--[\w-]+)\s*:\s*([^;]+);/g;

/** Pattern for matching CSS class with color properties */
export const CSS_CLASS_COLOR_PATTERN = /\.([\.\w-]+)\s*\{[^}]*?(color|background-color|border-color|background)\s*:\s*([^;]+);/g;
