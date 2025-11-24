import * as vscode from 'vscode';

export type DecorationCapture = {
	type: vscode.TextEditorDecorationType;
	options: readonly vscode.DecorationOptions[];
};
