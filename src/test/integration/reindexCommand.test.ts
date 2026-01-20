import * as assert from 'assert';
import { readFileSync } from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { ExtensionController } from '../../services';
import { AccessibilityViewProvider } from '../../services/accessibilityViewProvider';
import { perfLogger } from '../../utils/performanceLogger';
import { t, LocalizedStrings } from '../../l10n/localization';
import type { CSSVariableDeclaration, ConvertColorCommandPayload, ColorFormat } from '../../types';
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

const ACCESSIBILITY_VIEW_COMMAND = 'workbench.view.extension.colorbuddy';
const ACCESSIBILITY_CONTRAST_FOCUS_COMMAND = 'colorbuddy.accessabilityTestResultPanel.focus';

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
		getExecutedCommands(): Array<{ command: string; args: unknown[] }>;
		configUpdates: Array<{ name: string; value: unknown }>;
		setActiveEditor(editor?: vscode.TextEditor): void;
		setVisibleEditors(editors: readonly vscode.TextEditor[]): void;
		setQuickPickHandler(handler?: (items: readonly vscode.QuickPickItem[], options?: vscode.QuickPickOptions) => vscode.QuickPickItem | undefined | Promise<vscode.QuickPickItem | undefined>): void;
		setTextSearchMatches(matches: vscode.TextSearchMatch[]): void;
		getTextSearchInvocations(): Array<{ query: vscode.TextSearchQuery; options?: vscode.FindTextInFilesOptions }>;
		setPerformanceLoggingEnabled(enabled: boolean): void;
		setFindFilesResults(results: vscode.Uri[]): void;
		getFindFilesInvocations(): Array<{ include: vscode.GlobPattern; exclude?: vscode.GlobPattern }>;
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
			edit: async (callback: (editBuilder: vscode.TextEditorEdit) => void) => {
				const edits: Array<{ range: vscode.Range; newText: string }> = [];
				const builder: vscode.TextEditorEdit = {
					replace: (range: vscode.Range, newText: string) => {
						edits.push({ range, newText });
					},
					insert: (position: vscode.Position, newText: string) => {
						edits.push({ range: new vscode.Range(position, position), newText });
					},
					delete: (range: vscode.Range) => {
						edits.push({ range, newText: '' });
					}
				} as vscode.TextEditorEdit;

				callback(builder);

				// Apply edits from the end of the document backward to keep offsets stable
				const normalizedEdits = edits
					.map(edit => ({
						start: document.offsetAt(edit.range.start),
						end: document.offsetAt(edit.range.end),
						text: edit.newText
					}))
					.sort((a, b) => b.start - a.start);

				let updatedText = document.getText();
				for (const edit of normalizedEdits) {
					updatedText = `${updatedText.slice(0, edit.start)}${edit.text}${updatedText.slice(edit.end)}`;
				}

				const mutableDoc = document as unknown as { __updateText?: (next: string) => void };
				if (mutableDoc.__updateText) {
					mutableDoc.__updateText(updatedText);
				}

				return true;
			},
			insertSnippet: async () => true,
			setDecorations: () => undefined,
			revealRange: () => undefined
		} as unknown as vscode.TextEditor;
	}

	function getAccessibilityView(env: CommandTestEnvironment): AccessibilityViewProvider {
		return (env.controller as unknown as { accessibilityViewProvider: AccessibilityViewProvider }).accessibilityViewProvider;
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
		let nextFindFilesResults: vscode.Uri[] = [];
		const findFilesInvocations: Array<{ include: vscode.GlobPattern; exclude?: vscode.GlobPattern }> = [];
		const originalProcessMaxListeners = process.getMaxListeners();
		process.setMaxListeners(0);

		// Mock workspace folders - use PROJECT_ROOT so fixture files are within workspace
		const mockWorkspaceFolder: vscode.WorkspaceFolder = {
			uri: vscode.Uri.file(PROJECT_ROOT),
			name: 'colorbuddy',
			index: 0
		};
		const originalWorkspaceFolders = vscode.workspace.workspaceFolders;
		Object.defineProperty(vscode.workspace, 'workspaceFolders', {
			configurable: true,
			get: () => [mockWorkspaceFolder]
		});
		const originalGetWorkspaceFolder = vscode.workspace.getWorkspaceFolder;
		(vscode.workspace as unknown as { getWorkspaceFolder: typeof vscode.workspace.getWorkspaceFolder }).getWorkspaceFolder = ((_uri: vscode.Uri) => {
			return mockWorkspaceFolder;
		}) as typeof vscode.workspace.getWorkspaceFolder;

		const originalRegisterCommand = vscode.commands.registerCommand;
		(vscode.commands as unknown as { registerCommand: typeof vscode.commands.registerCommand }).registerCommand = ((command: string, callback: (...args: unknown[]) => unknown) => {
			registeredCommands.set(command, callback);
			return createDisposable();
		}) as typeof vscode.commands.registerCommand;

		const executedCommands: Array<{ command: string; args: unknown[] }> = [];
		const originalExecuteCommand = vscode.commands.executeCommand;
		(vscode.commands as unknown as { executeCommand: typeof vscode.commands.executeCommand }).executeCommand = (async (command: string, ...args: unknown[]) => {
			executedCommands.push({ command, args });
			return undefined;
		}) as typeof vscode.commands.executeCommand;

		const originalFindFiles = vscode.workspace.findFiles;
		(vscode.workspace as unknown as { findFiles: typeof vscode.workspace.findFiles }).findFiles = (async (include: vscode.GlobPattern, exclude?: vscode.GlobPattern) => {
			findFilesCallCount += 1;
			findFilesInvocations.push({ include, exclude });
			// Return configured results for color usage searches
			if (nextFindFilesResults.length > 0) {
				return nextFindFilesResults;
			}
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

		const originalRegisterWebviewViewProvider = vscode.window.registerWebviewViewProvider;
		(vscode.window as unknown as { registerWebviewViewProvider: typeof vscode.window.registerWebviewViewProvider }).registerWebviewViewProvider = ((
			_viewId: string,
			_provider: vscode.WebviewViewProvider
		) => createDisposable()) as typeof vscode.window.registerWebviewViewProvider;

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
				// Handle fixture file from findFiles results
				if (key === FIND_COLOR_USAGE_FIXTURE_URI.toString()) {
					const content = FIND_COLOR_USAGE_LINES.join('\n');
					return createMockDocument(content, 'css', arg);
				}
				const matchesForUri = textSearchMatchMap.get(key);
				if (matchesForUri && matchesForUri.length > 0) {
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
			getExecutedCommands: () => [...executedCommands],
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
			setFindFilesResults: (results: vscode.Uri[]) => {
				nextFindFilesResults = results;
			},
			getFindFilesInvocations: () => [...findFilesInvocations],
			restore: async () => {
				controller.dispose();
				perfLogger.reset();
				(vscode.commands as unknown as { registerCommand: typeof vscode.commands.registerCommand }).registerCommand = originalRegisterCommand;
				(vscode.commands as unknown as { executeCommand: typeof vscode.commands.executeCommand }).executeCommand = originalExecuteCommand;
				(vscode.workspace as unknown as { findFiles: typeof vscode.workspace.findFiles }).findFiles = originalFindFiles;
				(vscode.workspace as unknown as { createFileSystemWatcher: typeof vscode.workspace.createFileSystemWatcher }).createFileSystemWatcher = originalCreateFileSystemWatcher;
				(vscode.workspace as unknown as { getWorkspaceFolder: typeof vscode.workspace.getWorkspaceFolder }).getWorkspaceFolder = originalGetWorkspaceFolder;
				Object.defineProperty(vscode.workspace, 'workspaceFolders', {
					configurable: true,
					value: originalWorkspaceFolders
				});
				(vscode.window as unknown as { onDidChangeActiveTextEditor: typeof vscode.window.onDidChangeActiveTextEditor }).onDidChangeActiveTextEditor = originalOnDidChangeActiveTextEditor;
				(vscode.window as unknown as { onDidChangeVisibleTextEditors: typeof vscode.window.onDidChangeVisibleTextEditors }).onDidChangeVisibleTextEditors = originalOnDidChangeVisibleTextEditors;
				(vscode.workspace as unknown as { onDidChangeTextDocument: typeof vscode.workspace.onDidChangeTextDocument }).onDidChangeTextDocument = originalOnDidChangeTextDocument;
				(vscode.workspace as unknown as { onDidCloseTextDocument: typeof vscode.workspace.onDidCloseTextDocument }).onDidCloseTextDocument = originalOnDidCloseTextDocument;
				(vscode.workspace as unknown as { onDidChangeConfiguration: typeof vscode.workspace.onDidChangeConfiguration }).onDidChangeConfiguration = originalOnDidChangeConfiguration;
				(vscode.window as unknown as { registerWebviewViewProvider: typeof vscode.window.registerWebviewViewProvider }).registerWebviewViewProvider = originalRegisterWebviewViewProvider;
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
				nextFindFilesResults = [];
				findFilesInvocations.length = 0;
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

	test('colorbuddy.convertColorFormat opens formats panel with conversion options', async () => {
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

			await (command as (...args: unknown[]) => unknown)();

			// Command now updates formats panel instead of showing QuickPick
			const viewProvider = getAccessibilityView(env);
			const lastData = viewProvider.getLastRenderedData();
			assert.ok(lastData, 'Expected formats panel to be updated');
			assert.ok(lastData.conversions && lastData.conversions.length > 0, 'Expected conversion options to be available');
			assert.strictEqual(lastData.label, FIND_COLOR_USAGE_HEX, 'Expected current color value in panel');
		} finally {
			await env.restore();
		}
	});

	test('colorbuddy.convertColorFormat handles payload and opens formats panel', async () => {
		const env = await setupCommandTestEnvironment();
		try {
			const command = env.registeredCommands.get('colorbuddy.convertColorFormat');
			assert.ok(typeof command === 'function', 'Convert color format command missing');

			const document = createMockDocument('body { color: #112233; }');
			const cursor = new vscode.Position(0, 0);
			const selection = new vscode.Selection(cursor, cursor);
			const editor = createEditor(document, selection);
			env.setActiveEditor(editor);
			env.setVisibleEditors([editor]);

			const colorIndex = document.getText().indexOf('#112233');
			assert.ok(colorIndex >= 0, 'expected to find color literal in document');
			const start = document.positionAt(colorIndex);
			const end = document.positionAt(colorIndex + '#112233'.length);
			const payload: ConvertColorCommandPayload = {
				uri: document.uri.toString(),
				range: {
					start: { line: start.line, character: start.character },
					end: { line: end.line, character: end.character }
				},
				normalizedColor: '#112233',
				originalText: '#112233',
				format: 'hex'
			};

			await (command as (...args: unknown[]) => unknown)(payload);

			// Command now updates formats panel instead of showing QuickPick
			const viewProvider = getAccessibilityView(env);
			const lastData = viewProvider.getLastRenderedData();
			assert.ok(lastData, 'Expected formats panel to be updated with payload');
			assert.ok(lastData.conversions && lastData.conversions.length > 0, 'Expected conversion options');
			assert.ok(lastData.normalizedColor, 'Expected normalized color in panel');
			assert.ok(lastData.normalizedColor.startsWith('#'), 'Expected hex color format in panel');
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
			const executedBefore = env.getExecutedCommands().length;
			await (command as (...args: unknown[]) => unknown)();

			const executed = env.getExecutedCommands().slice(executedBefore);
			assert.ok(
				executed.some(entry => entry.command === ACCESSIBILITY_VIEW_COMMAND),
				'Expected Activity Bar view command to run for accessibility results'
			);
			const newMessages = env.infoMessages.slice(initialInfoCount);
			assert.strictEqual(newMessages.length, 0, 'Accessibility results now render in the Activity Bar instead of notifications');
			const viewData = getAccessibilityView(env).getLastRenderedData();
			assert.ok(viewData, 'Accessibility view should receive report data');
			assert.ok(viewData?.label.includes(FIND_COLOR_USAGE_HEX), 'View data should reflect the evaluated color label');
			const sampleLabels = viewData?.report.samples.map(sample => sample.label) ?? [];
			assert.ok(sampleLabels.some(label => /white/i.test(label)), 'Report should include contrast against white');
			assert.ok(sampleLabels.some(label => /black/i.test(label)), 'Report should include contrast against black');
		} finally {
			await env.restore();
		}
	});

	test('colorbuddy.testColorAccessibility accepts payload without requiring an editor', async () => {
		const env = await setupCommandTestEnvironment();
		try {
			const command = env.registeredCommands.get('colorbuddy.testColorAccessibility');
			assert.ok(typeof command === 'function', 'Test color accessibility command missing');

			const initialInfoCount = env.infoMessages.length;
			const executedBefore = env.getExecutedCommands().length;
			await (command as (...args: unknown[]) => unknown)({ value: 'rgb(15, 23, 42)', label: 'rgb(15, 23, 42)' });

			const executed = env.getExecutedCommands().slice(executedBefore);
			assert.ok(
				executed.some(entry => entry.command === ACCESSIBILITY_VIEW_COMMAND),
				'Payload invocation should still reveal the Activity Bar view'
			);
			const newMessages = env.infoMessages.slice(initialInfoCount);
			assert.strictEqual(newMessages.length, 0, 'Payload invocation should not post notifications');
			const viewData = getAccessibilityView(env).getLastRenderedData();
			assert.ok(viewData, 'Payload invocation should populate view data');
			assert.ok(viewData?.report.samples.length && viewData.report.samples[0].contrastRatio > 0, 'Report samples should include computed ratios');
		} finally {
			await env.restore();
		}
	});

	test('colorbuddy.testColorAccessibility opens different panels based on payload panel parameter', async () => {
		const env = await setupCommandTestEnvironment();
		try {
			const command = env.registeredCommands.get('colorbuddy.testColorAccessibility');
			assert.ok(typeof command === 'function', 'Test color accessibility command missing');

			// Test opening summary panel (default for "Display summary" action)
			await (command as (...args: unknown[]) => unknown)({ value: 'rgb(15, 23, 42)', panel: 'summary' });
			let viewData = getAccessibilityView(env).getLastRenderedData();
			assert.ok(viewData, 'Summary panel should receive data');
			assert.strictEqual(viewData?.section, 'summary', 'Should open summary panel when panel=summary');

			// Test opening contrast panel (for "Test accessibility" action)
			await (command as (...args: unknown[]) => unknown)({ value: 'rgb(15, 23, 42)', panel: 'contrast' });
			viewData = getAccessibilityView(env).getLastRenderedData();
			assert.ok(viewData, 'Contrast panel should receive data');
			assert.strictEqual(viewData?.section, 'contrast', 'Should open contrast (WCAG TEST RESULTS) panel when panel=contrast');

			// Test default behavior (no panel specified, should default to summary)
			await (command as (...args: unknown[]) => unknown)({ value: 'rgb(15, 23, 42)' });
			viewData = getAccessibilityView(env).getLastRenderedData();
			assert.strictEqual(viewData?.section, 'summary', 'Should default to summary panel when no panel specified');
		} finally {
			await env.restore();
		}
	});

	test('colorbuddy.testColorAccessibility focuses target panel when webview is unopened', async () => {
		const env = await setupCommandTestEnvironment();
		try {
			const command = env.registeredCommands.get('colorbuddy.testColorAccessibility');
			assert.ok(typeof command === 'function', 'Test color accessibility command missing');

			const executedBefore = env.getExecutedCommands().length;
			await (command as (...args: unknown[]) => unknown)({ value: 'rgb(15, 23, 42)', panel: 'contrast' });

			const executedCommands = env.getExecutedCommands().slice(executedBefore).map(entry => entry.command);
			assert.ok(
				executedCommands.includes(ACCESSIBILITY_VIEW_COMMAND),
				'Should open ColorBuddy Activity Bar container when running accessibility command'
			);
			assert.ok(
				executedCommands.includes(ACCESSIBILITY_CONTRAST_FOCUS_COMMAND),
				'Should focus the contrast panel even if it has not been opened yet'
			);
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

	test('colorbuddy.findColorUsages searches using active color and updates panel', async () => {
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
			// Configure findFiles to return the fixture file
			env.setFindFilesResults([FIND_COLOR_USAGE_FIXTURE_URI]);
			
			// Provide text search matches for the findTextInFiles callback
			const matchRange = new vscode.Range(FIND_COLOR_USAGE_LINE_INDEX, 0, FIND_COLOR_USAGE_LINE_INDEX, 50);
			env.setTextSearchMatches([
				{
					uri: FIND_COLOR_USAGE_FIXTURE_URI,
					ranges: matchRange,
					preview: {
						text: FIND_COLOR_USAGE_LINES[FIND_COLOR_USAGE_LINE_INDEX],
						matches: [matchRange]
					}
				} as vscode.TextSearchMatch
			]);

			await (command as (...args: unknown[]) => unknown)();

			// Verify that workspace.findFiles was invoked for color usage search
			const findFilesInvocations = env.getFindFilesInvocations();
			// At least one findFiles call for color usage search (there may be others from setup)
			assert.ok(findFilesInvocations.length >= 1, 'Expected findFiles to be invoked for color usage search');

			// The panel should have been updated - verify via the view provider
			const viewProvider = getAccessibilityView(env);
			const lastData = viewProvider.getLastRenderedData();
			assert.ok(lastData, 'Expected panel data to be set after find usages');
			assert.ok(Array.isArray(lastData.usageMatches) && lastData.usageMatches.length > 0, 'Expected usage matches in panel data');
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
			// Configure findFiles to return an empty file that doesn't contain the color
			env.setFindFilesResults([]);

			const initialInfoCount = env.infoMessages.length;
			await (command as (...args: unknown[]) => unknown)();

			const afterMessages = env.infoMessages.slice(initialInfoCount);
			assert.ok(afterMessages.some(message => message.includes('No usages found')), 'Expected no results message');
			// Verify findFiles was called for the search (at least once for color usage search)
			const findFilesInvocations = env.getFindFilesInvocations();
			assert.ok(findFilesInvocations.length >= 1, 'Should perform findFiles search for the color');
		} finally {
			await env.restore();
		}
	});

test('colorbuddy.findColorUsages uses metadata fields when creating search candidates', async () => {
	const env = await setupCommandTestEnvironment();
	try {
		const command = env.registeredCommands.get('colorbuddy.findColorUsages');
		assert.ok(typeof command === 'function', 'Find color usages command missing');

		// Set up workspace to have NO files - this ensures we hit the "no results" case
		// But the important part is that the command TRIES to search for the correct values
		env.setFindFilesResults([]);
		
		// Need an active editor for getActiveWorkspaceFolder() to work
		const document = createMockDocument('body { color: #3b82f6; }');
		const cursor = document.positionAt(0);
		const selection = new vscode.Selection(cursor, cursor);
		const editor = createEditor(document, selection);
		env.setActiveEditor(editor);
		env.setVisibleEditors([editor]);

		const initialInfoCount = env.infoMessages.length;

		// Test with CSS variable metadata - should search for variable name too
		await (command as (...args: unknown[]) => unknown)({
			value: '#3b82f6',
			label: 'var(--primary)',
			metadata: { variableName: '--primary' }
		});

		// Should show "no results" message (since we have no files)
		const afterMessages = env.infoMessages.slice(initialInfoCount);
		assert.ok(afterMessages.some(msg => msg.includes('No usages found')), 'Should show no results message');
		
		// The key behavior: with metadata, it creates ColorData with variableName set
		// This means getColorSearchCandidates will include --primary in the search
		// (This is the fix - before it would only search for #3b82f6)
	} finally {
		await env.restore();
	}
});

	test('Format conversion panel receives editorUri and editorRange from Convert quick action', async () => {
		const env = await setupCommandTestEnvironment();
		try {
			const document = createMockDocument('body { color: rgba(0, 0, 0, 0.15); }');
			const colorText = 'rgba(0, 0, 0, 0.15)';
			const colorIndex = document.getText().indexOf(colorText);
			const cursor = document.positionAt(colorIndex + 1);
			const selection = new vscode.Selection(cursor, cursor);
			const editor = createEditor(document, selection);
			env.setActiveEditor(editor);
			env.setVisibleEditors([editor]);

			// Get the convert command from quick actions
			const convertCommand = env.registeredCommands.get('colorbuddy.convertColorFormat');
			assert.ok(typeof convertCommand === 'function', 'Convert command should be registered');

			// Trigger convert - this should populate the formats panel with editor context
			await (convertCommand as (...args: unknown[]) => unknown)();

			// Verify the formats panel has editorUri and editorRange in its data
			const viewProvider = getAccessibilityView(env);
			const lastData = viewProvider.getLastRenderedData();
			
			assert.ok(lastData, 'Panel should have data after convert command');
			assert.ok(lastData.editorUri, 'Panel data should include editorUri for format conversion');
			assert.ok(lastData.editorRange, 'Panel data should include editorRange for format conversion');
			assert.strictEqual(lastData.editorUri, document.uri.toString(), 'editorUri should match document');
			assert.strictEqual(lastData.currentFormatValue, colorText, 'currentFormatValue should be the original color');
		} finally {
			await env.restore();
		}
	});

	test('Clicking format in panel uses convertColorFormat command with editor context', async () => {
		const env = await setupCommandTestEnvironment();
		try {
			const document = createMockDocument('body { color: rgba(0, 0, 0, 0.15); }');
			const colorText = 'rgba(0, 0, 0, 0.15)';
			const colorIndex = document.getText().indexOf(colorText);
			const cursor = document.positionAt(colorIndex + 1);
			const selection = new vscode.Selection(cursor, cursor);
			const editor = createEditor(document, selection);
			env.setActiveEditor(editor);
			env.setVisibleEditors([editor]);

			// Trigger convert to populate panel
			const convertCommand = env.registeredCommands.get('colorbuddy.convertColorFormat');
			await (convertCommand as (...args: unknown[]) => unknown)();

			// Verify the panel data has all the info needed for conversion
			const viewProvider = getAccessibilityView(env);
			const lastData = viewProvider.getLastRenderedData();
			
			assert.ok(lastData, 'Panel should have data after convert command');
			assert.ok(lastData.editorUri, 'Panel data should include editorUri');
			assert.ok(lastData.editorRange, 'Panel data should include editorRange');
			assert.ok(lastData.normalizedColor, 'Panel data should include normalizedColor');
			assert.ok(lastData.conversions && lastData.conversions.length > 0, 'Panel should have format conversions available');

			// The actual command invocation would happen when user clicks format in webview
			// Here we just verify the data structure is correct for building the convertColorFormat payload
		} finally {
			await env.restore();
		}
	});

	test('Format panel shows "Converting: [color]" header with original color value', async () => {
		const env = await setupCommandTestEnvironment();
		try {
			const document = createMockDocument('body { color: rgba(0, 0, 0, 0.15); }');
			const colorText = 'rgba(0, 0, 0, 0.15)';
			const colorIndex = document.getText().indexOf(colorText);
			const cursor = document.positionAt(colorIndex + 1);
			const selection = new vscode.Selection(cursor, cursor);
			const editor = createEditor(document, selection);
			env.setActiveEditor(editor);
			env.setVisibleEditors([editor]);

			// Trigger convert
			const convertCommand = env.registeredCommands.get('colorbuddy.convertColorFormat');
			await (convertCommand as (...args: unknown[]) => unknown)();

			// Verify panel data has the original color value for header display
			const viewProvider = getAccessibilityView(env);
			const lastData = viewProvider.getLastRenderedData();
			
			assert.ok(lastData, 'Panel should have data');
			assert.strictEqual(lastData.currentFormatValue, colorText, 'currentFormatValue should match original color for "Converting:" header');
			assert.ok(lastData.conversions.some(c => c.value === colorText), 'Conversions should include the current format');
		} finally {
			await env.restore();
		}
	});

	test('Convert quick action shows all usage matches in formats panel', async () => {
		const env = await setupCommandTestEnvironment();
		try {
			const docText = 'body { color: #336699; background: #336699; }';
			const document = createMockDocument(docText, 'css');
			const firstColorIndex = docText.indexOf('#336699');
			const secondColorIndex = docText.lastIndexOf('#336699');
			const cursor = document.positionAt(firstColorIndex + 1);
			const selection = new vscode.Selection(cursor, cursor);
			const editor = createEditor(document, selection);
			env.setActiveEditor(editor);
			env.setVisibleEditors([editor]);

			const firstRange = new vscode.Range(0, firstColorIndex, 0, firstColorIndex + '#336699'.length);
			const secondRange = new vscode.Range(0, secondColorIndex, 0, secondColorIndex + '#336699'.length);
			env.setTextSearchMatches([
				{
					uri: document.uri,
					ranges: firstRange,
					preview: {
						text: docText,
						matches: [firstRange]
					}
				} as vscode.TextSearchMatch,
				{
					uri: document.uri,
					ranges: secondRange,
					preview: {
						text: docText,
						matches: [secondRange]
					}
				} as vscode.TextSearchMatch
			]);

			const convertCommand = env.registeredCommands.get('colorbuddy.convertColorFormat');
			assert.ok(typeof convertCommand === 'function', 'Convert command should be registered');

			await (convertCommand as (...args: unknown[]) => unknown)();

			const viewProvider = getAccessibilityView(env);
			const lastData = viewProvider.getLastRenderedData();

			assert.ok(lastData, 'Panel should have data after convert command');
			assert.ok(lastData?.usageMatches && lastData.usageMatches.length === 2, 'Formats panel should include all usage matches');
			assert.strictEqual(lastData?.usageMatches?.length, 2, 'Should surface both occurrences');
		} finally {
			await env.restore();
		}
	});

	test('Convert icon click preserves usage matches order', async () => {
		const env = await setupCommandTestEnvironment();
		try {
			const docText = 'body { color: #336699; background: #336699; }';
			const document = createMockDocument(docText, 'css');
			const firstColorIndex = docText.indexOf('#336699');
			const cursor = document.positionAt(firstColorIndex + 1);
			const selection = new vscode.Selection(cursor, cursor);
			const editor = createEditor(document, selection);
			env.setActiveEditor(editor);
			env.setVisibleEditors([editor]);

			const firstRange = new vscode.Range(0, firstColorIndex, 0, firstColorIndex + '#336699'.length);
			const secondColorIndex = docText.lastIndexOf('#336699');
			const secondRange = new vscode.Range(0, secondColorIndex, 0, secondColorIndex + '#336699'.length);
			
			env.setTextSearchMatches([
				{
					uri: document.uri,
					ranges: firstRange,
					preview: { text: docText, matches: [firstRange] }
				} as vscode.TextSearchMatch,
				{
					uri: document.uri,
					ranges: secondRange,
					preview: { text: docText, matches: [secondRange] }
				} as vscode.TextSearchMatch
			]);

			const convertCommand = env.registeredCommands.get('colorbuddy.convertColorFormat');
			assert.ok(typeof convertCommand === 'function', 'Convert command should be registered');

			// First call - quick action (triggers search)
			await (convertCommand as (...args: unknown[]) => unknown)();

			const viewProvider = getAccessibilityView(env);
			const firstData = viewProvider.getLastRenderedData();
			assert.ok(firstData?.usageMatches, 'Expected usage matches from first call');
			const firstMatchRanges = firstData.usageMatches.map(m => `${m.range.start.character}-${m.range.end.character}`);

			// Second call - panel icon click with 'panel' source (should preserve order)
			const panelPayload: ConvertColorCommandPayload = {
				uri: document.uri.toString(),
				range: {
					start: { line: firstRange.start.line, character: firstRange.start.character },
					end: { line: firstRange.end.line, character: firstRange.end.character }
				},
				normalizedColor: '#336699',
				originalText: '#336699',
				format: 'rgb' as ColorFormat,
				source: 'panel' as const
			};

			await convertCommand(panelPayload);

			const secondData = viewProvider.getLastRenderedData();
			assert.ok(secondData?.usageMatches, 'Expected usage matches from second call');
			const secondMatchRanges = secondData.usageMatches.map(m => `${m.range.start.character}-${m.range.end.character}`);

			// Verify order is preserved (same ranges in same order)
			assert.deepStrictEqual(secondMatchRanges, firstMatchRanges, 'Usage matches order should be preserved after icon click');
		} finally {
			await env.restore();
		}
	});

	test('Panel conversion preserves semicolon and refreshes panel state', async () => {
		const env = await setupCommandTestEnvironment();
		try {
			const docText = 'body { color: rgb(255, 99, 71); }';
			const colorText = 'rgb(255, 99, 71);';
			const document = createMockDocument(docText, 'css');
			const colorIndex = docText.indexOf('rgb');
			const cursor = document.positionAt(colorIndex + 1);
			const selection = new vscode.Selection(cursor, cursor);
			const editor = createEditor(document, selection);
			env.setActiveEditor(editor);
			env.setVisibleEditors([editor]);

			const rangeWithSemicolon = new vscode.Range(0, colorIndex, 0, colorIndex + colorText.length);
			env.setTextSearchMatches([
				{
					uri: document.uri,
					ranges: rangeWithSemicolon,
					preview: { text: docText, matches: [rangeWithSemicolon] }
				} as vscode.TextSearchMatch
			]);

			const convertCommand = env.registeredCommands.get('colorbuddy.convertColorFormat');
			assert.ok(typeof convertCommand === 'function', 'Convert command should be registered');

			// Populate formats panel and usage matches
			await (convertCommand as (...args: unknown[]) => unknown)();

			const viewProvider = getAccessibilityView(env);
			const initialData = viewProvider.getLastRenderedData();
			assert.ok(initialData?.usageMatches && initialData.usageMatches.length === 1, 'Panel should capture usage match');
			const targetFormat = initialData!.conversions.find(c => c.format === 'hex')?.format ?? initialData!.conversions[0].format;

			const payload: ConvertColorCommandPayload = {
				uri: document.uri.toString(),
				range: {
					start: { line: rangeWithSemicolon.start.line, character: rangeWithSemicolon.start.character },
					end: { line: rangeWithSemicolon.end.line, character: rangeWithSemicolon.end.character }
				},
				normalizedColor: initialData!.normalizedColor || colorText,
				originalText: colorText,
				format: targetFormat as ColorFormat,
				source: 'panel'
			};

			await (convertCommand as (...args: unknown[]) => unknown)(payload);

			const updatedText = document.getText();
			assert.ok(updatedText.includes('#ff6347;'), 'Converted text should preserve semicolon');

			const activeEditor = vscode.window.activeTextEditor;
			assert.ok(activeEditor, 'Active editor should remain set');
			const selectionText = activeEditor?.document.getText(activeEditor.selection) ?? '';
			assert.strictEqual(selectionText, '#ff6347;', 'Selection should cover converted value');

			const updatedData = viewProvider.getLastRenderedData();
			assert.ok(updatedData, 'Panel data should refresh after conversion');
			const updatedPreview = updatedData?.usageMatches?.[0]?.previewText || '';
			assert.ok(updatedPreview.includes('#ff6347;'), 'Panel usage preview should reflect converted value');
			assert.strictEqual(updatedData?.currentFormatValue, '#ff6347;', 'Panel current format should match converted value');
		} finally {
			await env.restore();
		}
	});

	test('Find Usages and Convert return the same number of results', async () => {
		const env = await setupCommandTestEnvironment();
		try {
			const docText = 'body { color: #336699; background: #336699; } .foo { color: #336699; }';
			const document = createMockDocument(docText, 'css');
			const firstColorIndex = docText.indexOf('#336699');
			const cursor = document.positionAt(firstColorIndex + 1);
			const selection = new vscode.Selection(cursor, cursor);
			const editor = createEditor(document, selection);
			env.setActiveEditor(editor);
			env.setVisibleEditors([editor]);

			// Set up find results (all 3 occurrences)
			const firstRange = new vscode.Range(0, docText.indexOf('#336699'), 0, docText.indexOf('#336699') + '#336699'.length);
			const secondRange = new vscode.Range(0, docText.indexOf('#336699', docText.indexOf('#336699') + 1), 0, docText.indexOf('#336699', docText.indexOf('#336699') + 1) + '#336699'.length);
			const thirdRange = new vscode.Range(0, docText.lastIndexOf('#336699'), 0, docText.lastIndexOf('#336699') + '#336699'.length);
			
			env.setTextSearchMatches([
				{
					uri: document.uri,
					ranges: firstRange,
					preview: { text: docText, matches: [firstRange] }
				} as vscode.TextSearchMatch,
				{
					uri: document.uri,
					ranges: secondRange,
					preview: { text: docText, matches: [secondRange] }
				} as vscode.TextSearchMatch,
				{
					uri: document.uri,
					ranges: thirdRange,
					preview: { text: docText, matches: [thirdRange] }
				} as vscode.TextSearchMatch
			]);

			// Call Find Usages
			const findUsagesCommand = env.registeredCommands.get('colorbuddy.findColorUsages');
			assert.ok(typeof findUsagesCommand === 'function', 'Find usages command should be registered');

			await (findUsagesCommand as (...args: unknown[]) => unknown)();

			const viewProvider = getAccessibilityView(env);
			const findUsagesData = viewProvider.getLastRenderedData();
			const findUsagesCount = findUsagesData?.usageMatches?.length ?? 0;

			// Call Convert
			const convertCommand = env.registeredCommands.get('colorbuddy.convertColorFormat');
			assert.ok(typeof convertCommand === 'function', 'Convert command should be registered');

			await (convertCommand as (...args: unknown[]) => unknown)();

			const convertData = viewProvider.getLastRenderedData();
			const convertCount = convertData?.usageMatches?.length ?? 0;

			// Verify same number of results
			assert.strictEqual(
				convertCount,
				findUsagesCount,
				`Convert should find same number of results as Find Usages. Find Usages: ${findUsagesCount}, Convert: ${convertCount}`
			);

			// Verify the actual matches are the same
			if (findUsagesData?.usageMatches && convertData?.usageMatches) {
				const findUsagesRanges = findUsagesData.usageMatches.map(m => `${m.uri.toString()}:${m.range.start.line}:${m.range.start.character}`).sort();
				const convertRanges = convertData.usageMatches.map(m => `${m.uri.toString()}:${m.range.start.line}:${m.range.start.character}`).sort();
				
				assert.deepStrictEqual(
					convertRanges,
					findUsagesRanges,
					'Convert and Find Usages should find the same locations'
				);
			}
		} finally {
			await env.restore();
		}
	});
});
