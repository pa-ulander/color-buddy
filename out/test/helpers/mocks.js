"use strict";
/**
 * Mock factories for testing ColorBuddy extension
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
exports.createMockDocument = createMockDocument;
exports.createMockColorData = createMockColorData;
exports.createMockCSSVariableDeclaration = createMockCSSVariableDeclaration;
exports.createMockCSSClassDeclaration = createMockCSSClassDeclaration;
exports.createMockParsedColor = createMockParsedColor;
exports.createColor = createColor;
exports.createMockCSSContent = createMockCSSContent;
exports.waitFor = waitFor;
exports.range = range;
exports.position = position;
const vscode = __importStar(require("vscode"));
/**
 * Create a mock TextDocument
 */
function createMockDocument(content, languageId = 'css', uri) {
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
        getText: (range) => {
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
        getWordRangeAtPosition: (_position, _regex) => undefined,
        validateRange: (range) => range,
        validatePosition: (position) => position,
        lineAt: (line) => {
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
        offsetAt: (position) => {
            const lines = content.split('\n');
            let offset = 0;
            for (let i = 0; i < position.line && i < lines.length; i++) {
                offset += lines[i].length + 1; // +1 for newline
            }
            offset += position.character;
            return offset;
        },
        positionAt: (offset) => {
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
    };
}
/**
 * Create a mock ColorData object
 */
function createMockColorData(overrides) {
    const defaultColor = new vscode.Color(1, 0, 0, 1); // Red
    return {
        range: new vscode.Range(0, 0, 0, 7),
        originalText: '#ff0000',
        normalizedColor: 'rgb(255, 0, 0)',
        vscodeColor: defaultColor,
        isCssVariable: false,
        isTailwindClass: false,
        isCssClass: false,
        ...overrides
    };
}
/**
 * Create a mock CSSVariableDeclaration
 */
function createMockCSSVariableDeclaration(name, value, overrides) {
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
function createMockCSSClassDeclaration(className, property, value, overrides) {
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
function createMockParsedColor(overrides) {
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
function createColor(r, g, b, a = 1) {
    return new vscode.Color(r / 255, g / 255, b / 255, a);
}
/**
 * Create a mock CSS file content
 */
function createMockCSSContent(variables, classes) {
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
async function waitFor(condition, timeout = 1000, interval = 10) {
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
function range(startLine, startChar, endLine, endChar) {
    return new vscode.Range(startLine, startChar, endLine, endChar);
}
/**
 * Create a position from line:character notation
 */
function position(line, character) {
    return new vscode.Position(line, character);
}
//# sourceMappingURL=mocks.js.map