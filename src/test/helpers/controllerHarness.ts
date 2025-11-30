/**
 * Helper utilities to create an ExtensionController instance with minimal VS Code side effects.
 */

import * as vscode from 'vscode';
import { ExtensionController } from '../../services';

export type ControllerHarness = {
	controller: ExtensionController;
	restore: () => void;
};

/**
 * Instantiate an ExtensionController with command and watcher stubs so integration tests can
 * invoke activation logic without touching the real VS Code environment.
 */
export async function createControllerHarness(): Promise<ControllerHarness> {
	const context = { subscriptions: [] as vscode.Disposable[] } as unknown as vscode.ExtensionContext;
	const controller = new ExtensionController(context);

	const createDisposable = () => ({ dispose: () => undefined });

	const commandsNamespace = vscode.commands as unknown as { registerCommand: typeof vscode.commands.registerCommand };
	const originalRegisterCommand = commandsNamespace.registerCommand;
	commandsNamespace.registerCommand = ((
		_command: string,
		_callback: (...args: unknown[]) => unknown
	) => createDisposable()) as typeof vscode.commands.registerCommand;

	const windowNamespace = vscode.window as unknown as { registerWebviewViewProvider: typeof vscode.window.registerWebviewViewProvider };
	const originalRegisterViewProvider = windowNamespace.registerWebviewViewProvider;
	windowNamespace.registerWebviewViewProvider = ((
		_viewId: string,
		_provider: vscode.WebviewViewProvider
		// Tests spin up multiple controllers per VS Code session, so short-circuit view registration to avoid duplicate ID errors.
	) => createDisposable()) as typeof vscode.window.registerWebviewViewProvider;

	const workspaceNamespace = vscode.workspace as unknown as { createFileSystemWatcher: typeof vscode.workspace.createFileSystemWatcher };
	const originalCreateFileSystemWatcher = workspaceNamespace.createFileSystemWatcher;
	workspaceNamespace.createFileSystemWatcher = (() => ({
		onDidChange: () => createDisposable(),
		onDidCreate: () => createDisposable(),
		onDidDelete: () => createDisposable(),
		dispose: () => undefined,
		ignoreChangeEvents: false,
		ignoreCreateEvents: false,
		ignoreDeleteEvents: false
	})) as typeof vscode.workspace.createFileSystemWatcher;

	await controller.activate();

	return {
		controller,
		restore: () => {
			commandsNamespace.registerCommand = originalRegisterCommand;
			windowNamespace.registerWebviewViewProvider = originalRegisterViewProvider;
			workspaceNamespace.createFileSystemWatcher = originalCreateFileSystemWatcher;
			controller.dispose();
		}
	};
}
