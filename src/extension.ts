import * as vscode from 'vscode';
import { ExtensionController } from './services/extensionController';
import { initializeEnvironment } from './utils/env';

// Extension state
let controller: ExtensionController | null = null;

/**
 * Extension activation entry point.
 */
export async function activate(context: vscode.ExtensionContext): Promise<void> {
	initializeEnvironment(context);
	controller = new ExtensionController(context);
	await controller.activate();
}

/**
 * Extension deactivation entry point.
 */
export function deactivate(): void {
	controller?.dispose();
	controller = null;
}
 
