import * as assert from 'assert';
import * as vscode from 'vscode';
import { __testing } from '../extension';

const {
	parseColor,
	getFormatPriority,
	formatColorByFormat,
	provideDocumentColors,
	computeColorData,
	ensureColorData,
	registerLanguageProviders,
	colorDataCache,
	pendingColorComputations
} = __testing;

function assertClose(actual: number, expected: number, epsilon = 0.01) {
	assert.ok(Math.abs(actual - expected) <= epsilon, `Expected ${actual} to be within ${epsilon} of ${expected}`);
}

suite('Color parsing', () => {
	test('hex colors normalize to rgb and keep hex priority', () => {
		const parsed = parseColor('#ff0000');
		assert.ok(parsed, 'Expected hex color to parse');
		assert.strictEqual(parsed?.cssString, 'rgb(255, 0, 0)');
		assert.strictEqual(parsed?.formatPriority[0], 'hex');
		assertClose(parsed!.vscodeColor.red, 1);
		assertClose(parsed!.vscodeColor.green, 0);
		assertClose(parsed!.vscodeColor.blue, 0);
		assertClose(parsed!.vscodeColor.alpha, 1);
	});

	test('tailwind compact HSL preserves alpha and priority', () => {
		const parsed = parseColor('200 50% 40% / 0.25');
		assert.ok(parsed, 'Expected Tailwind color to parse');
		assert.strictEqual(parsed?.formatPriority[0], 'tailwind');
		assertClose(parsed!.vscodeColor.alpha, 0.25);
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
		const document = createMockDocument(`
			body {
				color: #f00;
				background: rgb(0, 128, 255);
				border-color: 200 50% 40% / 0.3;
			}
		`, 'plaintext');
		colorDataCache.clear();
		pendingColorComputations.clear();

		const restoreCommand = stubExecuteCommand(undefined);
		const restoreConfig = stubWorkspaceLanguages(['plaintext']);
		try {
			const colors = await provideDocumentColors(document);
			assert.strictEqual(colors.length, 3, 'expected one color per format');
			const texts = colors.map(info => document.getText(info.range));
			assert.ok(texts.includes('#f00'));
			assert.ok(texts.includes('rgb(0, 128, 255)'));
			assert.ok(texts.includes('200 50% 40% / 0.3'));
		} finally {
			restoreCommand();
			restoreConfig();
		}
	});
});

suite('Native provider guard', () => {
	test('computeColorData filters ranges claimed by native providers', async () => {
		const document = createMockDocument('#112233\n#445566', 'plaintext');
		colorDataCache.clear();
		pendingColorComputations.clear();

		const firstRange = new vscode.Range(document.positionAt(0), document.positionAt(7));
		const nativeInfo = new vscode.ColorInformation(firstRange, new vscode.Color(0, 0, 0, 1));
		const restoreCommand = stubExecuteCommand([nativeInfo]);
		const restoreConfig = stubWorkspaceLanguages(['plaintext']);
		try {
			const data = await computeColorData(document);
			assert.strictEqual(data.length, 1, 'expected non-native colors to remain');
			assert.strictEqual(document.getText(data[0].range), '#445566');
		} finally {
			restoreCommand();
			restoreConfig();
		}
	});
});

suite('Language configuration', () => {
	test('registerLanguageProviders registers wildcard selector for "*"', () => {
		const selectors: vscode.DocumentSelector[] = [];
		const context = { subscriptions: [] as vscode.Disposable[] } as unknown as vscode.ExtensionContext;
		const originalRegisterHoverProvider = vscode.languages.registerHoverProvider;
		const originalRegisterColorProvider = vscode.languages.registerColorProvider;
		const restoreConfig = stubWorkspaceLanguages(['*']);
		try {
			(vscode.languages as unknown as { registerHoverProvider: typeof vscode.languages.registerHoverProvider }).registerHoverProvider = selector => {
				selectors.push(selector);
				return new vscode.Disposable(() => {});
			};
			(vscode.languages as unknown as { registerColorProvider: typeof vscode.languages.registerColorProvider }).registerColorProvider = selector => {
				selectors.push(selector);
				return new vscode.Disposable(() => {});
			};

			registerLanguageProviders(context);
			assert.ok(selectors.length >= 2, 'expected hover and color providers to register');
			const wildcardSelector = selectors[0] as vscode.DocumentSelector;
			assert.ok(Array.isArray(wildcardSelector));
			assert.deepStrictEqual(wildcardSelector, [{ scheme: 'file' }, { scheme: 'untitled' }]);
		} finally {
			restoreConfig();
			(vscode.languages as unknown as { registerHoverProvider: typeof vscode.languages.registerHoverProvider }).registerHoverProvider = originalRegisterHoverProvider;
			(vscode.languages as unknown as { registerColorProvider: typeof vscode.languages.registerColorProvider }).registerColorProvider = originalRegisterColorProvider;
		}
	});

	test('registerLanguageProviders registers language-specific selectors', () => {
		const selectors: vscode.DocumentSelector[] = [];
		const context = { subscriptions: [] as vscode.Disposable[] } as unknown as vscode.ExtensionContext;
		const originalRegisterHoverProvider = vscode.languages.registerHoverProvider;
		const originalRegisterColorProvider = vscode.languages.registerColorProvider;
		const restoreConfig = stubWorkspaceLanguages(['css', 'scss']);
		try {
			(vscode.languages as unknown as { registerHoverProvider: typeof vscode.languages.registerHoverProvider }).registerHoverProvider = selector => {
				selectors.push(selector);
				return new vscode.Disposable(() => {});
			};
			(vscode.languages as unknown as { registerColorProvider: typeof vscode.languages.registerColorProvider }).registerColorProvider = selector => {
				selectors.push(selector);
				return new vscode.Disposable(() => {});
			};

			registerLanguageProviders(context);
			const langSelector = selectors[0] as vscode.DocumentSelector;
			assert.ok(Array.isArray(langSelector));
			assert.deepStrictEqual(langSelector, [{ language: 'css' }, { language: 'scss' }]);
		} finally {
			restoreConfig();
			(vscode.languages as unknown as { registerHoverProvider: typeof vscode.languages.registerHoverProvider }).registerHoverProvider = originalRegisterHoverProvider;
			(vscode.languages as unknown as { registerColorProvider: typeof vscode.languages.registerColorProvider }).registerColorProvider = originalRegisterColorProvider;
		}
	});
});

suite('Additional format coverage', () => {
	test('format helpers round-trip HSL boundary values', () => {
		const color = new vscode.Color(0, 1, 0, 0.5);
		const hsla = formatColorByFormat(color, 'hsla');
		assert.ok(hsla);
		assert.match(hsla!, /^hsla\(/);
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
		const docV1 = createMockDocument('#abc', 'plaintext', 1, uri);
		const docV2 = createMockDocument('#abc\n#def', 'plaintext', 2, uri);
		colorDataCache.clear();
		pendingColorComputations.clear();

		const restoreCommand = stubExecuteCommand(undefined);
		const restoreConfig = stubWorkspaceLanguages(['plaintext']);
		try {
			const first = await ensureColorData(docV1);
			const second = await ensureColorData(docV1);
			assert.strictEqual(second, first, 'expected cached array for unchanged version');
			const third = await ensureColorData(docV2);
			assert.notStrictEqual(third, first, 'expected recompute on version bump');
			assert.strictEqual(third.length, 2);
			const cacheEntry = colorDataCache.get(uri.toString());
			assert.ok(cacheEntry);
			assert.strictEqual(cacheEntry?.version, 2);
		} finally {
			restoreCommand();
			restoreConfig();
		}
	});
});

function stubExecuteCommand<T>(result: T): () => void {
	const original = vscode.commands.executeCommand;
	(vscode.commands as unknown as { executeCommand: typeof vscode.commands.executeCommand }).executeCommand = ((command: string, ..._args: unknown[]) => Promise.resolve(result)) as typeof vscode.commands.executeCommand;
	return () => {
		(vscode.commands as unknown as { executeCommand: typeof vscode.commands.executeCommand }).executeCommand = original;
	};
}

function stubWorkspaceLanguages(languages: string[]): () => void {
	const original = vscode.workspace.getConfiguration;
	const config: vscode.WorkspaceConfiguration = {
		get: <T>(section: string, defaultValue?: T) => {
			if (section === 'languages') {
				return languages as unknown as T;
			}
			return defaultValue as T;
		},
		has: () => true,
		inspect: () => undefined,
		update: async (
			_section: string,
			_value: unknown,
			_target?: vscode.ConfigurationTarget | boolean | null,
			_overrideInLanguage?: boolean
		) => undefined
	};
	(vscode.workspace as unknown as { getConfiguration: typeof vscode.workspace.getConfiguration }).getConfiguration = () => config;
	return () => {
		(vscode.workspace as unknown as { getConfiguration: typeof vscode.workspace.getConfiguration }).getConfiguration = original;
	};
}

function createMockDocument(
	content: string,
	languageId: string,
	version = 1,
	uri: vscode.Uri = vscode.Uri.parse(`untitled:${Math.random().toString(36).slice(2)}`)
): vscode.TextDocument {
	const text = content.replace(/^\n/, '');
	const lines = text.split(/\r?\n/);

	const positionAt = (index: number): vscode.Position => {
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

	const offsetAt = (position: vscode.Position): number => {
		let offsetTotal = 0;
		for (let i = 0; i < position.line; i += 1) {
			offsetTotal += lines[i].length + 1;
		}
		return offsetTotal + position.character;
	};

	const getText = (range?: vscode.Range): string => {
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
		validateRange: (range: vscode.Range) => range,
		validatePosition: (position: vscode.Position) => position,
		positionAt,
		offsetAt,
		lineAt: (line: number) => {
			const lineText = lines[line] ?? '';
			return {
				lineNumber: line,
				text: lineText,
				range: new vscode.Range(new vscode.Position(line, 0), new vscode.Position(line, lineText.length)),
				rangeIncludingLineBreak: new vscode.Range(
					new vscode.Position(line, 0),
					new vscode.Position(line, lineText.length + (line === lines.length - 1 ? 0 : 1))
				),
				firstNonWhitespaceCharacterIndex: lineText.length - lineText.trimStart().length,
				isEmptyOrWhitespace: lineText.trim().length === 0
			};
		},
		eol: vscode.EndOfLine.LF
	} as unknown as vscode.TextDocument;
}
