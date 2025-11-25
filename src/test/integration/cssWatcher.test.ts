import * as assert from 'assert';
import * as path from 'path';
import { promises as fs } from 'fs';
import * as vscode from 'vscode';
import { ExtensionController } from '../../services';

type WatcherHandler = (uri: vscode.Uri) => void | Promise<void>;

type CapturedWatcher = {
	change?: WatcherHandler;
	create?: WatcherHandler;
	delete?: WatcherHandler;
	dispose?: () => void;
};

suite('CSS Watcher Integration', () => {
	test('reindexes CSS files when watcher events fire', async () => {
		const context = { subscriptions: [] as vscode.Disposable[] } as unknown as vscode.ExtensionContext;
		const controller = new ExtensionController(context);
		const controllerAny = controller as unknown as {
			cssParser: { parseCSSFile(document: vscode.TextDocument): Promise<void> };
			registry: { getVariable(name: string): Array<{ value: string }> | undefined; removeByUri(uri: vscode.Uri): void };
		};

		const commandsNamespace = vscode.commands as unknown as { registerCommand: typeof vscode.commands.registerCommand };
		const originalRegisterCommand = commandsNamespace.registerCommand;
		const createDisposable = () => ({ dispose: () => undefined });
		commandsNamespace.registerCommand = ((
			_command: string,
			_callback: (...args: unknown[]) => unknown
		) => createDisposable()) as typeof vscode.commands.registerCommand;

		const workspaceNamespace = vscode.workspace as unknown as { createFileSystemWatcher: typeof vscode.workspace.createFileSystemWatcher };
		const originalCreateFileSystemWatcher = workspaceNamespace.createFileSystemWatcher;
		const captured: CapturedWatcher = {};
		workspaceNamespace.createFileSystemWatcher = ((
			_pattern: vscode.GlobPattern
		) => {
			return {
				onDidChange: (handler: WatcherHandler) => {
					captured.change = handler;
					return createDisposable();
				},
				onDidCreate: (handler: WatcherHandler) => {
					captured.create = handler;
					return createDisposable();
				},
				onDidDelete: (handler: WatcherHandler) => {
					captured.delete = handler;
					return createDisposable();
				},
				dispose: () => {
					captured.dispose?.();
				}
			};
		}) as typeof vscode.workspace.createFileSystemWatcher;

		const projectRoot = path.resolve(__dirname, '..', '..', '..');
		const tempDir = path.join(projectRoot, 'src', 'test', 'integration', 'fixtures', 'watcher-temp');
		await fs.mkdir(tempDir, { recursive: true });
		const tempFile = path.join(tempDir, `watch-${Date.now()}.css`);
		const tempUri = vscode.Uri.file(tempFile);

		const originalParse = controllerAny.cssParser.parseCSSFile.bind(controllerAny.cssParser);
		let parseInvocations = 0;
		controllerAny.cssParser.parseCSSFile = async (document: vscode.TextDocument) => {
			parseInvocations++;
			await originalParse(document);
		};

		try {
			await controller.activate();
			assert.ok(captured.create, 'Expected CSS watcher to register create handler');
			assert.ok(captured.change, 'Expected CSS watcher to register change handler');
			assert.ok(captured.delete, 'Expected CSS watcher to register delete handler');

			const baselineInvocations = parseInvocations;

			await fs.writeFile(tempFile, ':root { --watch-color: #123456; }', 'utf8');
			await Promise.resolve(captured.create!(tempUri));

			const declarationsAfterCreate = controllerAny.registry.getVariable('--watch-color');
			assert.ok(declarationsAfterCreate && declarationsAfterCreate.length > 0, 'Expected registry to include CSS variable after create event');
			assert.ok(parseInvocations >= baselineInvocations + 1, 'Expected parse invocation after create event');

			await fs.writeFile(tempFile, ':root { --watch-color: #654321; }', 'utf8');
			await Promise.resolve(captured.change!(tempUri));

			assert.ok(parseInvocations >= baselineInvocations + 2, 'Expected parse invocation after change event');
			const declarationsAfterChange = controllerAny.registry.getVariable('--watch-color');
			assert.ok(declarationsAfterChange && declarationsAfterChange.length > 0, 'Expected registry to retain CSS variable after change event');

			await fs.rm(tempFile, { force: true });
			await Promise.resolve(captured.delete!(tempUri));

			const declarationsAfterDelete = controllerAny.registry.getVariable('--watch-color');
			assert.strictEqual(declarationsAfterDelete, undefined, 'Expected registry to drop CSS variable after delete event');
			assert.ok(parseInvocations >= baselineInvocations + 2, 'Expected delete handler to avoid additional parse invocation');
		} finally {
			controllerAny.cssParser.parseCSSFile = originalParse;
			commandsNamespace.registerCommand = originalRegisterCommand;
			workspaceNamespace.createFileSystemWatcher = originalCreateFileSystemWatcher;
			await fs.rm(tempFile, { force: true }).catch(() => undefined);
			controller.dispose();
		}
	}).timeout(15000);
});
