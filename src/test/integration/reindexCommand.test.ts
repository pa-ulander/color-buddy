import * as assert from 'assert';
import * as vscode from 'vscode';
import { ExtensionController } from '../../services';
import { perfLogger } from '../../utils/performanceLogger';
import type { CSSVariableDeclaration } from '../../types';

process.setMaxListeners(0);

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
		restore(): Promise<void>;
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
			return undefined;
		}) as unknown as typeof vscode.window.showQuickPick;

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

		const originalVisibleTextEditorsDescriptor = Object.getOwnPropertyDescriptor(vscode.window, 'visibleTextEditors');
		Object.defineProperty(vscode.window, 'visibleTextEditors', {
			configurable: true,
			get: () => []
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

		perfLogger.clearMetrics();
		perfLogger.updateEnabled();

		const controller = new ExtensionController(context);
		await controller.activate();

		perfLogger.clearMetrics();

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
			restore: async () => {
				controller.dispose();
				perfLogger.clearMetrics();
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
				(vscode.workspace as unknown as { getConfiguration: typeof vscode.workspace.getConfiguration }).getConfiguration = originalGetConfiguration;
				(vscode.workspace as unknown as { openTextDocument: typeof vscode.workspace.openTextDocument }).openTextDocument = originalOpenTextDocument;
				(vscode.window as unknown as { showTextDocument: typeof vscode.window.showTextDocument }).showTextDocument = originalShowTextDocument;
				if (originalVisibleTextEditorsDescriptor) {
					Object.defineProperty(vscode.window, 'visibleTextEditors', originalVisibleTextEditorsDescriptor);
				} else {
					delete (vscode.window as unknown as Record<string, unknown>).visibleTextEditors;
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

			perfLogger.clearMetrics();
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
});
