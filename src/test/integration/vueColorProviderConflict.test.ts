import * as assert from 'assert';
import * as vscode from 'vscode';
import { ExtensionController } from '../../services';
import { createMockDocument } from '../helpers/mocks';

suite('Vue color provider conflict', () => {
	test('does not return literal document colors for vue files', async function () {
		this.timeout(10000);

		const context = { subscriptions: [] as vscode.Disposable[] } as unknown as vscode.ExtensionContext;
		const controller = new ExtensionController(context);

		let capturedColorProvider: vscode.DocumentColorProvider | undefined;
		const createDisposable = () => ({ dispose: () => undefined });

		const commandsNamespace = vscode.commands as unknown as { registerCommand: typeof vscode.commands.registerCommand };
		const workspaceNamespace = vscode.workspace as unknown as { createFileSystemWatcher: typeof vscode.workspace.createFileSystemWatcher };
		const languagesNamespace = vscode.languages as unknown as {
			registerHoverProvider: typeof vscode.languages.registerHoverProvider;
			registerColorProvider: typeof vscode.languages.registerColorProvider;
		};

		const originalRegisterCommand = commandsNamespace.registerCommand;
		const originalCreateFileSystemWatcher = workspaceNamespace.createFileSystemWatcher;
		const originalRegisterHoverProvider = languagesNamespace.registerHoverProvider;
		const originalRegisterColorProvider = languagesNamespace.registerColorProvider;

		commandsNamespace.registerCommand = ((
			_command: string,
			_callback: (...args: unknown[]) => unknown
		) => createDisposable()) as typeof vscode.commands.registerCommand;

		workspaceNamespace.createFileSystemWatcher = (() => ({
			onDidChange: () => createDisposable(),
			onDidCreate: () => createDisposable(),
			onDidDelete: () => createDisposable(),
			dispose: () => undefined,
			ignoreChangeEvents: false,
			ignoreCreateEvents: false,
			ignoreDeleteEvents: false
		})) as typeof vscode.workspace.createFileSystemWatcher;

		languagesNamespace.registerHoverProvider = ((
			_selector: vscode.DocumentSelector,
			_provider: vscode.HoverProvider
		) => createDisposable()) as typeof vscode.languages.registerHoverProvider;

		languagesNamespace.registerColorProvider = ((
			_selector: vscode.DocumentSelector,
			provider: vscode.DocumentColorProvider
		) => {
			capturedColorProvider = provider;
			return createDisposable();
		}) as typeof vscode.languages.registerColorProvider;

		try {
			await controller.activate();
			assert.ok(capturedColorProvider, 'Color provider should be registered');

			const document = createMockDocument('<style scoped>\n.box { color: #123456; }\n</style>', 'vue');
			const token = new vscode.CancellationTokenSource().token;
			const colorsResult = await capturedColorProvider!.provideDocumentColors(document, token);
			const colors = Array.isArray(colorsResult) ? colorsResult : [];

			assert.strictEqual(colors.length, 0, 'Expected no literal color provider output for vue files');
		} finally {
			commandsNamespace.registerCommand = originalRegisterCommand;
			workspaceNamespace.createFileSystemWatcher = originalCreateFileSystemWatcher;
			languagesNamespace.registerHoverProvider = originalRegisterHoverProvider;
			languagesNamespace.registerColorProvider = originalRegisterColorProvider;
			controller.dispose();
		}
	});
});
