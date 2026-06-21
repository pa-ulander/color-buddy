import * as assert from 'assert';
import * as vscode from 'vscode';
import { ExtensionController } from '../../services';
import { createMockDocument } from '../helpers/mocks';

const VOLAR_EXTENSION_ID = 'vue.volar';

type ExtensionsNamespace = { getExtension: typeof vscode.extensions.getExtension };

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
	const languagesNs = vscode.languages as unknown as {
		registerHoverProvider: typeof vscode.languages.registerHoverProvider;
		registerColorProvider: typeof vscode.languages.registerColorProvider;
	};

	const origRegisterCommand = commandsNs.registerCommand;
	const origCreateWatcher = workspaceNs.createFileSystemWatcher;
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
			languagesNs.registerHoverProvider = origRegisterHover;
			languagesNs.registerColorProvider = origRegisterColor;
			controller.dispose();
		}
	};
}

suite('Vue color provider conflict', () => {
	const vueDocument = createMockDocument('<style scoped>\n.box { color: #123456; }\n</style>', 'vue');
	const token = new vscode.CancellationTokenSource().token;
	const extensionsNs = vscode.extensions as unknown as ExtensionsNamespace;

	test('suppresses Vue literal document colors when Vue Official (Volar) is active', async function () {
		this.timeout(10000);
		const { colorProvider, cleanup } = await setupControllerWithCapturedProvider();
		const origGetExtension = extensionsNs.getExtension;
		try {
			// Simulate Volar being installed and active
			extensionsNs.getExtension = ((id: string) => {
				if (id === VOLAR_EXTENSION_ID) {
					return { id: VOLAR_EXTENSION_ID, isActive: true } as unknown as vscode.Extension<unknown>;
				}
				return origGetExtension(id);
			}) as typeof vscode.extensions.getExtension;

			const colorsResult = await colorProvider.provideDocumentColors(vueDocument, token);
			const colors = Array.isArray(colorsResult) ? colorsResult : [];
			assert.strictEqual(colors.length, 0, 'ColorBuddy should yield no Vue document colors when Volar is active');
		} finally {
			extensionsNs.getExtension = origGetExtension;
			cleanup();
		}
	});

	test('provides Vue literal document colors when Vue Official (Volar) is absent', async function () {
		this.timeout(10000);
		const { colorProvider, cleanup } = await setupControllerWithCapturedProvider();
		const origGetExtension = extensionsNs.getExtension;
		try {
			// Simulate Volar not being installed or disabled
			extensionsNs.getExtension = ((id: string) => {
				if (id === VOLAR_EXTENSION_ID) {
					return undefined;
				}
				return origGetExtension(id);
			}) as typeof vscode.extensions.getExtension;

			const colorsResult = await colorProvider.provideDocumentColors(vueDocument, token);
			const colors = Array.isArray(colorsResult) ? colorsResult : [];
			assert.ok(colors.length > 0, 'ColorBuddy should provide Vue document colors when Volar is absent');
		} finally {
			extensionsNs.getExtension = origGetExtension;
			cleanup();
		}
	});
});
