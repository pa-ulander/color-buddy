import * as assert from 'assert';
import * as vscode from 'vscode';
import { ExtensionController } from '../../services';
import { createMockDocument } from '../helpers/mocks';

/**
 * Creates a controller with the language providers captured so we can call
 * provideDocumentColors directly. Returns the captured provider plus a cleanup
 * function that must be called in a finally block.
 */
async function setupControllerWithCapturedProvider(): Promise<{
	colorProvider: vscode.DocumentColorProvider;
	cleanup: () => void;
}> {
	const context = { subscriptions: [] as vscode.Disposable[] } as unknown as vscode.ExtensionContext;
	const controller = new ExtensionController(context);
	let capturedColorProvider: vscode.DocumentColorProvider | undefined;
	const createDisposable = () => ({ dispose: () => undefined });

	const commandsNs = vscode.commands as unknown as { registerCommand: typeof vscode.commands.registerCommand };
	const workspaceNs = vscode.workspace as unknown as { createFileSystemWatcher: typeof vscode.workspace.createFileSystemWatcher };
	const windowNs = vscode.window as unknown as { registerWebviewViewProvider: typeof vscode.window.registerWebviewViewProvider };
	const languagesNs = vscode.languages as unknown as {
		registerHoverProvider: typeof vscode.languages.registerHoverProvider;
		registerColorProvider: typeof vscode.languages.registerColorProvider;
	};

	const origRegisterCommand = commandsNs.registerCommand;
	const origCreateWatcher = workspaceNs.createFileSystemWatcher;
	const origRegisterViewProvider = windowNs.registerWebviewViewProvider;
	const origRegisterHover = languagesNs.registerHoverProvider;
	const origRegisterColor = languagesNs.registerColorProvider;

	commandsNs.registerCommand = ((_command: string, _cb: unknown) => createDisposable()) as typeof vscode.commands.registerCommand;
	workspaceNs.createFileSystemWatcher = (() => ({
		onDidChange: () => createDisposable(),
		onDidCreate: () => createDisposable(),
		onDidDelete: () => createDisposable(),
		dispose: () => undefined,
		ignoreChangeEvents: false,
		ignoreCreateEvents: false,
		ignoreDeleteEvents: false
	})) as typeof vscode.workspace.createFileSystemWatcher;
	windowNs.registerWebviewViewProvider = ((_viewId: string, _provider: vscode.WebviewViewProvider) => createDisposable()) as typeof vscode.window.registerWebviewViewProvider;
	languagesNs.registerHoverProvider = ((_sel: unknown, _prov: unknown) => createDisposable()) as typeof vscode.languages.registerHoverProvider;
	languagesNs.registerColorProvider = ((_sel: unknown, provider: vscode.DocumentColorProvider) => {
		capturedColorProvider = provider;
		return createDisposable();
	}) as typeof vscode.languages.registerColorProvider;

	await controller.activate();

	if (!capturedColorProvider) {
		throw new Error('Color provider was not registered during activation');
	}

	return {
		colorProvider: capturedColorProvider,
		cleanup: () => {
			commandsNs.registerCommand = origRegisterCommand;
			workspaceNs.createFileSystemWatcher = origCreateWatcher;
			windowNs.registerWebviewViewProvider = origRegisterViewProvider;
			languagesNs.registerHoverProvider = origRegisterHover;
			languagesNs.registerColorProvider = origRegisterColor;
			controller.dispose();
		}
	};
}

suite('HTML color provider conflict', () => {
	const htmlDocument = createMockDocument('<style>\n.box { color: #123456; background: rgb(10, 20, 30); }\n</style>', 'html');
	const token = new vscode.CancellationTokenSource().token;

	test('suppresses HTML literal document colors to avoid native provider duplicate swatches', async function () {
		this.timeout(10000);
		const { colorProvider, cleanup } = await setupControllerWithCapturedProvider();
		try {
			const colorsResult = await colorProvider.provideDocumentColors(htmlDocument, token);
			const colors = Array.isArray(colorsResult) ? colorsResult : [];
			assert.strictEqual(colors.length, 0, 'ColorBuddy should yield no HTML literal document colors to avoid duplicate swatches');
		} finally {
			cleanup();
		}
	});
});
