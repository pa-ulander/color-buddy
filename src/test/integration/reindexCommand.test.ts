import * as assert from 'assert';
import * as vscode from 'vscode';
import { ExtensionController } from '../../services';

suite('Command Integration', () => {
	function createDisposable(): vscode.Disposable {
		return { dispose: () => undefined };
	}

	test('colorbuddy.reindexCSSFiles reindexes workspace and reports completion', async () => {
		const context = { subscriptions: [] as vscode.Disposable[] } as unknown as vscode.ExtensionContext;
		const registeredCommands = new Map<string, (...args: unknown[]) => unknown>();
		const infoMessages: string[] = [];
		const errorMessages: string[] = [];
		let findFilesCallCount = 0;

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

		const originalShowErrorMessage = vscode.window.showErrorMessage;
		(vscode.window as unknown as { showErrorMessage: typeof vscode.window.showErrorMessage }).showErrorMessage = (async (message: string) => {
			errorMessages.push(message);
			return undefined;
		}) as typeof vscode.window.showErrorMessage;

		const originalShowQuickPick = vscode.window.showQuickPick;
		(vscode.window as unknown as { showQuickPick: typeof vscode.window.showQuickPick }).showQuickPick = (async () => undefined) as typeof vscode.window.showQuickPick;

		const originalGetConfiguration = vscode.workspace.getConfiguration;
		(vscode.workspace as unknown as { getConfiguration: typeof vscode.workspace.getConfiguration }).getConfiguration = ((section?: string) => {
			if (section === 'colorbuddy') {
				return {
					get: <T>(_name: string, defaultValue?: T) => defaultValue,
					has: () => true,
					inspect: () => undefined,
					update: async () => undefined
				} as vscode.WorkspaceConfiguration;
			}
			return originalGetConfiguration(section);
		}) as typeof vscode.workspace.getConfiguration;

		const originalVisibleTextEditorsDescriptor = Object.getOwnPropertyDescriptor(vscode.window, 'visibleTextEditors');
		Object.defineProperty(vscode.window, 'visibleTextEditors', {
			configurable: true,
			get: () => []
		});

		let controller: ExtensionController | null = null;

		try {
			controller = new ExtensionController(context);
			await controller.activate();

			assert.ok(registeredCommands.has('colorbuddy.reindexCSSFiles'), 'Reindex command not registered');
			const reindex = registeredCommands.get('colorbuddy.reindexCSSFiles');
			assert.ok(typeof reindex === 'function', 'Reindex command callback missing');

			const initialCount = findFilesCallCount;
			await (reindex as (...args: unknown[]) => unknown)();

			assert.strictEqual(findFilesCallCount, initialCount + 1, 'Reindex command should trigger workspace indexing');
			assert.ok(infoMessages.some(message => message.includes('CSS indexing complete')), 'Expected success message after reindex command');
			assert.strictEqual(errorMessages.length, 0, 'Reindex command should not surface errors');
		} finally {
			controller?.dispose();

			(vscode.commands as unknown as { registerCommand: typeof vscode.commands.registerCommand }).registerCommand = originalRegisterCommand;
			(vscode.commands as unknown as { executeCommand: typeof vscode.commands.executeCommand }).executeCommand = originalExecuteCommand;
			(vscode.workspace as unknown as { findFiles: typeof vscode.workspace.findFiles }).findFiles = originalFindFiles;
			(vscode.workspace as unknown as { createFileSystemWatcher: typeof vscode.workspace.createFileSystemWatcher }).createFileSystemWatcher = originalCreateFileSystemWatcher;
			(vscode.window as unknown as { onDidChangeActiveTextEditor: typeof vscode.window.onDidChangeActiveTextEditor }).onDidChangeActiveTextEditor = originalOnDidChangeActiveTextEditor;
			(vscode.workspace as unknown as { onDidChangeTextDocument: typeof vscode.workspace.onDidChangeTextDocument }).onDidChangeTextDocument = originalOnDidChangeTextDocument;
			(vscode.workspace as unknown as { onDidCloseTextDocument: typeof vscode.workspace.onDidCloseTextDocument }).onDidCloseTextDocument = originalOnDidCloseTextDocument;
			(vscode.workspace as unknown as { onDidChangeConfiguration: typeof vscode.workspace.onDidChangeConfiguration }).onDidChangeConfiguration = originalOnDidChangeConfiguration;
			(vscode.languages as unknown as { registerHoverProvider: typeof vscode.languages.registerHoverProvider }).registerHoverProvider = originalRegisterHoverProvider;
			(vscode.languages as unknown as { registerColorProvider: typeof vscode.languages.registerColorProvider }).registerColorProvider = originalRegisterColorProvider;
			(vscode.window as unknown as { showInformationMessage: typeof vscode.window.showInformationMessage }).showInformationMessage = originalShowInformationMessage;
			(vscode.window as unknown as { showErrorMessage: typeof vscode.window.showErrorMessage }).showErrorMessage = originalShowErrorMessage;
			(vscode.window as unknown as { showQuickPick: typeof vscode.window.showQuickPick }).showQuickPick = originalShowQuickPick;
			(vscode.workspace as unknown as { getConfiguration: typeof vscode.workspace.getConfiguration }).getConfiguration = originalGetConfiguration;

			if (originalVisibleTextEditorsDescriptor) {
				Object.defineProperty(vscode.window, 'visibleTextEditors', originalVisibleTextEditorsDescriptor);
			} else {
				delete (vscode.window as unknown as Record<string, unknown>).visibleTextEditors;
			}
		}
	});
});
