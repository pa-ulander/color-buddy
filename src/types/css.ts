import * as vscode from 'vscode';

/**
 * Context information for CSS variable declarations.
 */
export interface CSSVariableContext {
    /** Type of selector where variable is defined */
    type: 'root' | 'class' | 'media' | 'other';
    
    /** Theme hint detected from selector (e.g., .dark, [data-theme="dark"]) */
    themeHint?: 'light' | 'dark';
    
    /** Media query string for @media contexts */
    mediaQuery?: string;
    
    /** CSS specificity score for context resolution */
    specificity: number;
}

/**
 * CSS variable declaration with metadata.
 */
export interface CSSVariableDeclaration {
    /** Variable name including -- prefix (e.g., --primary-color) */
    name: string;
    
    /** Raw value as declared in CSS */
    value: string;
    
    /** URI of the file where variable is declared */
    uri: vscode.Uri;
    
    /** Line number in the file (0-indexed) */
    line: number;
    
    /** CSS selector where variable is declared */
    selector: string;
    
    /** Context information about the declaration */
    context: CSSVariableContext;
    
    /** Cached resolved value after nested variable expansion */
    resolvedValue?: string;
}

/**
 * CSS class with color properties.
 */
export interface CSSClassColorDeclaration {
    /** CSS class name (without the dot) */
    className: string;
    
    /** CSS property name (e.g., 'color', 'background-color') */
    property: string;
    
    /** Property value (can be a literal color or CSS variable) */
    value: string;
    
    /** URI of the file where class is declared */
    uri: vscode.Uri;
    
    /** Line number in the file (0-indexed) */
    line: number;
    
    /** Full selector for the class */
    selector: string;
}
