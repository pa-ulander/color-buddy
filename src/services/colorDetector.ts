import * as vscode from 'vscode';
import type { ColorData, CSSVariableDeclaration } from '../types';
import type { Registry } from './registry';
import type { ColorParser } from './colorParser';

/**
 * Service for detecting colors in text documents.
 * Handles detection of hex colors, rgb/hsl functions, Tailwind compact HSL,
 * CSS variables, Tailwind classes, and CSS class colors.
 */
export class ColorDetector {
    constructor(
        private readonly registry: Registry,
        private readonly colorParser: ColorParser
    ) {}

    /**
     * Collect all color data from a document's text.
     * Detects multiple color formats and CSS variable references.
     */
    collectColorData(document: vscode.TextDocument, text: string): ColorData[] {
        const results: ColorData[] = [];
        const seenRanges = new Set<string>();

        const pushMatch = (startIndex: number, matchText: string) => {
            const range = new vscode.Range(
                document.positionAt(startIndex),
                document.positionAt(startIndex + matchText.length)
            );

            const parsed = this.colorParser.parseColor(matchText);
            if (!parsed) {
                return;
            }

            const key = this.rangeKey(range);
            if (seenRanges.has(key)) {
                return;
            }

            seenRanges.add(key);

            results.push({
                range,
                originalText: matchText,
                normalizedColor: parsed.cssString,
                vscodeColor: parsed.vscodeColor
            });
        };

        // Detect hex colors: #rgb, #rrggbb, #rrggbbaa
        const hexRegex = /#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})\b/g;
        let hexMatch: RegExpExecArray | null;
        while ((hexMatch = hexRegex.exec(text)) !== null) {
            pushMatch(hexMatch.index, hexMatch[0]);
        }

        // Detect rgb/rgba and hsl/hsla functions
        const funcRegex = /\b(?:rgb|rgba|hsl|hsla)\(([^\n]*?)\)/gi;
        let funcMatch: RegExpExecArray | null;
        while ((funcMatch = funcRegex.exec(text)) !== null) {
            const fullMatch = funcMatch[0];
            pushMatch(funcMatch.index, fullMatch);
        }

        // Detect Tailwind compact HSL: h s% l% / alpha
        const tailwindRegex = /(?<![\w#(])([0-9]+(?:\.[0-9]+)?\s+[0-9]+(?:\.[0-9]+)?%\s+[0-9]+(?:\.[0-9]+)?%(?:\s*\/\s*(?:0?\.\d+|1(?:\.0+)?))?)/g;
        let tailwindMatch: RegExpExecArray | null;
        while ((tailwindMatch = tailwindRegex.exec(text)) !== null) {
            pushMatch(tailwindMatch.index, tailwindMatch[1]);
        }

        // Detect CSS variables: var(--variable-name)
        const varRegex = /var\(\s*(--[\w-]+)\s*\)/g;
        let varMatch: RegExpExecArray | null;
        while ((varMatch = varRegex.exec(text)) !== null) {
            this.collectCSSVariableReference(document, varMatch.index, varMatch[0], varMatch[1], results, seenRanges);
        }

        // Detect CSS variables wrapped in color functions: hsl(var(--variable)), rgb(var(--variable))
        const varInFuncRegex = /\b(hsl|hsla|rgb|rgba)\(\s*var\(\s*(--[\w-]+)\s*\)\s*\)/gi;
        let varInFuncMatch: RegExpExecArray | null;
        while ((varInFuncMatch = varInFuncRegex.exec(text)) !== null) {
            this.collectCSSVariableReference(document, varInFuncMatch.index, varInFuncMatch[0], varInFuncMatch[2], results, seenRanges, varInFuncMatch[1] as 'hsl' | 'hsla' | 'rgb' | 'rgba');
        }

        // Detect Tailwind color classes: bg-primary, text-accent, border-destructive, etc.
        const tailwindClassRegex = /\b(bg|text|border|ring|shadow|from|via|to|outline|decoration|divide|accent|caret)-(\w+(?:-\w+)?)\b/g;
        let twClassMatch: RegExpExecArray | null;
        while ((twClassMatch = tailwindClassRegex.exec(text)) !== null) {
            this.collectTailwindClass(document, twClassMatch.index, twClassMatch[0], twClassMatch[2], results, seenRanges);
        }
        
        // Detect CSS class names with color properties: plums, bonk, etc.
        const classNameRegex = /class\s*=\s*["']([^"']+)["']/g;
        let classMatch: RegExpExecArray | null;
        while ((classMatch = classNameRegex.exec(text)) !== null) {
            const classList = classMatch[1].split(/\s+/);
            for (const className of classList) {
                if (className && this.registry.hasClass(className)) {
                    this.collectCSSClassColor(document, classMatch.index + classMatch[0].indexOf(className), className, results, seenRanges);
                }
            }
        }

        return results;
    }

    /**
     * Collect a CSS variable reference and resolve its color value.
     */
    private collectCSSVariableReference(
        document: vscode.TextDocument,
        startIndex: number,
        fullMatch: string,
        variableName: string,
        results: ColorData[],
        seenRanges: Set<string>,
        wrappingFunction?: 'hsl' | 'hsla' | 'rgb' | 'rgba'
    ): void {
        const range = new vscode.Range(
            document.positionAt(startIndex),
            document.positionAt(startIndex + fullMatch.length)
        );

        const key = this.rangeKey(range);
        if (seenRanges.has(key)) {
            return;
        }

        // Try to resolve the CSS variable
        const declarations = this.registry.getVariable(variableName);
        if (!declarations || declarations.length === 0) {
            return;
        }

        // Use the first declaration (prioritize :root context)
        const declaration = declarations.sort((a: CSSVariableDeclaration, b: CSSVariableDeclaration) => 
            a.context.specificity - b.context.specificity
        )[0];
        
        // Resolve nested variables recursively
        let colorValue = this.resolveNestedVariables(declaration.value);

        // If wrapped in a color function, prepend it
        if (wrappingFunction) {
            colorValue = `${wrappingFunction}(${colorValue})`;
        }

        // Try to parse the resolved value as a color
        const parsed = this.colorParser.parseColor(colorValue);
        if (!parsed) {
            return;
        }

        seenRanges.add(key);

        results.push({
            range,
            originalText: fullMatch,
            normalizedColor: parsed.cssString,
            vscodeColor: parsed.vscodeColor,
            isCssVariable: true,
            variableName: variableName,
            isWrappedInFunction: !!wrappingFunction
        });
    }

    /**
     * Collect a Tailwind color class and resolve its CSS variable.
     */
    private collectTailwindClass(
        document: vscode.TextDocument,
        startIndex: number,
        fullMatch: string,
        colorName: string,
        results: ColorData[],
        seenRanges: Set<string>
    ): void {
        // Map Tailwind class to CSS variable name
        const variableName = `--${colorName}`;
        
        const range = new vscode.Range(
            document.positionAt(startIndex),
            document.positionAt(startIndex + fullMatch.length)
        );

        const key = this.rangeKey(range);
        if (seenRanges.has(key)) {
            return;
        }

        // Try to resolve the CSS variable
        const declarations = this.registry.getVariable(variableName);
        if (!declarations || declarations.length === 0) {
            // Class doesn't map to a known CSS variable
            return;
        }

        // Use the first declaration (prioritize :root context)
        const declaration = declarations.sort((a: CSSVariableDeclaration, b: CSSVariableDeclaration) => 
            a.context.specificity - b.context.specificity
        )[0];
        
        // Resolve nested variables recursively
        let colorValue = this.resolveNestedVariables(declaration.value);

        // Try to parse the resolved value as a color
        const parsed = this.colorParser.parseColor(colorValue);
        if (!parsed) {
            return;
        }

        seenRanges.add(key);

        results.push({
            range,
            originalText: fullMatch,
            normalizedColor: parsed.cssString,
            vscodeColor: parsed.vscodeColor,
            isTailwindClass: true,
            tailwindClass: fullMatch,
            isCssVariable: true,
            variableName: variableName
        });
    }

    /**
     * Collect a CSS class with color properties.
     */
    private collectCSSClassColor(
        document: vscode.TextDocument,
        startIndex: number,
        className: string,
        results: ColorData[],
        seenRanges: Set<string>
    ): void {
        const range = new vscode.Range(
            document.positionAt(startIndex),
            document.positionAt(startIndex + className.length)
        );

        const key = this.rangeKey(range);
        if (seenRanges.has(key)) {
            return;
        }

        // Get the CSS class color declarations
        const declarations = this.registry.getClass(className);
        if (!declarations || declarations.length === 0) {
            return;
        }

        // Use the first declaration
        const declaration = declarations[0];
        
        // Resolve any CSS variables in the value
        const resolvedValue = this.resolveNestedVariables(declaration.value);
        const parsed = this.colorParser.parseColor(resolvedValue);
        if (!parsed) {
            return;
        }

        seenRanges.add(key);

        results.push({
            range,
            originalText: className,
            normalizedColor: parsed.cssString,
            vscodeColor: parsed.vscodeColor,
            isCssClass: true,
            cssClassName: className
        });
    }

    /**
     * Recursively resolve nested CSS variable references.
     * Handles patterns like var(--var1) where --var1: var(--var2).
     */
    private resolveNestedVariables(value: string, visited = new Set<string>()): string {
        const varRegex = /var\(\s*(--[\w-]+)\s*\)/g;
        let match: RegExpExecArray | null;
        let result = value;

        while ((match = varRegex.exec(value)) !== null) {
            const varName = match[1];
            
            // Prevent circular references
            if (visited.has(varName)) {
                continue;
            }

            const declarations = this.registry.getVariable(varName);
            if (declarations && declarations.length > 0) {
                visited.add(varName);
                const resolvedValue = this.resolveNestedVariables(declarations[0].value, visited);
                result = result.replace(match[0], resolvedValue);
                visited.delete(varName);
            }
        }

        return result;
    }

    /**
     * Create a unique key for a range.
     */
    private rangeKey(range: vscode.Range): string {
        return `${range.start.line}:${range.start.character}-${range.end.line}:${range.end.character}`;
    }
}
