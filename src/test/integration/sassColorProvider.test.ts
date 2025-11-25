import * as assert from 'assert';
import * as path from 'path';
import * as vscode from 'vscode';
import { ExtensionController } from '../../services';

suite('SASS Document Colors', () => {
	test('provides hsl colors for SASS files', async () => {
		const context = { subscriptions: [] as vscode.Disposable[] } as unknown as vscode.ExtensionContext;
		const controller = new ExtensionController(context);

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
			const uri = vscode.Uri.joinPath(extensionRoot, 'src', 'test', 'integration', 'fixtures', 'sass', 'hsl-colors.sass');
			const document = await vscode.workspace.openTextDocument(uri);

			const colors = await vscode.commands.executeCommand<vscode.ColorInformation[]>(
				'vscode.executeDocumentColorProvider',
				document.uri
			);

			assert.ok(colors && colors.length > 0, 'Expected at least one color information entry');
			const colorTexts = colors.map(info => document.getText(info.range));
			const hslDetected = colorTexts.some(text => text.startsWith('hsl('));
			const hslaDetected = colorTexts.some(text => text.startsWith('hsla('));
			const rgbEntries = colorTexts.filter(text => text.startsWith('rgb('));
			assert.ok(hslDetected, 'Expected hsl color to be detected in SASS file');
			assert.ok(hslaDetected, 'Expected hsla color to be detected in SASS file');
			assert.ok(rgbEntries.length <= 1, 'Expected at most one rgb color entry in SASS file');
		} finally {
			(vscode.commands as unknown as { registerCommand: typeof vscode.commands.registerCommand }).registerCommand = originalRegisterCommand;
			(vscode.workspace as unknown as { createFileSystemWatcher: typeof vscode.workspace.createFileSystemWatcher }).createFileSystemWatcher = originalCreateFileSystemWatcher;
			controller.dispose();
		}
	}).timeout(10000);
});
