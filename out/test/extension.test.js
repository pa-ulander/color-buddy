"use strict";
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
const assert = __importStar(require("assert"));
const vscode = __importStar(require("vscode"));
const extension_1 = require("../extension");
const helpers_1 = require("./helpers");
const { parseColor, getFormatPriority, formatColorByFormat, provideDocumentColors, computeColorData, ensureColorData, registerLanguageProviders, cache } = extension_1.__testing;
function assertClose(actual, expected, epsilon = 0.01) {
    assert.ok(Math.abs(actual - expected) <= epsilon, `Expected ${actual} to be within ${epsilon} of ${expected}`);
}
suite('Color parsing', () => {
    test('hex colors normalize to rgb and keep hex priority', () => {
        const parsed = parseColor('#ff0000');
        (0, helpers_1.assertDefined)(parsed, 'Expected hex color to parse');
        assert.strictEqual(parsed.cssString, 'rgb(255, 0, 0)');
        assert.strictEqual(parsed.formatPriority[0], 'hex');
        assertClose(parsed.vscodeColor.red, 1);
        assertClose(parsed.vscodeColor.green, 0);
        assertClose(parsed.vscodeColor.blue, 0);
        assertClose(parsed.vscodeColor.alpha, 1);
    });
    test('tailwind compact HSL preserves alpha and priority', () => {
        const parsed = parseColor('200 50% 40% / 0.25');
        (0, helpers_1.assertDefined)(parsed, 'Expected Tailwind color to parse');
        assert.strictEqual(parsed.formatPriority[0], 'tailwind');
        assertClose(parsed.vscodeColor.alpha, 0.25);
    });
});
suite('Format helpers', () => {
    test('format priorities stay deduplicated and include fallbacks', () => {
        const priority = getFormatPriority('hex');
        assert.strictEqual(priority[0], 'hex');
        assert.strictEqual(priority[1], 'rgba');
        assert.ok(priority.includes('tailwind'));
        const unique = new Set(priority);
        assert.strictEqual(unique.size, priority.length);
    });
    test('format helpers respect alpha gating', () => {
        const opaqueRed = new vscode.Color(1, 0, 0, 1);
        const translucentRed = new vscode.Color(1, 0, 0, 0.4);
        assert.strictEqual(formatColorByFormat(opaqueRed, 'hex'), '#ff0000');
        assert.strictEqual(formatColorByFormat(opaqueRed, 'rgba'), 'rgba(255, 0, 0, 1)');
        assert.strictEqual(formatColorByFormat(translucentRed, 'hex'), undefined);
        assert.strictEqual(formatColorByFormat(translucentRed, 'hexAlpha'), '#ff000066');
    });
});
suite('Integration pipeline', () => {
    test('provideDocumentColors discovers multiple formats in one document', async () => {
        const document = (0, helpers_1.createMockDocument)(`
			body {
				color: #f00;
				background: rgb(0, 128, 255);
				border-color: 200 50% 40% / 0.3;
			}
		`, 'plaintext');
        cache.clear();
        const restoreCommand = stubExecuteCommand(undefined);
        const restoreConfig = stubWorkspaceLanguages(['plaintext']);
        try {
            const colors = await provideDocumentColors(document);
            (0, helpers_1.assertLength)(colors, 3);
            const texts = colors.map(info => document.getText(info.range));
            assert.ok(texts.includes('#f00'));
            assert.ok(texts.includes('rgb(0, 128, 255)'));
            assert.ok(texts.includes('200 50% 40% / 0.3'));
        }
        finally {
            restoreCommand();
            restoreConfig();
        }
    });
});
suite('Native provider guard', () => {
    test('computeColorData filters ranges claimed by native providers', async () => {
        const document = (0, helpers_1.createMockDocument)('#112233\n#445566', 'plaintext');
        cache.clear();
        const firstRange = new vscode.Range(document.positionAt(0), document.positionAt(7));
        const nativeInfo = new vscode.ColorInformation(firstRange, new vscode.Color(0, 0, 0, 1));
        const restoreCommand = stubExecuteCommand([nativeInfo]);
        const restoreConfig = stubWorkspaceLanguages(['plaintext']);
        try {
            const data = await computeColorData(document);
            (0, helpers_1.assertLength)(data, 1);
            assert.strictEqual(document.getText(data[0].range), '#445566');
        }
        finally {
            restoreCommand();
            restoreConfig();
        }
    });
});
suite('Language configuration', () => {
    test('registerLanguageProviders registers wildcard selector for "*"', () => {
        const selectors = [];
        const context = { subscriptions: [] };
        const originalRegisterHoverProvider = vscode.languages.registerHoverProvider;
        const originalRegisterColorProvider = vscode.languages.registerColorProvider;
        const restoreConfig = stubWorkspaceLanguages(['*']);
        try {
            vscode.languages.registerHoverProvider = selector => {
                selectors.push(selector);
                return new vscode.Disposable(() => { });
            };
            vscode.languages.registerColorProvider = selector => {
                selectors.push(selector);
                return new vscode.Disposable(() => { });
            };
            registerLanguageProviders(context);
            assert.ok(selectors.length >= 2, 'expected hover and color providers to register');
            const wildcardSelector = selectors[0];
            assert.ok(Array.isArray(wildcardSelector));
            assert.deepStrictEqual(wildcardSelector, [{ scheme: 'file' }, { scheme: 'untitled' }]);
        }
        finally {
            restoreConfig();
            vscode.languages.registerHoverProvider = originalRegisterHoverProvider;
            vscode.languages.registerColorProvider = originalRegisterColorProvider;
        }
    });
    test('registerLanguageProviders registers language-specific selectors', () => {
        const selectors = [];
        const context = { subscriptions: [] };
        const originalRegisterHoverProvider = vscode.languages.registerHoverProvider;
        const originalRegisterColorProvider = vscode.languages.registerColorProvider;
        const restoreConfig = stubWorkspaceLanguages(['css', 'scss']);
        try {
            vscode.languages.registerHoverProvider = selector => {
                selectors.push(selector);
                return new vscode.Disposable(() => { });
            };
            vscode.languages.registerColorProvider = selector => {
                selectors.push(selector);
                return new vscode.Disposable(() => { });
            };
            registerLanguageProviders(context);
            const langSelector = selectors[0];
            assert.ok(Array.isArray(langSelector));
            assert.deepStrictEqual(langSelector, [{ language: 'css' }, { language: 'scss' }]);
        }
        finally {
            restoreConfig();
            vscode.languages.registerHoverProvider = originalRegisterHoverProvider;
            vscode.languages.registerColorProvider = originalRegisterColorProvider;
        }
    });
});
suite('Additional format coverage', () => {
    test('format helpers round-trip HSL boundary values', () => {
        const color = new vscode.Color(0, 1, 0, 0.5);
        const hsla = formatColorByFormat(color, 'hsla');
        assert.ok(hsla);
        assert.match(hsla, /^hsla\(/);
        const rgb = formatColorByFormat(color, 'rgba');
        assert.strictEqual(rgb, 'rgba(0, 255, 0, 0.5)');
    });
    test('Tailwind formatting matches rgb-only alpha handling', () => {
        const color = new vscode.Color(1, 0, 1, 0.25);
        const tailwind = formatColorByFormat(color, 'tailwind');
        assert.ok(tailwind);
        assert.ok(tailwind?.includes('/ 0.25'));
    });
});
suite('Cache behaviour', () => {
    test('ensureColorData caches per document version', async () => {
        const uri = vscode.Uri.parse('untitled:cache-test');
        const docV1 = createMockDocumentWithVersion('#abc', 'plaintext', 1, uri);
        const docV2 = createMockDocumentWithVersion('#abc\n#def', 'plaintext', 2, uri);
        cache.clear();
        const restoreCommand = stubExecuteCommand(undefined);
        const restoreConfig = stubWorkspaceLanguages(['plaintext']);
        try {
            const first = await ensureColorData(docV1);
            const second = await ensureColorData(docV1);
            assert.strictEqual(second, first, 'expected cached array for unchanged version');
            const third = await ensureColorData(docV2);
            assert.notStrictEqual(third, first, 'expected recompute on version bump');
            (0, helpers_1.assertLength)(third, 2);
            const cached = cache.get(uri.toString(), 2);
            (0, helpers_1.assertDefined)(cached);
            assert.strictEqual(cached.length, 2);
        }
        finally {
            restoreCommand();
            restoreConfig();
        }
    });
});
function stubExecuteCommand(result) {
    const original = vscode.commands.executeCommand;
    vscode.commands.executeCommand = ((_command, ..._args) => Promise.resolve(result));
    return () => {
        vscode.commands.executeCommand = original;
    };
}
function stubWorkspaceLanguages(languages) {
    const original = vscode.workspace.getConfiguration;
    const config = {
        get: (section, defaultValue) => {
            if (section === 'languages') {
                return languages;
            }
            return defaultValue;
        },
        has: () => true,
        inspect: () => undefined,
        update: async (_section, _value, _target, _overrideInLanguage) => undefined
    };
    vscode.workspace.getConfiguration = () => config;
    return () => {
        vscode.workspace.getConfiguration = original;
    };
}
/**
 * Helper for cache test that needs versioned mock documents
 */
function createMockDocumentWithVersion(content, languageId, version = 1, uri = vscode.Uri.parse(`untitled:${Math.random().toString(36).slice(2)}`)) {
    const text = content.replace(/^\n/, '');
    const lines = text.split(/\r?\n/);
    const positionAt = (index) => {
        let remaining = index;
        for (let line = 0; line < lines.length; line += 1) {
            const lineLength = lines[line].length + 1;
            if (remaining < lineLength) {
                return new vscode.Position(line, Math.min(remaining, lines[line].length));
            }
            remaining -= lineLength;
        }
        return new vscode.Position(lines.length - 1, lines[lines.length - 1].length);
    };
    const offsetAt = (position) => {
        let offsetTotal = 0;
        for (let i = 0; i < position.line; i += 1) {
            offsetTotal += lines[i].length + 1;
        }
        return offsetTotal + position.character;
    };
    const getText = (range) => {
        if (!range) {
            return text;
        }
        const start = offsetAt(range.start);
        const end = offsetAt(range.end);
        return text.slice(start, end);
    };
    return {
        uri,
        fileName: uri.fsPath,
        isUntitled: true,
        languageId,
        version,
        isDirty: false,
        isClosed: false,
        save: async () => true,
        lineCount: lines.length,
        getText,
        getWordRangeAtPosition: () => undefined,
        validateRange: (range) => range,
        validatePosition: (position) => position,
        positionAt,
        offsetAt,
        lineAt: (line) => {
            const lineText = lines[line] ?? '';
            return {
                lineNumber: line,
                text: lineText,
                range: new vscode.Range(new vscode.Position(line, 0), new vscode.Position(line, lineText.length)),
                rangeIncludingLineBreak: new vscode.Range(new vscode.Position(line, 0), new vscode.Position(line, lineText.length + (line === lines.length - 1 ? 0 : 1))),
                firstNonWhitespaceCharacterIndex: lineText.length - lineText.trimStart().length,
                isEmptyOrWhitespace: lineText.trim().length === 0
            };
        },
        eol: vscode.EndOfLine.LF
    };
}
//# sourceMappingURL=extension.test.js.map