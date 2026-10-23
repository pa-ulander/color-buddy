import * as vscode from 'vscode';

/**
 * Minimal document shape needed to parse CSS. Satisfied by `vscode.TextDocument`
 * and by `createTextSnapshot()` for files read straight from disk.
 */
export interface TextSource {
	readonly uri: vscode.Uri;
	getText(): string;
	positionAt(offset: number): vscode.Position;
}

/**
 * Create a read-only text snapshot without opening a VS Code text document.
 * Opening documents broadcasts `onDidOpenTextDocument` to every extension and
 * language server, so bulk indexing should use snapshots instead.
 */
export function createTextSnapshot(uri: vscode.Uri, text: string): TextSource {
	const lineStarts = [0];
	for (let i = 0; i < text.length; i++) {
		if (text.charCodeAt(i) === 10) {
			lineStarts.push(i + 1);
		}
	}

	return {
		uri,
		getText: () => text,
		positionAt: (offset: number) => {
			const clamped = Math.max(0, Math.min(Math.floor(offset), text.length));
			let low = 0;
			let high = lineStarts.length - 1;
			while (low < high) {
				const mid = (low + high + 1) >> 1;
				if (lineStarts[mid] <= clamped) {
					low = mid;
				} else {
					high = mid - 1;
				}
			}
			return new vscode.Position(low, clamped - lineStarts[low]);
		}
	};
}
