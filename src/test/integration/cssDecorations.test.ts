import * as assert from 'assert';
import * as path from 'path';
import * as vscode from 'vscode';
import { createControllerHarness } from '../helpers/controllerHarness';

type DecorationCapture = {
	type: vscode.TextEditorDecorationType;
	options: readonly vscode.DecorationOptions[];
};

suite('CSS Decorations', () => {
	test('applies decorations for CSS variable declarations', async () => {
		const { controller, restore } = await createControllerHarness();
		try {
			const extensionRoot = vscode.Uri.file(path.join(__dirname, '..', '..', '..'));
			const uri = vscode.Uri.joinPath(extensionRoot, 'examples', 'example.css');
			const document = await vscode.workspace.openTextDocument(uri);

			const applied: DecorationCapture[] = [];
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
			restore();
		}
	}).timeout(10000);

	test('aligns Tailwind and CSS variable decorations on mixed lines', async () => {
		const { controller, restore } = await createControllerHarness();
		try {
			const extensionRoot = vscode.Uri.file(path.join(__dirname, '..', '..', '..'));
			const uri = vscode.Uri.joinPath(extensionRoot, 'examples', 'example.css');
			const document = await vscode.workspace.openTextDocument(uri);

			const applied: DecorationCapture[] = [];
			const editorStub = {
				document,
				setDecorations: (type: vscode.TextEditorDecorationType, options: readonly vscode.DecorationOptions[]) => {
					applied.push({ type, options });
				}
			} as unknown as vscode.TextEditor;

			await (controller as unknown as { refreshEditor(editor: vscode.TextEditor): Promise<void> }).refreshEditor(editorStub);

			const flattened = applied.flatMap(entry =>
				entry.options.map(option => ({
					range: option.range,
					text: document.getText(option.range),
					renderOptions: option.renderOptions
				}))
			);

			const tailwindBg = flattened.find(item => item.text === 'bg-background');
			const tailwindText = flattened.find(item => item.text === 'text-foreground');
			const cssVarUsage = flattened.find(item => item.text === 'var(--destructive)');

			assert.ok(tailwindBg, 'Expected bg-background decoration');
			assert.ok(tailwindText, 'Expected text-foreground decoration');
			assert.ok(cssVarUsage, 'Expected var(--destructive) decoration');

			assert.ok(tailwindBg.renderOptions?.before?.backgroundColor, 'Tailwind bg decoration requires swatch color');
			assert.ok(tailwindText.renderOptions?.before?.backgroundColor, 'Tailwind text decoration requires swatch color');
			assert.ok(cssVarUsage.renderOptions?.before?.backgroundColor, 'CSS variable decoration requires swatch color');

			const applyLineIndex = [...Array(document.lineCount).keys()].find(line => {
				const text = document.lineAt(line).text;
				return text.includes('@apply') && text.includes('bg-background');
			});
			assert.ok(applyLineIndex !== undefined, 'Expected to find @apply line in example.css');
			const applyLineText = document.lineAt(applyLineIndex!).text;

			const bgColumn = applyLineText.indexOf('bg-background');
			const textColumn = applyLineText.indexOf('text-foreground');
			assert.ok(bgColumn >= 0, 'Expected bg-background index on @apply line');
			assert.ok(textColumn >= 0, 'Expected text-foreground index on @apply line');

			assert.strictEqual(tailwindBg.range.start.line, applyLineIndex, 'bg-background range line mismatch');
			assert.strictEqual(tailwindBg.range.start.character, bgColumn, 'bg-background range column mismatch');

			assert.strictEqual(tailwindText.range.start.line, applyLineIndex, 'text-foreground range line mismatch');
			assert.strictEqual(tailwindText.range.start.character, textColumn, 'text-foreground range column mismatch');

			const cssVarLineIndex = [...Array(document.lineCount).keys()].find(line => {
				const text = document.lineAt(line).text;
				return text.includes('var(--destructive)');
			});
			assert.ok(cssVarLineIndex !== undefined, 'Expected to find var(--destructive) usage');
			const cssVarLineText = document.lineAt(cssVarLineIndex!).text;
			const cssVarColumn = cssVarLineText.indexOf('var(--destructive)');
			assert.ok(cssVarColumn >= 0, 'Expected CSS variable index on line');

			assert.strictEqual(cssVarUsage.range.start.line, cssVarLineIndex, 'CSS var range line mismatch');
			assert.strictEqual(cssVarUsage.range.start.character, cssVarColumn, 'CSS var range column mismatch');
		} finally {
			restore();
		}
	}).timeout(10000);
});
