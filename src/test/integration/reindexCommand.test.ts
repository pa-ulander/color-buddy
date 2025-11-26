import * as assert from 'assert';
import { readFileSync } from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { ExtensionController } from '../../services';
import { perfLogger } from '../../utils/performanceLogger';
import { t, LocalizedStrings } from '../../l10n/localization';
import type { CSSVariableDeclaration } from '../../types';
import { createMockDocument } from '../helpers';

process.setMaxListeners(0);

const PROJECT_ROOT = path.resolve(__dirname, '../../..');
const FIND_COLOR_USAGE_HEX = '#336699';
const FIND_COLOR_USAGE_FIXTURE_PATH = path.join(
	PROJECT_ROOT,
	'src',
	'test',
	'integration',
	'fixtures',
	'find-color-usages',
	'app.css'
);
const FIND_COLOR_USAGE_FIXTURE_URI = vscode.Uri.file(FIND_COLOR_USAGE_FIXTURE_PATH);
const FIND_COLOR_USAGE_LINES = readFileSync(FIND_COLOR_USAGE_FIXTURE_PATH, 'utf8').split(/\r?\n/);
const FIND_COLOR_USAGE_LINE_INDEX = FIND_COLOR_USAGE_LINES.findIndex(line => line.includes(FIND_COLOR_USAGE_HEX));

if (FIND_COLOR_USAGE_LINE_INDEX === -1) {
	throw new Error('Find color usages fixture missing expected hex color.');
}

const FIND_COLOR_USAGE_PREVIEW = FIND_COLOR_USAGE_LINES[FIND_COLOR_USAGE_LINE_INDEX];
const FIND_COLOR_USAGE_START = FIND_COLOR_USAGE_PREVIEW.indexOf(FIND_COLOR_USAGE_HEX);

if (FIND_COLOR_USAGE_START === -1) {
	throw new Error('Find color usages fixture preview missing expected hex color.');
}

const FIND_COLOR_USAGE_END = FIND_COLOR_USAGE_START + FIND_COLOR_USAGE_HEX.length;

suite('Command Integration', () => {
	function createDisposable(): vscode.Disposable {
		return { dispose: () => undefined };
	}

	interface CommandTestEnvironment {
		controller: ExtensionController;
		registeredCommands: Map<string, (...args: unknown[]) => unknown>;
		infoMessages: string[];
		warningMessages: Array<{ message: string; items: string[] }>;
		errorMessages: string[];
		quickPickRequests: Array<{ items: readonly vscode.QuickPickItem[]; options?: vscode.QuickPickOptions }>;
		openDocuments: Array<{ content: string | undefined; language: string | undefined }>;
		showTextDocuments: Array<{ document: vscode.TextDocument }>;
		getFindFilesCallCount(): number;
		configUpdates: Array<{ name: string; value: unknown }>;
		setActiveEditor(editor?: vscode.TextEditor): void;
		setVisibleEditors(editors: readonly vscode.TextEditor[]): void;
		setQuickPickHandler(handler?: (items: readonly vscode.QuickPickItem[], options?: vscode.QuickPickOptions) => vscode.QuickPickItem | undefined | Promise<vscode.QuickPickItem | undefined>): void;
		setTextSearchMatches(matches: vscode.TextSearchMatch[]): void;
		getTextSearchInvocations(): Array<{ query: vscode.TextSearchQuery; options?: vscode.FindTextInFilesOptions }>;
		setPerformanceLoggingEnabled(enabled: boolean): void;
		restore(): Promise<void>;
	}

	function createEditor(document: vscode.TextDocument, selection: vscode.Selection): vscode.TextEditor {
		return {
			document,
			selection,
			selections: [selection],
			visibleRanges: [],
			options: {},
			viewColumn: vscode.ViewColumn.One,
			edit: async () => true,
			insertSnippet: async () => true,
			setDecorations: () => undefined,
			revealRange: () => undefined
		} as unknown as vscode.TextEditor;
	}

	function createTextSearchMatch(uri: vscode.Uri, lineText: string, line: number, matchStart: number, matchEnd: number): vscode.TextSearchMatch {
		return {
			uri,
			ranges: [new vscode.Range(new vscode.Position(line, matchStart), new vscode.Position(line, matchEnd))],
			preview: {
				text: lineText,
				matches: [new vscode.Range(new vscode.Position(0, matchStart), new vscode.Position(0, matchEnd))]
			}
		} as unknown as vscode.TextSearchMatch;
	}

	async function setupCommandTestEnvironment(options?: {
		perfLoggingEnabled?: boolean;
		warningSelection?: string;
	}): Promise<CommandTestEnvironment> {
		const context = { subscriptions: [] as vscode.Disposable[] } as unknown as vscode.ExtensionContext;
		const registeredCommands = new Map<string, (...args: unknown[]) => unknown>();
		const infoMessages: string[] = [];
		const warningMessages: Array<{ message: string; items: string[] }> = [];
		const errorMessages: string[] = [];
		const quickPickRequests: Array<{ items: readonly vscode.QuickPickItem[]; options?: vscode.QuickPickOptions }> = [];
		const openDocuments: Array<{ content: string | undefined; language: string | undefined }> = [];
		const showTextDocuments: Array<{ document: vscode.TextDocument }> = [];
		const configUpdates: Array<{ name: string; value: unknown }> = [];
		let findFilesCallCount = 0;
		let perfLoggingEnabled = options?.perfLoggingEnabled ?? false;
		const warningSelection = options?.warningSelection ?? 'Enable Logging';
		let quickPickHandler: ((items: readonly vscode.QuickPickItem[], options?: vscode.QuickPickOptions) => vscode.QuickPickItem | undefined | Promise<vscode.QuickPickItem | undefined>) | undefined;
		const activeEditorState: { editor: vscode.TextEditor | undefined } = { editor: undefined };
		const visibleEditorsState: vscode.TextEditor[] = [];
		const textSearchInvocations: Array<{ query: vscode.TextSearchQuery; options?: vscode.FindTextInFilesOptions }> = [];
		let nextTextSearchMatches: vscode.TextSearchMatch[] = [];
		const textSearchMatchMap = new Map<string, vscode.TextSearchMatch[]>();
		const originalProcessMaxListeners = process.getMaxListeners();
		process.setMaxListeners(0);

		const originalRegisterCommand = vscode.commands.registerCommand;
		(vscode.commands as unknown as { registerCommand: typeof vscode.commands.registerCommand }).registerCommand = ((command: string, callback: (...args: unknown[]) => unknown) => {
			registeredCommands.set(command, callback);
			return createDisposable();
		}) as typeof vscode.commands.registerCommand;

		const originalExecuteCommand = vscode.commands.executeCommand;
		(vscode.commands as unknown as { executeCommand: typeof vscode.commands.executeCommand }).executeCommand = (async () => undefined) as typeof vscode.commands.executeCommand;

		const originalFindFiles = vscode.workspace.findFiles;
		(vscode.workspace as unknown as { findFiles: typeof vscode.workspace.findFiles }).findFiles = (async () => {
			findFilesCallCount += 1;
			return [];
		}) as typeof vscode.workspace.findFiles;

		const fileWatcher: vscode.FileSystemWatcher = {
			onDidChange: () => createDisposable(),
			onDidCreate: () => createDisposable(),
			onDidDelete: () => createDisposable(),
			dispose: () => undefined,
			ignoreChangeEvents: false,
			ignoreCreateEvents: false,
			ignoreDeleteEvents: false
		};

		const originalCreateFileSystemWatcher = vscode.workspace.createFileSystemWatcher;
		(vscode.workspace as unknown as { createFileSystemWatcher: typeof vscode.workspace.createFileSystemWatcher }).createFileSystemWatcher = (() => fileWatcher) as typeof vscode.workspace.createFileSystemWatcher;

		const originalOnDidChangeActiveTextEditor = vscode.window.onDidChangeActiveTextEditor;
		(vscode.window as unknown as { onDidChangeActiveTextEditor: typeof vscode.window.onDidChangeActiveTextEditor }).onDidChangeActiveTextEditor = ((
			_listener: (editor: vscode.TextEditor | undefined) => unknown,
			_thisArg?: unknown,
			_disposables?: vscode.Disposable[]
		) => createDisposable()) as typeof vscode.window.onDidChangeActiveTextEditor;

		const originalOnDidChangeVisibleTextEditors = vscode.window.onDidChangeVisibleTextEditors;
		(vscode.window as unknown as { onDidChangeVisibleTextEditors: typeof vscode.window.onDidChangeVisibleTextEditors }).onDidChangeVisibleTextEditors = ((
			_listener: (editors: readonly vscode.TextEditor[]) => unknown,
			_thisArg?: unknown,
			_disposables?: vscode.Disposable[]
		) => createDisposable()) as typeof vscode.window.onDidChangeVisibleTextEditors;

		const originalOnDidChangeTextDocument = vscode.workspace.onDidChangeTextDocument;
		(vscode.workspace as unknown as { onDidChangeTextDocument: typeof vscode.workspace.onDidChangeTextDocument }).onDidChangeTextDocument = ((
			_listener: (event: vscode.TextDocumentChangeEvent) => unknown,
			_thisArg?: unknown,
			_disposables?: vscode.Disposable[]
		) => createDisposable()) as typeof vscode.workspace.onDidChangeTextDocument;

		const originalOnDidCloseTextDocument = vscode.workspace.onDidCloseTextDocument;
		(vscode.workspace as unknown as { onDidCloseTextDocument: typeof vscode.workspace.onDidCloseTextDocument }).onDidCloseTextDocument = ((
			_listener: (document: vscode.TextDocument) => unknown,
			_thisArg?: unknown,
			_disposables?: vscode.Disposable[]
		) => createDisposable()) as typeof vscode.workspace.onDidCloseTextDocument;

		const originalOnDidChangeConfiguration = vscode.workspace.onDidChangeConfiguration;
		(vscode.workspace as unknown as { onDidChangeConfiguration: typeof vscode.workspace.onDidChangeConfiguration }).onDidChangeConfiguration = ((
			_listener: (event: vscode.ConfigurationChangeEvent) => unknown,
			_thisArg?: unknown,
			_disposables?: vscode.Disposable[]
		) => createDisposable()) as typeof vscode.workspace.onDidChangeConfiguration;

		const originalRegisterHoverProvider = vscode.languages.registerHoverProvider;
		(vscode.languages as unknown as { registerHoverProvider: typeof vscode.languages.registerHoverProvider }).registerHoverProvider = ((
			_selector: vscode.DocumentSelector,
			_provider: vscode.HoverProvider
		) => createDisposable()) as typeof vscode.languages.registerHoverProvider;

		const originalRegisterColorProvider = vscode.languages.registerColorProvider;
		(vscode.languages as unknown as { registerColorProvider: typeof vscode.languages.registerColorProvider }).registerColorProvider = ((
			_selector: vscode.DocumentSelector,
			_provider: vscode.DocumentColorProvider
		) => createDisposable()) as typeof vscode.languages.registerColorProvider;

		const originalShowInformationMessage = vscode.window.showInformationMessage;
		(vscode.window as unknown as { showInformationMessage: typeof vscode.window.showInformationMessage }).showInformationMessage = (async (message: string) => {
			infoMessages.push(message);
			return undefined;
		}) as typeof vscode.window.showInformationMessage;

		const originalShowWarningMessage = vscode.window.showWarningMessage;
		(vscode.window as unknown as { showWarningMessage: typeof vscode.window.showWarningMessage }).showWarningMessage = (async (message: string, ...items: string[]) => {
			warningMessages.push({ message, items });
			return warningSelection as typeof items[number];
		}) as unknown as typeof vscode.window.showWarningMessage;

		const originalShowErrorMessage = vscode.window.showErrorMessage;
		(vscode.window as unknown as { showErrorMessage: typeof vscode.window.showErrorMessage }).showErrorMessage = (async (message: string) => {
			errorMessages.push(message);
			return undefined;
		}) as typeof vscode.window.showErrorMessage;

		const originalShowQuickPick = vscode.window.showQuickPick;
		(vscode.window as unknown as { showQuickPick: typeof vscode.window.showQuickPick }).showQuickPick = (async (
			items: readonly vscode.QuickPickItem[] | Thenable<readonly vscode.QuickPickItem[]>,
			options?: vscode.QuickPickOptions
		) => {
			const resolvedItems = Array.isArray(items) ? items : await items;
			quickPickRequests.push({ items: resolvedItems, options });
			if (quickPickHandler) {
				return quickPickHandler(resolvedItems, options);
			}
			return undefined;
		}) as unknown as typeof vscode.window.showQuickPick;

		const originalFindTextInFiles = vscode.workspace.findTextInFiles;
		(vscode.workspace as unknown as { findTextInFiles: typeof vscode.workspace.findTextInFiles }).findTextInFiles = ((
			query: vscode.TextSearchQuery,
			optionsOrCallback: vscode.FindTextInFilesOptions | ((result: vscode.TextSearchResult) => void),
			maybeCallback?: (result: vscode.TextSearchResult) => void
		) => {
			let options: vscode.FindTextInFilesOptions | undefined;
			let callback: ((result: vscode.TextSearchResult) => void) | undefined;

			if (typeof optionsOrCallback === 'function') {
				callback = optionsOrCallback;
			} else {
				options = optionsOrCallback;
				callback = maybeCallback;
			}

			textSearchInvocations.push({ query, options });
			if (callback) {
				for (const match of nextTextSearchMatches) {
					callback(match);
				}
			}

			return Promise.resolve();
		}) as typeof vscode.workspace.findTextInFiles;

		const originalGetConfiguration = vscode.workspace.getConfiguration;
		(vscode.workspace as unknown as { getConfiguration: typeof vscode.workspace.getConfiguration }).getConfiguration = ((section?: string) => {
			if (section === 'colorbuddy') {
				return {
					get: <T>(name: string, defaultValue?: T) => {
						if (name === 'enablePerformanceLogging') {
							return perfLoggingEnabled as unknown as T;
						}
						return defaultValue as T;
					},
					has: () => true,
					inspect: () => undefined,
					update: async (name: string, value: unknown) => {
						if (name === 'enablePerformanceLogging') {
							perfLoggingEnabled = Boolean(value);
						}
						configUpdates.push({ name, value });
					}
				} as vscode.WorkspaceConfiguration;
			}
			return originalGetConfiguration(section);
		}) as typeof vscode.workspace.getConfiguration;

		const originalActiveTextEditorDescriptor = Object.getOwnPropertyDescriptor(vscode.window, 'activeTextEditor');
		Object.defineProperty(vscode.window, 'activeTextEditor', {
			configurable: true,
			get: () => activeEditorState.editor
		});

		const originalVisibleTextEditorsDescriptor = Object.getOwnPropertyDescriptor(vscode.window, 'visibleTextEditors');
		Object.defineProperty(vscode.window, 'visibleTextEditors', {
			configurable: true,
			get: () => [...visibleEditorsState]
		});

		const originalOpenTextDocument = vscode.workspace.openTextDocument;
		(vscode.workspace as unknown as { openTextDocument: typeof vscode.workspace.openTextDocument }).openTextDocument = (async (arg?: unknown) => {
			if (arg && typeof arg === 'object' && 'content' in (arg as Record<string, unknown>)) {
				const content = (arg as { content?: string }).content;
				const language = (arg as { language?: string }).language;
				openDocuments.push({ content, language });
				const createTextLine = (line: number): vscode.TextLine => ({
					lineNumber: line,
					text: '',
					range: new vscode.Range(new vscode.Position(line, 0), new vscode.Position(line, 0)),
					rangeIncludingLineBreak: new vscode.Range(new vscode.Position(line, 0), new vscode.Position(line, 0)),
					firstNonWhitespaceCharacterIndex: 0,
					isEmptyOrWhitespace: true
				} as vscode.TextLine);
				const document: vscode.TextDocument = {
					uri: vscode.Uri.parse('untitled:perf-logs'),
					fileName: 'untitled:perf-logs',
					isUntitled: true,
					languageId: language ?? 'plaintext',
					version: 1,
					isDirty: false,
					isClosed: false,
					eol: vscode.EndOfLine.LF,
					lineCount: (content ?? '').split('\n').length,
					save: async () => true,
					lineAt: (line: number) => createTextLine(line),
					offsetAt: () => 0,
					positionAt: () => new vscode.Position(0, 0),
					getText: () => content ?? '',
					getWordRangeAtPosition: () => undefined,
					validateRange: (range: vscode.Range) => range,
					validatePosition: (position: vscode.Position) => position
				} as unknown as vscode.TextDocument;
				return document;
			}
			if (arg instanceof vscode.Uri) {
				const key = arg.toString();
				const matchesForUri = textSearchMatchMap.get(key);
				if (matchesForUri && matchesForUri.length > 0) {
					if (key === FIND_COLOR_USAGE_FIXTURE_URI.toString()) {
						const content = FIND_COLOR_USAGE_LINES.join('\n');
						return createMockDocument(content, 'css', arg);
					}
					let maxLine = 0;
					for (const match of matchesForUri) {
						const range = Array.isArray(match.ranges) ? match.ranges[0] : match.ranges;
						if (range.start.line > maxLine) {
							maxLine = range.start.line;
						}
					}
					const lines = Array.from({ length: maxLine + 1 }, () => '');
					for (const match of matchesForUri) {
						const range = Array.isArray(match.ranges) ? match.ranges[0] : match.ranges;
						const previewText = match.preview?.text ?? '';
						lines[range.start.line] = previewText;
					}
					const content = lines.join('\n');
					return createMockDocument(content, 'css', arg);
				}
			}
			return originalOpenTextDocument(arg as Parameters<typeof vscode.workspace.openTextDocument>[0]);
		}) as typeof vscode.workspace.openTextDocument;

		const originalShowTextDocument = vscode.window.showTextDocument;
		(vscode.window as unknown as { showTextDocument: typeof vscode.window.showTextDocument }).showTextDocument = (async (document: vscode.TextDocument) => {
			showTextDocuments.push({ document });
			return {
				document,
				selections: [],
				selection: new vscode.Selection(new vscode.Position(0, 0), new vscode.Position(0, 0)),
				visibleRanges: [],
				options: {},
				viewColumn: vscode.ViewColumn.One,
				edit: async () => true,
				insertSnippet: async () => true,
				setDecorations: () => undefined,
				revealRange: () => undefined
			} as unknown as vscode.TextEditor;
		}) as unknown as typeof vscode.window.showTextDocument;

		perfLogger.reset();
		perfLogger.updateEnabled();

		const controller = new ExtensionController(context);
		await controller.activate();

		perfLogger.reset();

		return {
			controller,
			registeredCommands,
			infoMessages,
			warningMessages,
			errorMessages,
			quickPickRequests,
			openDocuments,
			showTextDocuments,
			getFindFilesCallCount: () => findFilesCallCount,
			configUpdates,
			setActiveEditor: (editor?: vscode.TextEditor) => {
				activeEditorState.editor = editor;
			},
			setVisibleEditors: (editors: readonly vscode.TextEditor[]) => {
				visibleEditorsState.length = 0;
				visibleEditorsState.push(...editors);
			},
			setQuickPickHandler: (handler?: (items: readonly vscode.QuickPickItem[], options?: vscode.QuickPickOptions) => vscode.QuickPickItem | undefined | Promise<vscode.QuickPickItem | undefined>) => {
				quickPickHandler = handler;
			},
			setTextSearchMatches: (matches: vscode.TextSearchMatch[]) => {
				nextTextSearchMatches = matches;
				textSearchMatchMap.clear();
				for (const match of matches) {
					const key = match.uri.toString();
					const existing = textSearchMatchMap.get(key);
					if (existing) {
						existing.push(match);
					} else {
						textSearchMatchMap.set(key, [match]);
					}
				}
			},
			getTextSearchInvocations: () => [...textSearchInvocations],
			setPerformanceLoggingEnabled: (enabled: boolean) => {
				perfLoggingEnabled = enabled;
				perfLogger.updateEnabled();
			},
			restore: async () => {
				controller.dispose();
				perfLogger.reset();
				(vscode.commands as unknown as { registerCommand: typeof vscode.commands.registerCommand }).registerCommand = originalRegisterCommand;
				(vscode.commands as unknown as { executeCommand: typeof vscode.commands.executeCommand }).executeCommand = originalExecuteCommand;
				(vscode.workspace as unknown as { findFiles: typeof vscode.workspace.findFiles }).findFiles = originalFindFiles;
				(vscode.workspace as unknown as { createFileSystemWatcher: typeof vscode.workspace.createFileSystemWatcher }).createFileSystemWatcher = originalCreateFileSystemWatcher;
				(vscode.window as unknown as { onDidChangeActiveTextEditor: typeof vscode.window.onDidChangeActiveTextEditor }).onDidChangeActiveTextEditor = originalOnDidChangeActiveTextEditor;
				(vscode.window as unknown as { onDidChangeVisibleTextEditors: typeof vscode.window.onDidChangeVisibleTextEditors }).onDidChangeVisibleTextEditors = originalOnDidChangeVisibleTextEditors;
				(vscode.workspace as unknown as { onDidChangeTextDocument: typeof vscode.workspace.onDidChangeTextDocument }).onDidChangeTextDocument = originalOnDidChangeTextDocument;
				(vscode.workspace as unknown as { onDidCloseTextDocument: typeof vscode.workspace.onDidCloseTextDocument }).onDidCloseTextDocument = originalOnDidCloseTextDocument;
				(vscode.workspace as unknown as { onDidChangeConfiguration: typeof vscode.workspace.onDidChangeConfiguration }).onDidChangeConfiguration = originalOnDidChangeConfiguration;
				(vscode.languages as unknown as { registerHoverProvider: typeof vscode.languages.registerHoverProvider }).registerHoverProvider = originalRegisterHoverProvider;
				(vscode.languages as unknown as { registerColorProvider: typeof vscode.languages.registerColorProvider }).registerColorProvider = originalRegisterColorProvider;
				(vscode.window as unknown as { showInformationMessage: typeof vscode.window.showInformationMessage }).showInformationMessage = originalShowInformationMessage;
				(vscode.window as unknown as { showWarningMessage: typeof vscode.window.showWarningMessage }).showWarningMessage = originalShowWarningMessage;
				(vscode.window as unknown as { showErrorMessage: typeof vscode.window.showErrorMessage }).showErrorMessage = originalShowErrorMessage;
				(vscode.window as unknown as { showQuickPick: typeof vscode.window.showQuickPick }).showQuickPick = originalShowQuickPick;
				(vscode.workspace as unknown as { findTextInFiles: typeof vscode.workspace.findTextInFiles }).findTextInFiles = originalFindTextInFiles;
				(vscode.workspace as unknown as { getConfiguration: typeof vscode.workspace.getConfiguration }).getConfiguration = originalGetConfiguration;
				(vscode.workspace as unknown as { openTextDocument: typeof vscode.workspace.openTextDocument }).openTextDocument = originalOpenTextDocument;
				(vscode.window as unknown as { showTextDocument: typeof vscode.window.showTextDocument }).showTextDocument = originalShowTextDocument;
				quickPickHandler = undefined;
				activeEditorState.editor = undefined;
				visibleEditorsState.length = 0;
				textSearchInvocations.length = 0;
				nextTextSearchMatches = [];
				textSearchMatchMap.clear();
				if (originalVisibleTextEditorsDescriptor) {
					Object.defineProperty(vscode.window, 'visibleTextEditors', originalVisibleTextEditorsDescriptor);
				} else {
					delete (vscode.window as unknown as Record<string, unknown>).visibleTextEditors;
				}
				if (originalActiveTextEditorDescriptor) {
					Object.defineProperty(vscode.window, 'activeTextEditor', originalActiveTextEditorDescriptor);
				} else {
					delete (vscode.window as unknown as Record<string, unknown>).activeTextEditor;
				}
				process.setMaxListeners(originalProcessMaxListeners);
				perfLogger.updateEnabled();
			}
		};
	}

	test('colorbuddy.reindexCSSFiles reindexes workspace and reports completion', async () => {
		const env = await setupCommandTestEnvironment();
		try {
			assert.ok(env.registeredCommands.has('colorbuddy.reindexCSSFiles'), 'Reindex command not registered');
			const reindex = env.registeredCommands.get('colorbuddy.reindexCSSFiles');
			assert.ok(typeof reindex === 'function', 'Reindex command callback missing');

			const initialCount = env.getFindFilesCallCount();
			await (reindex as (...args: unknown[]) => unknown)();

			assert.strictEqual(env.getFindFilesCallCount(), initialCount + 1, 'Reindex command should trigger workspace indexing');
			assert.ok(env.infoMessages.some(message => message.includes('CSS indexing complete')), 'Expected success message after reindex command');
			assert.strictEqual(env.errorMessages.length, 0, 'Reindex command should not surface errors');
		} finally {
			await env.restore();
		}
	});

	test('colorbuddy.showColorPalette surfaces palette items when registry is populated', async () => {
		const env = await setupCommandTestEnvironment();
		try {
			const command = env.registeredCommands.get('colorbuddy.showColorPalette');
			assert.ok(typeof command === 'function', 'Show color palette command missing');

			const registry = (env.controller as unknown as { registry: { addVariable: (name: string, declaration: CSSVariableDeclaration) => void } }).registry;
			const uri = vscode.Uri.parse('file:///workspace/colors.css');
			const declaration: CSSVariableDeclaration = {
				name: '--primary',
				value: 'hsl(240 50% 50%)',
				resolvedValue: 'hsl(240 50% 50%)',
				uri,
				line: 1,
				selector: ':root',
				context: {
					type: 'root',
					specificity: 0
				}
			};
			registry.addVariable(declaration.name, declaration);

			await (command as (...args: unknown[]) => unknown)();

			assert.strictEqual(env.infoMessages.length, 0, 'Palette should not report empty state');
			assert.strictEqual(env.quickPickRequests.length, 1, 'Palette command should invoke quick pick');
			const request = env.quickPickRequests[0];
			assert.ok(request.items.length > 0, 'Quick pick should contain at least one color entry');
			assert.ok(request.options?.title?.toLowerCase().includes('color palette'), 'Quick pick title should reference palette');
		} finally {
			await env.restore();
		}
	});

	test('colorbuddy.showColorPalette reports empty state when registry lacks colors', async () => {
		const env = await setupCommandTestEnvironment();
		try {
			const command = env.registeredCommands.get('colorbuddy.showColorPalette');
			assert.ok(typeof command === 'function', 'Show color palette command missing');

			await (command as (...args: unknown[]) => unknown)();

			assert.strictEqual(env.quickPickRequests.length, 0, 'No palette items expected for empty registry');
			assert.ok(env.infoMessages.some(message => message.includes('No colors')), 'Expected empty palette information message');
		} finally {
			await env.restore();
		}
	});

	test('colorbuddy.exportPerformanceLogs prompts to enable logging when disabled', async () => {
		const env = await setupCommandTestEnvironment({ perfLoggingEnabled: false, warningSelection: 'Enable Logging' });
		try {
			const command = env.registeredCommands.get('colorbuddy.exportPerformanceLogs');
			assert.ok(typeof command === 'function', 'Export performance logs command missing');

			await (command as (...args: unknown[]) => unknown)();

			assert.strictEqual(env.warningMessages.length, 1, 'Expected a single enable logging prompt');
			assert.ok(env.configUpdates.some(update => update.name === 'enablePerformanceLogging' && update.value === true), 'Expected enablePerformanceLogging update');
			assert.ok(env.infoMessages.some(message => message.includes('Performance logging enabled')), 'Expected informative message after enabling logging');
			assert.strictEqual(env.openDocuments.length, 0, 'Should not open logs when enabling for the first time');
			assert.strictEqual(env.showTextDocuments.length, 0, 'Should not display a document when just enabling logging');
		} finally {
			await env.restore();
		}
	});

	test('colorbuddy.exportPerformanceLogs exports logs when logging is enabled', async () => {
		const env = await setupCommandTestEnvironment({ perfLoggingEnabled: true });
		try {
			const command = env.registeredCommands.get('colorbuddy.exportPerformanceLogs');
			assert.ok(typeof command === 'function', 'Export performance logs command missing');

			perfLogger.reset();
			perfLogger.updateEnabled();
			perfLogger.log('test-event', 'value');

			await (command as (...args: unknown[]) => unknown)();

			assert.strictEqual(env.warningMessages.length, 0, 'Logging already enabled should not prompt warning');
			assert.strictEqual(env.openDocuments.length, 1, 'Expected a single exported log document');
			const exported = env.openDocuments[0];
			assert.ok((exported.content ?? '').includes('ColorBuddy Performance Logs'), 'Exported logs should include header');
			assert.strictEqual(env.showTextDocuments.length, 1, 'Document should be shown to the user');
			assert.ok(env.infoMessages.some(message => message.includes('Performance logs exported')), 'User should be notified about exported logs');
		} finally {
			await env.restore();
		}
	});

	test('colorbuddy.capturePerformanceSnapshot prompts to enable logging when disabled', async () => {
		const env = await setupCommandTestEnvironment({ perfLoggingEnabled: false, warningSelection: t(LocalizedStrings.COMMAND_PERF_ENABLE) });
		try {
			const command = env.registeredCommands.get('colorbuddy.capturePerformanceSnapshot');
			assert.ok(typeof command === 'function', 'Capture performance snapshot command missing');

			await (command as (...args: unknown[]) => unknown)();

			assert.strictEqual(env.warningMessages.length, 1, 'Expected a single enable logging prompt');
			assert.ok(env.configUpdates.some(update => update.name === 'enablePerformanceLogging' && update.value === true), 'Expected enablePerformanceLogging update');
			assert.ok(env.infoMessages.some(message => message.includes('Performance logging enabled')), 'Expected informative message after enabling logging');
			assert.strictEqual(env.openDocuments.length, 0, 'Should not open snapshot when enabling for the first time');
			assert.strictEqual(env.showTextDocuments.length, 0, 'Should not display a document when just enabling logging');
		} finally {
			await env.restore();
		}
	});

	test('colorbuddy.capturePerformanceSnapshot reports when no editors are visible', async () => {
		const env = await setupCommandTestEnvironment({ perfLoggingEnabled: true });
		try {
			const command = env.registeredCommands.get('colorbuddy.capturePerformanceSnapshot');
			assert.ok(typeof command === 'function', 'Capture performance snapshot command missing');

			const initialInfoCount = env.infoMessages.length;
			await (command as (...args: unknown[]) => unknown)();

			const newMessages = env.infoMessages.slice(initialInfoCount);
			const expected = t(LocalizedStrings.COMMAND_CAPTURE_PERF_NO_EDITORS);
			assert.ok(newMessages.includes(expected), 'Expected guidance message when no editors are visible');
			assert.strictEqual(env.openDocuments.length, 0, 'No snapshot document should open when there are no editors');
		} finally {
			await env.restore();
		}
	});

	test('colorbuddy.capturePerformanceSnapshot refreshes visible editors and exports logs', async () => {
		const env = await setupCommandTestEnvironment({ perfLoggingEnabled: true });
		try {
			const command = env.registeredCommands.get('colorbuddy.capturePerformanceSnapshot');
			assert.ok(typeof command === 'function', 'Capture performance snapshot command missing');

			const document = createMockDocument('body { color: #123456; }');
			const selection = new vscode.Selection(new vscode.Position(0, 0), new vscode.Position(0, 0));
			const editor = createEditor(document, selection);
			env.setVisibleEditors([editor]);
			env.setActiveEditor(editor);

			const refreshCalls: vscode.TextEditor[] = [];
			const controllerWithRefresh = env.controller as unknown as { refreshEditor: (editor: vscode.TextEditor) => Promise<void> };
			controllerWithRefresh.refreshEditor = async (targetEditor: vscode.TextEditor) => {
				refreshCalls.push(targetEditor);
				perfLogger.log('test.refreshEditor', targetEditor.document.uri.toString());
			};

			perfLogger.reset();
			perfLogger.updateEnabled();

			const initialInfoCount = env.infoMessages.length;
			await (command as (...args: unknown[]) => unknown)();

			assert.strictEqual(refreshCalls.length, 1, 'Expected refreshEditor to run for each visible editor');
			assert.strictEqual(env.openDocuments.length, 1, 'Expected a snapshot document to be created');
			assert.strictEqual(env.showTextDocuments.length, 1, 'Snapshot document should be shown to the user');
			const exported = env.openDocuments[0];
			assert.ok((exported.content ?? '').includes('ColorBuddy Performance Logs'), 'Snapshot export should include the log header');
			const newMessages = env.infoMessages.slice(initialInfoCount);
			const expectedMessage = t(LocalizedStrings.COMMAND_CAPTURE_PERF_SUCCESS, 1);
			assert.ok(newMessages.includes(expectedMessage), 'Expected success notification after capturing snapshot');
		} finally {
			await env.restore();
		}
	});

	test('colorbuddy.copyColorAs reports when no active editor is present', async () => {
		const env = await setupCommandTestEnvironment();
		try {
			const command = env.registeredCommands.get('colorbuddy.copyColorAs');
			assert.ok(typeof command === 'function', 'Copy color command missing');

			const initialInfoCount = env.infoMessages.length;
			await (command as (...args: unknown[]) => unknown)();

			const newMessages = env.infoMessages.slice(initialInfoCount);
			assert.ok(newMessages.some(message => message.includes('Open a file')), 'Expected guidance message when no editor is active');
			assert.strictEqual(env.quickPickRequests.length, 0, 'Quick pick should not open without an active editor');
		} finally {
			await env.restore();
		}
	});

	test('colorbuddy.copyColorAs reports when no color is under the cursor', async () => {
		const env = await setupCommandTestEnvironment();
		try {
			const command = env.registeredCommands.get('colorbuddy.copyColorAs');
			assert.ok(typeof command === 'function', 'Copy color command missing');

			const document = createMockDocument('body { color: inherit; }');
			const cursor = document.positionAt(document.getText().indexOf('inherit'));
			const selection = new vscode.Selection(cursor, cursor);
			const editor = createEditor(document, selection);
			env.setActiveEditor(editor);
			env.setVisibleEditors([editor]);

			const initialInfoCount = env.infoMessages.length;
			await (command as (...args: unknown[]) => unknown)();

			const newMessages = env.infoMessages.slice(initialInfoCount);
			assert.ok(newMessages.some(message => message.includes('cursor on a color')), 'Expected guidance message when no color is detected');
			assert.strictEqual(env.quickPickRequests.length, 0, 'Quick pick should not open when no color is available');
		} finally {
			await env.restore();
		}
	});

	test('colorbuddy.copyColorAs copies the selected format to the clipboard', async () => {
		const env = await setupCommandTestEnvironment();
		try {
			const command = env.registeredCommands.get('colorbuddy.copyColorAs');
			assert.ok(typeof command === 'function', 'Copy color command missing');

			const document = createMockDocument('body { color: #336699; }');
			const offset = document.getText().indexOf('#336699') + 1;
			const cursor = document.positionAt(offset);
			const selection = new vscode.Selection(cursor, cursor);
			const editor = createEditor(document, selection);
			env.setActiveEditor(editor);
			env.setVisibleEditors([editor]);
			env.setQuickPickHandler(items => items[0]);

			const initialInfoCount = env.infoMessages.length;
			await (command as (...args: unknown[]) => unknown)();

			assert.strictEqual(env.quickPickRequests.length, 1, 'Expected a quick pick prompt for color formats');
			const request = env.quickPickRequests[0];
			assert.ok(request.items.some(item => item.label === '#336699'), 'Quick pick should include the hex representation');
			const newMessages = env.infoMessages.slice(initialInfoCount);
			assert.ok(newMessages.some(message => message.includes('#336699')), 'Success message should mention the copied value');
		} finally {
			await env.restore();
		}
	});

	test('colorbuddy.copyColorAs copies provided payload without requiring editor context', async () => {
		const env = await setupCommandTestEnvironment();
		try {
			const command = env.registeredCommands.get('colorbuddy.copyColorAs');
			assert.ok(typeof command === 'function', 'Copy color command missing');

			const initialInfoCount = env.infoMessages.length;
			await (command as (...args: unknown[]) => unknown)({ value: '#112233' });

			assert.strictEqual(env.quickPickRequests.length, 0, 'Direct payload copy should not open a quick pick');
			const newMessages = env.infoMessages.slice(initialInfoCount);
			assert.ok(newMessages.some(message => message.includes('#112233')), 'Payload copy should acknowledge the copied value');
		} finally {
			await env.restore();
		}
	});

	test('colorbuddy.convertColorFormat reports when no active editor is present', async () => {
		const env = await setupCommandTestEnvironment();
		try {
			const command = env.registeredCommands.get('colorbuddy.convertColorFormat');
			assert.ok(typeof command === 'function', 'Convert color format command missing');

			const initialInfoCount = env.infoMessages.length;
			await (command as (...args: unknown[]) => unknown)();

			const newMessages = env.infoMessages.slice(initialInfoCount);
			assert.ok(newMessages.some(message => message.includes('Open a file')), 'Expected guidance message when no editor is active');
		} finally {
			await env.restore();
		}
	});

	test('colorbuddy.convertColorFormat reports when no color is under the cursor', async () => {
		const env = await setupCommandTestEnvironment();
		try {
			const command = env.registeredCommands.get('colorbuddy.convertColorFormat');
			assert.ok(typeof command === 'function', 'Convert color format command missing');

			const document = createMockDocument('body { color: inherit; }');
			const cursor = document.positionAt(document.getText().indexOf('inherit'));
			const selection = new vscode.Selection(cursor, cursor);
			const editor = createEditor(document, selection);
			env.setActiveEditor(editor);
			env.setVisibleEditors([editor]);

			const initialInfoCount = env.infoMessages.length;
			await (command as (...args: unknown[]) => unknown)();

			const newMessages = env.infoMessages.slice(initialInfoCount);
			assert.ok(newMessages.some(message => message.includes('cursor on a color')), 'Expected guidance message when no color is detected');
		} finally {
			await env.restore();
		}
	});

	test('colorbuddy.convertColorFormat replaces the color literal with the chosen format', async () => {
		const env = await setupCommandTestEnvironment();
		try {
			const command = env.registeredCommands.get('colorbuddy.convertColorFormat');
			assert.ok(typeof command === 'function', 'Convert color format command missing');

			const document = createMockDocument(`body { color: ${FIND_COLOR_USAGE_HEX}; }`);
			const colorOffset = document.getText().indexOf(FIND_COLOR_USAGE_HEX) + 1;
			const cursor = document.positionAt(colorOffset);
			const selection = new vscode.Selection(cursor, cursor);
			const editor = createEditor(document, selection);
			env.setActiveEditor(editor);
			env.setVisibleEditors([editor]);

			const appliedEdits: Array<{ range: vscode.Range; text: string }> = [];
			(editor as unknown as { edit: typeof editor.edit }).edit = async callback => {
				callback({
					replace: (range: vscode.Range, text: string) => {
						appliedEdits.push({ range, text });
					}
				} as vscode.TextEditorEdit);
				return true;
			};

			env.setQuickPickHandler(items => items.find(item => item.label.toLowerCase().startsWith('rgb')) ?? items[0]);

			const initialInfoCount = env.infoMessages.length;
			await (command as (...args: unknown[]) => unknown)();

			assert.strictEqual(env.quickPickRequests.length, 1, 'Expected a quick pick for conversion targets');
			assert.ok(appliedEdits.length === 1, 'Expected a single edit to be applied');
			const [edit] = appliedEdits;
			assert.ok(edit.text.toLowerCase().startsWith('rgb'), 'Converted text should be in RGB format');
			const infoMessages = env.infoMessages.slice(initialInfoCount);
			assert.ok(infoMessages.some(message => message.includes(edit.text)), 'Success message should mention the converted value');
		} finally {
			await env.restore();
		}
	});

	test('colorbuddy.testColorAccessibility reports when no active editor is present', async () => {
		const env = await setupCommandTestEnvironment();
		try {
			const command = env.registeredCommands.get('colorbuddy.testColorAccessibility');
			assert.ok(typeof command === 'function', 'Test color accessibility command missing');

			const initialInfoCount = env.infoMessages.length;
			await (command as (...args: unknown[]) => unknown)();

			const newMessages = env.infoMessages.slice(initialInfoCount);
			assert.ok(newMessages.some(message => message.includes('Open a file')), 'Expected guidance message when no editor is active');
		} finally {
			await env.restore();
		}
	});

	test('colorbuddy.testColorAccessibility reports when no color is under the cursor', async () => {
		const env = await setupCommandTestEnvironment();
		try {
			const command = env.registeredCommands.get('colorbuddy.testColorAccessibility');
			assert.ok(typeof command === 'function', 'Test color accessibility command missing');

			const document = createMockDocument('body { color: inherit; }');
			const cursor = document.positionAt(document.getText().indexOf('inherit'));
			const selection = new vscode.Selection(cursor, cursor);
			const editor = createEditor(document, selection);
			env.setActiveEditor(editor);
			env.setVisibleEditors([editor]);

			const initialInfoCount = env.infoMessages.length;
			await (command as (...args: unknown[]) => unknown)();

			const newMessages = env.infoMessages.slice(initialInfoCount);
			assert.ok(newMessages.some(message => message.includes('cursor on a color')), 'Expected guidance message when no color is detected');
		} finally {
			await env.restore();
		}
	});

	test('colorbuddy.testColorAccessibility shows contrast summary for the active color', async () => {
		const env = await setupCommandTestEnvironment();
		try {
			const command = env.registeredCommands.get('colorbuddy.testColorAccessibility');
			assert.ok(typeof command === 'function', 'Test color accessibility command missing');

			const document = createMockDocument(`body { color: ${FIND_COLOR_USAGE_HEX}; }`);
			const colorOffset = document.getText().indexOf(FIND_COLOR_USAGE_HEX) + 1;
			const cursor = document.positionAt(colorOffset);
			const selection = new vscode.Selection(cursor, cursor);
			const editor = createEditor(document, selection);
			env.setActiveEditor(editor);
			env.setVisibleEditors([editor]);

			const initialInfoCount = env.infoMessages.length;
			await (command as (...args: unknown[]) => unknown)();

			const newMessages = env.infoMessages.slice(initialInfoCount);
			assert.ok(newMessages.length > 0, 'Expected an accessibility summary message');
			const summary = newMessages[0];
			assert.ok(summary.includes('Accessibility for'), 'Summary should mention the evaluated color');
			assert.ok(summary.includes('Contrast on white'), 'Summary should include contrast against white');
			assert.ok(summary.includes('Contrast on black'), 'Summary should include contrast against black');
		} finally {
			await env.restore();
		}
	});

	test('colorbuddy.findColorUsages reports when no color is available', async () => {
		const env = await setupCommandTestEnvironment();
		try {
			const command = env.registeredCommands.get('colorbuddy.findColorUsages');
			assert.ok(typeof command === 'function', 'Find color usages command missing');

			await (command as (...args: unknown[]) => unknown)();

			assert.strictEqual(env.quickPickRequests.length, 0, 'No quick pick expected without colors');
			assert.ok(env.infoMessages.some(message => message.includes('usage search')), 'Expected guidance message when no colors are available');
			assert.strictEqual(env.getTextSearchInvocations().length, 0, 'Search should not run without a target');
		} finally {
			await env.restore();
		}
	});

	test('colorbuddy.findColorUsages searches using active color and opens results', async () => {
		const env = await setupCommandTestEnvironment();
		try {
			const command = env.registeredCommands.get('colorbuddy.findColorUsages');
			assert.ok(typeof command === 'function', 'Find color usages command missing');

			const document = createMockDocument(`body { color: ${FIND_COLOR_USAGE_HEX}; background: white; }`);
			const colorOffset = document.getText().indexOf(FIND_COLOR_USAGE_HEX) + 1;
			const cursor = document.positionAt(colorOffset);
			const selection = new vscode.Selection(cursor, cursor);
			const editor = createEditor(document, selection);
			env.setActiveEditor(editor);
			env.setVisibleEditors([editor]);
			env.setQuickPickHandler(items => items[0]);
			env.setTextSearchMatches([
				createTextSearchMatch(
					FIND_COLOR_USAGE_FIXTURE_URI,
					FIND_COLOR_USAGE_PREVIEW,
					FIND_COLOR_USAGE_LINE_INDEX,
					FIND_COLOR_USAGE_START,
					FIND_COLOR_USAGE_END
				)
			]);

			await (command as (...args: unknown[]) => unknown)();

			const searches = env.getTextSearchInvocations();
			assert.strictEqual(searches.length, 1, 'Expected a single text search invocation');
			assert.ok((searches[0].query.pattern ?? '').includes(FIND_COLOR_USAGE_HEX), 'Search query should include the selected color');
			assert.ok(env.quickPickRequests.length >= 1, 'Expected quick pick interaction for results');
			assert.strictEqual(env.showTextDocuments.length, 1, 'Should open the document for the selected match');
			assert.strictEqual(
				env.showTextDocuments[0].document.uri.toString(),
				FIND_COLOR_USAGE_FIXTURE_URI.toString(),
				'Expected the fixture document to open'
			);
		} finally {
			await env.restore();
		}
	});

	test('colorbuddy.findColorUsages reports when no occurrences are found', async () => {
		const env = await setupCommandTestEnvironment();
		try {
			const command = env.registeredCommands.get('colorbuddy.findColorUsages');
			assert.ok(typeof command === 'function', 'Find color usages command missing');

			const document = createMockDocument(`body { color: ${FIND_COLOR_USAGE_HEX}; }`);
			const cursor = document.positionAt(document.getText().indexOf(FIND_COLOR_USAGE_HEX) + 1);
			const selection = new vscode.Selection(cursor, cursor);
			const editor = createEditor(document, selection);
			env.setActiveEditor(editor);
			env.setVisibleEditors([editor]);
			env.setQuickPickHandler(items => items[0]);
			env.setTextSearchMatches([]);

			const initialInfoCount = env.infoMessages.length;
			await (command as (...args: unknown[]) => unknown)();

			const afterMessages = env.infoMessages.slice(initialInfoCount);
			assert.ok(afterMessages.some(message => message.includes('No usages found')), 'Expected no results message');
			assert.strictEqual(env.getTextSearchInvocations().length, 1, 'Should still perform a search for the color');
		} finally {
			await env.restore();
		}
	});
});
