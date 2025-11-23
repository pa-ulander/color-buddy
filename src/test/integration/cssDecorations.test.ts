import * as assert from 'assert';
import * as path from 'path';
import * as vscode from 'vscode';
import { ExtensionController } from '../../services';

suite('CSS Decorations', () => {
	test('applies decorations for CSS variable declarations', async () => {
		const context = { subscriptions: [] as vscode.Disposable[] } as unknown as vscode.ExtensionContext;
		const controller = new ExtensionController(context);

		// Stubs to avoid duplicate registration errors and filesystem watchers during activation
		const createDisposable = () => ({ dispose: () => undefined });
		const originalRegisterCommand = vscode.commands.registerCommand;
		(vscode.commands as unknown as { registerCommand: typeof vscode.commands.registerCommand }).registerCommand = ((
			_command: string,
			_callback: (...args: unknown[]) => unknown
		) => createDisposable()) as typeof vscode.commands.registerCommand;

		const originalCreateFileSystemWatcher = vscode.workspace.createFileSystemWatcher;
		(vscode.workspace as unknown as { createFileSystemWatcher: typeof vscode.workspace.createFileSystemWatcher }).createFileSystemWatcher = (() => ({
			onDidChange: () => createDisposable(),
			onDidCreate: () => createDisposable(),
			onDidDelete: () => createDisposable(),
			dispose: () => undefined,
			ignoreChangeEvents: false,
			ignoreCreateEvents: false,
			ignoreDeleteEvents: false
		})) as typeof vscode.workspace.createFileSystemWatcher;
		try {
			await controller.activate();

			const extensionRoot = vscode.Uri.file(path.join(__dirname, '..', '..', '..'));
			const uri = vscode.Uri.joinPath(extensionRoot, 'examples', 'example.css');
			const document = await vscode.workspace.openTextDocument(uri);

			const applied: Array<{ type: vscode.TextEditorDecorationType; options: readonly vscode.DecorationOptions[] }> = [];
			const editorStub = {
				document,
				setDecorations: (type: vscode.TextEditorDecorationType, options: readonly vscode.DecorationOptions[]) => {
					applied.push({ type, options });
				}
			} as unknown as vscode.TextEditor;

			await (controller as unknown as { refreshEditor(editor: vscode.TextEditor): Promise<void> }).refreshEditor(editorStub);

			assert.ok(applied.length > 0, 'Expected decorations to be applied');
			const hasColor = applied.some(entry => entry.options.some(option => option.renderOptions?.before?.backgroundColor));
			assert.ok(hasColor, 'Expected at least one decoration with background color');
		} finally {
			(vscode.commands as unknown as { registerCommand: typeof vscode.commands.registerCommand }).registerCommand = originalRegisterCommand;
			(vscode.workspace as unknown as { createFileSystemWatcher: typeof vscode.workspace.createFileSystemWatcher }).createFileSystemWatcher = originalCreateFileSystemWatcher;
			controller.dispose();
		}
	}).timeout(10000);
});
