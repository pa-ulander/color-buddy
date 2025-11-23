/**
 * Mock factories for testing ColorBuddy extension
 */

import * as vscode from 'vscode';
import type { ColorData, CSSVariableDeclaration, CSSClassColorDeclaration, ParsedColor } from '../../types';

/**
 * Create a mock TextDocument
 */
export function createMockDocument(content: string, languageId = 'css', uri?: vscode.Uri): vscode.TextDocument {
    const mockUri = uri || vscode.Uri.parse(`untitled:test-${Date.now()}.${languageId}`);
    
    return {
        uri: mockUri,
        fileName: mockUri.fsPath,
        isUntitled: true,
        languageId,
        version: 1,
        isDirty: false,
        isClosed: false,
        eol: vscode.EndOfLine.LF,
        lineCount: content.split('\n').length,
        encoding: 'utf8',
        
        save: async () => false,
        getText: (range?: vscode.Range) => {
            if (!range) {
                return content;
            }
            const lines = content.split('\n');
            if (range.start.line === range.end.line) {
                return lines[range.start.line].substring(range.start.character, range.end.character);
            }
            const startLine = lines[range.start.line].substring(range.start.character);
            const endLine = lines[range.end.line].substring(0, range.end.character);
            const middleLines = lines.slice(range.start.line + 1, range.end.line);
            return [startLine, ...middleLines, endLine].join('\n');
        },
        getWordRangeAtPosition: (_position: vscode.Position, _regex?: RegExp) => undefined,
        validateRange: (range: vscode.Range) => range,
        validatePosition: (position: vscode.Position) => position,
        lineAt: (line: number | vscode.Position) => {
            const lineNumber = typeof line === 'number' ? line : line.line;
            const lines = content.split('\n');
            const text = lines[lineNumber] || '';
            return {
                lineNumber,
                text,
                range: new vscode.Range(lineNumber, 0, lineNumber, text.length),
                rangeIncludingLineBreak: new vscode.Range(lineNumber, 0, lineNumber + 1, 0),
                firstNonWhitespaceCharacterIndex: text.search(/\S/),
                isEmptyOrWhitespace: text.trim().length === 0
            };
        },
        offsetAt: (position: vscode.Position) => {
            const lines = content.split('\n');
            let offset = 0;
            for (let i = 0; i < position.line && i < lines.length; i++) {
                offset += lines[i].length + 1; // +1 for newline
            }
            offset += position.character;
            return offset;
        },
        positionAt: (offset: number) => {
            const lines = content.split('\n');
            let currentOffset = 0;
            for (let line = 0; line < lines.length; line++) {
                const lineLength = lines[line].length + 1; // +1 for newline
                if (currentOffset + lineLength > offset) {
                    return new vscode.Position(line, offset - currentOffset);
                }
                currentOffset += lineLength;
            }
            return new vscode.Position(lines.length - 1, lines[lines.length - 1].length);
        }
    } as vscode.TextDocument;
}

/**
 * Create a mock ColorData object
 */
export function createMockColorData(overrides?: Partial<ColorData>): ColorData {
    const defaultColor = new vscode.Color(1, 0, 0, 1); // Red
    return {
        range: new vscode.Range(0, 0, 0, 7),
        originalText: '#ff0000',
        normalizedColor: 'rgb(255, 0, 0)',
        vscodeColor: defaultColor,
        format: 'hex',
        isCssVariable: false,
        isTailwindClass: false,
        isCssClass: false,
        ...overrides
    };
}

/**
 * Create a mock CSSVariableDeclaration
 */
export function createMockCSSVariableDeclaration(
    name: string,
    value: string,
    overrides?: Partial<CSSVariableDeclaration>
): CSSVariableDeclaration {
    return {
        name,
        value,
        uri: vscode.Uri.parse('file:///test.css'),
        line: 0,
        selector: ':root',
        context: {
            type: 'root',
            themeHint: undefined,
            specificity: 1
        },
        ...overrides
    };
}

/**
 * Create a mock CSSClassColorDeclaration
 */
export function createMockCSSClassDeclaration(
    className: string,
    property: string,
    value: string,
    overrides?: Partial<CSSClassColorDeclaration>
): CSSClassColorDeclaration {
    return {
        className,
        property,
        value,
        uri: vscode.Uri.parse('file:///test.css'),
        line: 0,
        selector: `.${className}`,
        ...overrides
    };
}

/**
 * Create a mock ParsedColor
 */
export function createMockParsedColor(overrides?: Partial<ParsedColor>): ParsedColor {
    return {
        vscodeColor: new vscode.Color(1, 0, 0, 1),
        cssString: 'rgb(255, 0, 0)',
        formatPriority: ['hex', 'rgb'],
        ...overrides
    };
}

/**
 * Create a mock vscode.Color from RGB values
 */
export function createColor(r: number, g: number, b: number, a = 1): vscode.Color {
    return new vscode.Color(r / 255, g / 255, b / 255, a);
}

/**
 * Create a mock CSS file content
 */
export function createMockCSSContent(variables?: Record<string, string>, classes?: Record<string, Record<string, string>>): string {
    let content = ':root {\n';
    
    if (variables) {
        for (const [name, value] of Object.entries(variables)) {
            content += `  ${name}: ${value};\n`;
        }
    }
    
    content += '}\n\n';
    
    if (classes) {
        for (const [className, properties] of Object.entries(classes)) {
            content += `.${className} {\n`;
            for (const [prop, value] of Object.entries(properties)) {
                content += `  ${prop}: ${value};\n`;
            }
            content += '}\n\n';
        }
    }
    
    return content;
}

/**
 * Wait for a condition to be true
 */
export async function waitFor(condition: () => boolean, timeout = 1000, interval = 10): Promise<void> {
    const startTime = Date.now();
    while (!condition()) {
        if (Date.now() - startTime > timeout) {
            throw new Error('Timeout waiting for condition');
        }
        await new Promise(resolve => setTimeout(resolve, interval));
    }
}

/**
 * Create a range from line:character notation
 */
export function range(startLine: number, startChar: number, endLine: number, endChar: number): vscode.Range {
    return new vscode.Range(startLine, startChar, endLine, endChar);
}

/**
 * Create a position from line:character notation
 */
export function position(line: number, character: number): vscode.Position {
    return new vscode.Position(line, character);
}
