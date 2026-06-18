import * as vscode from 'vscode';
import * as path from 'path';
import { ExtensionController } from '../../services';
import { AccessibilityViewProvider } from '../../services/accessibilityViewProvider';
import { perfLogger } from '../../utils/performanceLogger';

const PROJECT_ROOT = path.resolve(__dirname, '../../..');

export interface CommandTestEnvironment {
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
	addMockDocument(doc: vscode.TextDocument): void;
	restore(): Promise<void>;
}

function createDisposable(): vscode.Disposable {
	return { dispose: () => undefined };
}

export function createEditor(document: vscode.TextDocument, selection: vscode.Selection): vscode.TextEditor {
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

export function getAccessibilityView(env: CommandTestEnvironment): AccessibilityViewProvider {
	return (env.controller as unknown as { accessibilityViewProvider: AccessibilityViewProvider }).accessibilityViewProvider;
}

export async function setupCommandTestEnvironment(options?: {
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
	let nextFindFilesResults: vscode.Uri[] = [];
	const findFilesInvocations: Array<{ include: vscode.GlobPattern; exclude?: vscode.GlobPattern }> = [];
	const mockDocuments = new Map<string, vscode.TextDocument>();
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
		_thisArgs?: unknown,
		_disposables?: vscode.Disposable[]
	) => createDisposable()) as typeof vscode.window.onDidChangeActiveTextEditor;

	const originalOnDidChangeVisibleTextEditors = vscode.window.onDidChangeVisibleTextEditors;
	(vscode.window as unknown as { onDidChangeVisibleTextEditors: typeof vscode.window.onDidChangeVisibleTextEditors }).onDidChangeVisibleTextEditors = ((
		_listener: (editors: readonly vscode.TextEditor[]) => unknown,
		_thisArgs?: unknown,
		_disposables?: vscode.Disposable[]
	) => createDisposable()) as typeof vscode.window.onDidChangeVisibleTextEditors;

	const originalRegisterWebviewViewProvider = vscode.window.registerWebviewViewProvider;
	(vscode.window as unknown as { registerWebviewViewProvider: typeof vscode.window.registerWebviewViewProvider }).registerWebviewViewProvider = ((
		_viewId: string,
		_provider: vscode.WebviewViewProvider,
		_options?: { webviewOptions?: { retainContextWhenHidden?: boolean } }
	) => createDisposable()) as typeof vscode.window.registerWebviewViewProvider;

	const originalActiveTextEditor = Object.getOwnPropertyDescriptor(vscode.window, 'activeTextEditor');
	Object.defineProperty(vscode.window, 'activeTextEditor', {
		configurable: true,
		get: () => activeEditorState.editor
	});

	const originalVisibleTextEditors = Object.getOwnPropertyDescriptor(vscode.window, 'visibleTextEditors');
	Object.defineProperty(vscode.window, 'visibleTextEditors', {
		configurable: true,
		get: () => visibleEditorsState
	});

	const originalShowInformationMessage = vscode.window.showInformationMessage;
	(vscode.window as unknown as { showInformationMessage: typeof vscode.window.showInformationMessage }).showInformationMessage = (async (message: string) => {
		infoMessages.push(message);
		return undefined;
	}) as typeof vscode.window.showInformationMessage;

	const originalShowWarningMessage = vscode.window.showWarningMessage;
	(vscode.window as any).showWarningMessage = (async (message: string, ...items: string[]) => {
		warningMessages.push({ message, items });
		return warningSelection;
	});

	const originalShowErrorMessage = vscode.window.showErrorMessage;
	(vscode.window as unknown as { showErrorMessage: typeof vscode.window.showErrorMessage }).showErrorMessage = (async (message: string) => {
		errorMessages.push(message);
		return undefined;
	}) as typeof vscode.window.showErrorMessage;

	const originalShowQuickPick = vscode.window.showQuickPick;
	(vscode.window as any).showQuickPick = (async (items: readonly vscode.QuickPickItem[], options?: vscode.QuickPickOptions) => {
		quickPickRequests.push({ items, options });
		return quickPickHandler ? quickPickHandler(items, options) : undefined;
	});

	const originalOpenTextDocument = vscode.workspace.openTextDocument;
	(vscode.workspace as unknown as{ openTextDocument: typeof vscode.workspace.openTextDocument }).openTextDocument = (async (uriOrOptions: vscode.Uri | { language?: string; content?: string }) => {
		if (uriOrOptions instanceof vscode.Uri) {
			// Check registered mock documents first
			const mockDoc = mockDocuments.get(uriOrOptions.toString());
			if (mockDoc) {
				return mockDoc;
			}

			// Return fixture file directly
			const fsPath = uriOrOptions.fsPath;
			if (fsPath.includes('fixtures') && fsPath.endsWith('.css')) {
				const { readFileSync } = await import('fs');
				const content = readFileSync(fsPath, 'utf8');
				const language = 'css';
				const doc = {
					uri: uriOrOptions,
					fileName: fsPath,
					isUntitled: false,
					languageId: language,
					version: 1,
					isDirty: false,
					isClosed: false,
					save: async () => true,
					eol: vscode.EndOfLine.LF,
					lineCount: content.split(/\r?\n/).length,
					encoding: 'utf-8',
					notebook: undefined,
					getText: (range?: vscode.Range) => {
						if (!range) return content;
						const lines = content.split(/\r?\n/);
						const startOffset = lines.slice(0, range.start.line).join('\n').length + (range.start.line > 0 ? 1 : 0) + range.start.character;
						const endOffset = lines.slice(0, range.end.line).join('\n').length + (range.end.line > 0 ? 1 : 0) + range.end.character;
						return content.slice(startOffset, endOffset);
					},
					lineAt: (line: number | vscode.Position) => {
						const lineNum = typeof line === 'number' ? line : line.line;
						const lines = content.split(/\r?\n/);
						const text = lines[lineNum] || '';
						return {
							lineNumber: lineNum,
							text,
							range: new vscode.Range(lineNum, 0, lineNum, text.length),
							rangeIncludingLineBreak: new vscode.Range(lineNum, 0, lineNum + 1, 0),
							firstNonWhitespaceCharacterIndex: text.search(/\S/),
							isEmptyOrWhitespace: text.trim().length === 0
						};
					},
					offsetAt: (position: vscode.Position) => {
						const lines = content.split(/\r?\n/);
						return lines.slice(0, position.line).join('\n').length + (position.line > 0 ? 1 : 0) + position.character;
					},
					positionAt: (offset: number) => {
						const lines = content.split(/\r?\n/);
						let currentOffset = 0;
						for (let i = 0; i < lines.length; i++) {
							const lineLength = lines[i].length;
							if (currentOffset + lineLength >= offset) {
								return new vscode.Position(i, offset - currentOffset);
							}
							currentOffset += lineLength + 1; // +1 for newline
						}
						return new vscode.Position(lines.length - 1, lines[lines.length - 1].length);
					},
					validateRange: (range: vscode.Range) => range,
					validatePosition: (position: vscode.Position) => position,
					getWordRangeAtPosition: () => undefined
				} as vscode.TextDocument;
				openDocuments.push({ content, language });
				return doc;
			}
		}

		const options = uriOrOptions as { language?: string; content?: string };
		openDocuments.push({ content: options.content, language: options.language });
		return originalOpenTextDocument(uriOrOptions as never);
	}) as typeof vscode.workspace.openTextDocument;

	const originalShowTextDocument = vscode.window.showTextDocument;
	(vscode.window as unknown as { showTextDocument: typeof vscode.window.showTextDocument }).showTextDocument = (async (documentOrUri: vscode.TextDocument | vscode.Uri) => {
		const document = documentOrUri instanceof vscode.Uri ? await vscode.workspace.openTextDocument(documentOrUri) : documentOrUri;
		showTextDocuments.push({ document });
		return createEditor(document, new vscode.Selection(0, 0, 0, 0));
	}) as typeof vscode.window.showTextDocument;

	const originalGetConfiguration = vscode.workspace.getConfiguration;
	(vscode.workspace as unknown as { getConfiguration: typeof vscode.workspace.getConfiguration }).getConfiguration = ((section?: string) => {
		return {
			get: (key: string, defaultValue?: unknown) => {
				if (section === 'colorbuddy' && key === 'enablePerformanceLogging') {
					return perfLoggingEnabled;
				}
				return defaultValue;
			},
			has: () => true,
			inspect: () => undefined,
			update: async (key: string, value: unknown) => {
				const fullKey = section ? `${section}.${key}` : key;
				configUpdates.push({ name: fullKey, value });
				if (fullKey === 'colorbuddy.enablePerformanceLogging') {
					perfLoggingEnabled = value as boolean;
				}
				return undefined;
			}
		} as vscode.WorkspaceConfiguration;
	}) as typeof vscode.workspace.getConfiguration;

	const originalFindTextInFiles = vscode.workspace.findTextInFiles;
	(vscode.workspace as any).findTextInFiles = (async (
		query: vscode.TextSearchQuery,
		_options?: vscode.FindTextInFilesOptions,
		callback?: (result: vscode.TextSearchResult) => void
	) => {
		textSearchInvocations.push({ query, options: _options });
		if (callback && nextTextSearchMatches.length > 0) {
			for (const match of nextTextSearchMatches) {
				callback(match);
			}
		}
	});

	const controller = new ExtensionController(context);
	await controller.activate();

	const restore = async () => {
		perfLogger.reset();
		(vscode.commands as any).registerCommand = originalRegisterCommand;
		(vscode.commands as any).executeCommand = originalExecuteCommand;
		(vscode.workspace as any).findFiles = originalFindFiles;
		(vscode.workspace as any).createFileSystemWatcher = originalCreateFileSystemWatcher;
		(vscode.window as any).onDidChangeActiveTextEditor = originalOnDidChangeActiveTextEditor;
		(vscode.window as any).onDidChangeVisibleTextEditors = originalOnDidChangeVisibleTextEditors;
		(vscode.window as any).registerWebviewViewProvider = originalRegisterWebviewViewProvider;
		if (originalActiveTextEditor) {
			Object.defineProperty(vscode.window, 'activeTextEditor', originalActiveTextEditor);
		}
		if (originalVisibleTextEditors) {
			Object.defineProperty(vscode.window, 'visibleTextEditors', originalVisibleTextEditors);
		}
		(vscode.window as any).showInformationMessage = originalShowInformationMessage;
		(vscode.window as any).showWarningMessage = originalShowWarningMessage;
		(vscode.window as any).showErrorMessage = originalShowErrorMessage;
		(vscode.window as any).showQuickPick = originalShowQuickPick;
		(vscode.workspace as any).openTextDocument = originalOpenTextDocument;
		(vscode.window as any).showTextDocument = originalShowTextDocument;
		(vscode.workspace as any).getConfiguration = originalGetConfiguration;
		(vscode.workspace as any).findTextInFiles = originalFindTextInFiles;
		Object.defineProperty(vscode.workspace, 'workspaceFolders', {
			configurable: true,
			value: originalWorkspaceFolders
		});
		(vscode.workspace as any).getWorkspaceFolder = originalGetWorkspaceFolder;
		process.setMaxListeners(originalProcessMaxListeners);
	};

	return {
		controller,
		registeredCommands,
		infoMessages,
		warningMessages,
		errorMessages,
		quickPickRequests,
		openDocuments,
		showTextDocuments,
		configUpdates,
		getFindFilesCallCount: () => findFilesCallCount,
		getExecutedCommands: () => executedCommands,
		setActiveEditor: (editor?: vscode.TextEditor) => {
			activeEditorState.editor = editor;
		},
		setVisibleEditors: (editors: readonly vscode.TextEditor[]) => {
			visibleEditorsState.length = 0;
			visibleEditorsState.push(...editors);
		},
		setQuickPickHandler: (handler) => {
			quickPickHandler = handler;
		},
		setTextSearchMatches: (matches: vscode.TextSearchMatch[]) => {
			nextTextSearchMatches = matches;
		},
		getTextSearchInvocations: () => textSearchInvocations,
		setPerformanceLoggingEnabled: (enabled: boolean) => {
			perfLoggingEnabled = enabled;
		},
		setFindFilesResults: (results: vscode.Uri[]) => {
			nextFindFilesResults = results;
		},
		getFindFilesInvocations: () => findFilesInvocations,
		addMockDocument: (doc: vscode.TextDocument) => {
			mockDocuments.set(doc.uri.toString(), doc);
		},
		restore
	};
}
