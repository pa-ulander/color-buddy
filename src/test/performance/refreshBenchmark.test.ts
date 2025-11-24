import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { createControllerHarness } from '../helpers/controllerHarness';
import { DecorationCapture } from '../helpers/types';
function buildLargeCssDocument(variableCount = 200, blockCount = 600): string {
	const lines: string[] = [];
	lines.push(':root {');
	for (let index = 0; index < variableCount; index++) {
		const hue = index % 360;
		lines.push(`  --color-${index}: ${hue} 60% 55%;`);
	}
	lines.push('}\n');

	for (let block = 0; block < blockCount; block++) {
		const primaryVar = `--color-${block % variableCount}`;
		const secondaryVar = `--color-${(block + 1) % variableCount}`;
		lines.push(`.component-${block} {`);
		lines.push(`  color: var(${primaryVar});`);
		lines.push(`  background-color: var(${secondaryVar});`);
		lines.push(`  @apply bg-color-${block % variableCount} text-color-${(block + 1) % variableCount};`);
		lines.push('}\n');
		lines.push(`.component-${block} .nested-${block} {`);
		lines.push(`  border-color: var(${primaryVar});`);
		lines.push(`  outline-color: var(${secondaryVar});`);
		lines.push('}\n');
	}

	return lines.join('\n');
}

suite('Refresh Benchmark', () => {
	test('refreshEditor performance on large CSS document', async function () {
		this.timeout(20000);

		const { controller, restore } = await createControllerHarness();
		try {
			const content = buildLargeCssDocument();
			const document = await vscode.workspace.openTextDocument({ language: 'css', content });

			const applied: DecorationCapture[] = [];
			const editorStub = {
				document,
				setDecorations: (type: vscode.TextEditorDecorationType, options: readonly vscode.DecorationOptions[]) => {
					applied.push({ type, options });
				}
			} as unknown as vscode.TextEditor;

			const start = process.hrtime.bigint();
			await (controller as unknown as { refreshEditor(editor: vscode.TextEditor): Promise<void> }).refreshEditor(editorStub);
			const durationMs = Number(process.hrtime.bigint() - start) / 1_000_000;

			const decorationCount = applied.reduce((total, entry) => total + entry.options.length, 0);
			assert.ok(decorationCount > 0, 'Expected decorations on synthetic large document');

			const logDir = path.join(__dirname, '..', '..', '..', 'logs', 'metrics');
			const logPath = path.join(
				logDir,
				`${new Date().toISOString().split('T')[0]}-refresh-benchmark.json`
			);
			const payload = {
				timestamp: new Date().toISOString(),
				durationMs: Number(durationMs.toFixed(2)),
				decorationCount,
				lineCount: document.lineCount,
				characterCount: content.length
			};

			await fs.promises.mkdir(logDir, { recursive: true });
			await fs.promises.writeFile(logPath, JSON.stringify(payload, null, 2));

			console.log(`[RefreshBenchmark] durationMs=${payload.durationMs} decorations=${decorationCount} lines=${document.lineCount}`);
		} finally {
			restore();
		}
	});
});
