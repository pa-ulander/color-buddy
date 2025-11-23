import * as vscode from 'vscode';

/**
 * Represents color format types supported by the extension.
 */
export type ColorFormat = 'hex' | 'hexAlpha' | 'rgb' | 'rgba' | 'hsl' | 'hsla' | 'tailwind';

/**
 * Color data detected in a document with metadata.
 */
export interface ColorData {
    /** The range in the document where the color is located */
    range: vscode.Range;
    
    /** The original text as it appears in the document */
    originalText: string;
    
    /** Normalized color string (usually RGB format) */
    normalizedColor: string;
    
    /** VS Code Color object for use with color picker */
    vscodeColor: vscode.Color;
    
    /** True if this is a CSS variable reference (e.g., var(--primary)) */
    isCssVariable?: boolean;
    
    /** The name of the CSS variable if isCssVariable is true */
    variableName?: string;
    
    /** True if the variable is wrapped in a function like hsl(var(--x)) */
    isWrappedInFunction?: boolean;
    
    /** True if this is a Tailwind utility class (e.g., bg-primary) */
    isTailwindClass?: boolean;
    
    /** The Tailwind class name if isTailwindClass is true */
    tailwindClass?: string;
    
    /** True if this is a CSS class with color properties */
    isCssClass?: boolean;
    
    /** The CSS class name if isCssClass is true */
    cssClassName?: string;
}

/**
 * Parsed color with VS Code color object and format metadata.
 */
export interface ParsedColor {
    /** VS Code Color object */
    vscodeColor: vscode.Color;
    
    /** CSS string representation */
    cssString: string;
    
    /** Priority list of formats for preservation */
    formatPriority: ColorFormat[];
}

/**
 * Document color cache entry with version tracking.
 */
export interface DocumentColorCache {
    /** Document version when cached */
    version: number;
    
    /** Cached color data */
    data: ColorData[];
}
