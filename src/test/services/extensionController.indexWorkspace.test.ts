import * as assert from 'assert';
import * as path from 'path';
import * as vscode from 'vscode';
import { ExtensionController } from '../../services';

suite('ExtensionController.indexWorkspaceCSSFiles', () => {
	const projectRoot = path.resolve(__dirname, '..', '..', '..');
	const fixtureUri = vscode.Uri.file(
		path.join(projectRoot, 'src', 'test', 'integration', 'fixtures', 'css-variable-decorations.css')
	);

	test('indexes CSS from disk without opening text documents', async () => {
		const context = { subscriptions: [] as vscode.Disposable[] } as unknown as vscode.ExtensionContext;
		const controller = new ExtensionController(context);
		const controllerAny = controller as unknown as {
			indexWorkspaceCSSFiles(): Promise<void>;
			registry: { getVariable(name: string): Array<{ value: string; line: number; uri: vscode.Uri }> | undefined };
		};

		const workspaceAny = vscode.workspace as unknown as {
			findFiles: typeof vscode.workspace.findFiles;
			openTextDocument: typeof vscode.workspace.openTextDocument;
		};
		const originalFindFiles = workspaceAny.findFiles;
		const originalOpenTextDocument = workspaceAny.openTextDocument;
		const excludes: Array<vscode.GlobPattern | null | undefined> = [];
		const openedUris: string[] = [];

		workspaceAny.findFiles = (async (_include: vscode.GlobPattern, exclude?: vscode.GlobPattern | null) => {
			excludes.push(exclude);
			return [fixtureUri];
		}) as typeof vscode.workspace.findFiles;
		workspaceAny.openTextDocument = (async (arg?: unknown) => {
			if (arg instanceof vscode.Uri) {
				openedUris.push(arg.toString());
			}
			return originalOpenTextDocument(arg as Parameters<typeof vscode.workspace.openTextDocument>[0]);
		}) as typeof vscode.workspace.openTextDocument;

		try {
			await controllerAny.indexWorkspaceCSSFiles();

			const declarations = controllerAny.registry.getVariable('--brand-primary');
			assert.ok(declarations && declarations.length > 0, 'Expected fixture variable to be indexed');
			assert.strictEqual(declarations[0].value, '210 85% 60%');
			assert.strictEqual(declarations[0].line, 1);
			assert.strictEqual(declarations[0].uri.toString(), fixtureUri.toString());

			assert.deepStrictEqual(openedUris, [], 'Indexing must not open text documents (broadcasts to every language server)');

			const exclude = String(excludes[0] ?? '');
			for (const folder of ['node_modules', '.git', '.venv']) {
				assert.ok(exclude.includes(folder), `Expected exclude pattern to skip ${folder}, got ${exclude}`);
			}
		} finally {
			workspaceAny.findFiles = originalFindFiles;
			workspaceAny.openTextDocument = originalOpenTextDocument;
			controller.dispose();
		}
	});
});
