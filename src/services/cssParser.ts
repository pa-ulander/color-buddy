import * as vscode from 'vscode';
import type { CSSVariableDeclaration, CSSClassColorDeclaration, CSSVariableContext } from '../types';
import type { Registry } from './registry';
import type { ColorParser } from './colorParser';

/**
 * Service for parsing CSS files and extracting CSS variables and class colors.
 * Handles CSS variable detection, selector analysis, and context determination.
 */
export class CSSParser {
    constructor(
        private readonly registry: Registry,
        private readonly colorParser: ColorParser
    ) {}

    /**
     * Parse a CSS file and extract CSS variables and class colors.
     */
    async parseCSSFile(document: vscode.TextDocument): Promise<void> {
        const text = document.getText();

        const { declarations: variableDeclarations, lookup: localVariables } = this.extractCSSVariables(document, text);

        this.registry.replaceVariablesForUri(document.uri, variableDeclarations);

        const classDeclarations = this.extractCSSClassColors(document, text, localVariables);
        this.registry.replaceClassesForUri(document.uri, classDeclarations);
    }

    /**
     * Extract CSS custom properties (variables) from text.
     * Matches patterns like: --variable-name: value;
     */
    private extractCSSVariables(
        document: vscode.TextDocument,
        text: string
    ): { declarations: CSSVariableDeclaration[]; lookup: Map<string, CSSVariableDeclaration[]> } {
        const cssVarRegex = /(--[\w-]+)\s*:\s*([^;]+);/g;
        let match: RegExpExecArray | null;
        const declarations: CSSVariableDeclaration[] = [];
        const lookup = new Map<string, CSSVariableDeclaration[]>();

        while ((match = cssVarRegex.exec(text)) !== null) {
            const varName = match[1];
            const value = match[2].trim();
            
            // Find which selector this variable belongs to
            const position = document.positionAt(match.index);
            const selector = this.findContainingSelector(text, match.index);
            const context = this.analyzeContext(selector);
            
            const declaration: CSSVariableDeclaration = {
                name: varName,
                value: value,
                uri: document.uri,
                line: position.line,
                selector: selector,
                context: context
            };

            declarations.push(declaration);
            const existing = lookup.get(varName) ?? [];
            existing.push(declaration);
            lookup.set(varName, existing);
        }

        for (const declarationsForVar of lookup.values()) {
            declarationsForVar.sort((a, b) => a.context.specificity - b.context.specificity);
        }

        for (const declaration of declarations) {
            declaration.resolvedValue = this.resolveNestedVariables(declaration.value, {
                localVariables: lookup,
                visited: new Set([declaration.name])
            });
        }

        return { declarations, lookup };
    }

    /**
     * Extract CSS class color properties from text.
     * Matches patterns like: .className { color: value; }
     */
    private extractCSSClassColors(
        document: vscode.TextDocument,
        text: string,
        localVariables: Map<string, CSSVariableDeclaration[]>
    ): CSSClassColorDeclaration[] {
        const colorPropertyRegex = /\.([\.\w-]+)\s*\{[^}]*?(color|background-color|border-color|background)\s*:\s*([^;]+);/g;
        let colorMatch: RegExpExecArray | null;
        const declarations: CSSClassColorDeclaration[] = [];
        
        while ((colorMatch = colorPropertyRegex.exec(text)) !== null) {
            const className = colorMatch[1];
            const property = colorMatch[2];
            const rawValue = colorMatch[3].trim();

            // Try to resolve if it's a color value or CSS variable reference
            let resolvedValue = rawValue;
            const varMatch = rawValue.match(/var\(\s*(--[\w-]+)\s*\)/);
            if (varMatch) {
                resolvedValue = this.resolveNestedVariables(rawValue, {
                    localVariables
                });
            }

            // Check if the value is a color
            const parsed = this.colorParser.parseColor(resolvedValue);
            if (parsed) {
                const position = document.positionAt(colorMatch.index);
                const selector = this.findContainingSelector(text, colorMatch.index);
                
                const declaration: CSSClassColorDeclaration = {
                    className: className,
                    property: property,
                    value: rawValue,
                    uri: document.uri,
                    line: position.line,
                    selector: selector,
                    resolvedValue: parsed.cssString
                };
                
                declarations.push(declaration);
            }
        }

        return declarations;
    }

    /**
     * Find the CSS selector containing a given text index.
     * Looks backwards for the opening brace, then finds the selector before it.
     */
    findContainingSelector(text: string, varIndex: number): string {
        const beforeVar = text.substring(0, varIndex);
        const lastOpenBrace = beforeVar.lastIndexOf('{');
        
        if (lastOpenBrace === -1) {
            return ':root';
        }

        // Find the selector before the brace
        const beforeBrace = text.substring(0, lastOpenBrace);
        const lines = beforeBrace.split('\n');
        
        // Go backwards to find the selector
        for (let i = lines.length - 1; i >= 0; i--) {
            const line = lines[i].trim();
            if (line && !line.startsWith('/*') && !line.endsWith('*/')) {
                return line.replace(/\s+/g, ' ').trim();
            }
        }
        
        return ':root';
    }

    /**
     * Analyze a CSS selector to determine its context (type, theme, specificity).
     */
    analyzeContext(selector: string): CSSVariableContext {
        const normalizedSelector = selector.toLowerCase().trim();
        
        // Calculate basic specificity (simplified CSS specificity)
        let specificity = 0;
        if (normalizedSelector === ':root' || normalizedSelector === 'html') {
            specificity = 1;
        } else if (normalizedSelector.includes('.')) {
            specificity = 10 + (normalizedSelector.match(/\./g) || []).length * 10;
        } else if (normalizedSelector.includes('#')) {
            specificity = 100;
        }
        
        // Detect context type
        let type: 'root' | 'class' | 'media' | 'other' = 'other';
        if (normalizedSelector === ':root' || normalizedSelector === 'html') {
            type = 'root';
        } else if (normalizedSelector.includes('.') || normalizedSelector.includes('[')) {
            type = 'class';
        } else if (normalizedSelector.includes('@media')) {
            type = 'media';
        }
        
        // Detect theme hints
        let themeHint: 'light' | 'dark' | undefined;
        if (normalizedSelector.includes('.dark') || 
            normalizedSelector.includes('[data-theme="dark"]') ||
            normalizedSelector.includes('[data-mode="dark"]')) {
            themeHint = 'dark';
        } else if (normalizedSelector.includes('.light') || 
                   normalizedSelector.includes('[data-theme="light"]')) {
            themeHint = 'light';
        }
        
        // Extract media query if present
        let mediaQuery: string | undefined;
        const mediaMatch = selector.match(/@media\s+([^{]+)/);
        if (mediaMatch) {
            mediaQuery = mediaMatch[1].trim();
        }
        
        return {
            type,
            themeHint,
            mediaQuery,
            specificity
        };
    }

    /**
     * Recursively resolve nested CSS variable references.
     * Handles patterns like var(--var1) where --var1: var(--var2).
     * Includes circular reference detection.
     */
    resolveNestedVariables(
        value: string,
        options: {
            localVariables?: Map<string, CSSVariableDeclaration[]>;
            visited?: Set<string>;
        } = {}
    ): string {
        const varPattern = /var\(\s*(--[\w-]+)\s*\)/g;
        let resolvedValue = value;
        const visitedVars = options.visited ?? new Set<string>();
        const localVariables = options.localVariables;

        let replaced = false;
        do {
            replaced = false;
            varPattern.lastIndex = 0;
            let match: RegExpExecArray | null;
            while ((match = varPattern.exec(resolvedValue)) !== null) {
                const nestedVarName = match[1];

                if (visitedVars.has(nestedVarName)) {
                    console.warn(`[cb] Circular CSS variable reference detected: ${nestedVarName}`);
                    return value;
                }

                const nestedDeclaration = this.getPreferredDeclaration(nestedVarName, localVariables);
                if (!nestedDeclaration) {
                    continue;
                }

                const newVisited = new Set(visitedVars);
                newVisited.add(nestedVarName);
                const nestedResolved = this.resolveNestedVariables(nestedDeclaration.value, {
                    localVariables,
                    visited: newVisited
                });

                resolvedValue = resolvedValue.replace(match[0], nestedResolved);
                replaced = true;
            }
        } while (replaced);
        
        return resolvedValue;
    }

    private getPreferredDeclaration(
        name: string,
        localVariables?: Map<string, CSSVariableDeclaration[]>
    ): CSSVariableDeclaration | undefined {
        const local = localVariables?.get(name);
        if (local && local.length > 0) {
            return local[0];
        }

        const registryDeclarations = this.registry.getVariablesSorted(name);
        if (registryDeclarations.length > 0) {
            return registryDeclarations[0];
        }

        return undefined;
    }
}
