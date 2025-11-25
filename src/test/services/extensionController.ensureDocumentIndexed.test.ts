import * as assert from 'assert';
import * as vscode from 'vscode';
import { ExtensionController } from '../../services';
import { createMockDocument } from '../helpers/mocks';

suite('ExtensionController.ensureDocumentIndexed', () => {
	test('indexes custom Sass language ids based on file extension', async () => {
		const context = { subscriptions: [] as vscode.Disposable[] } as unknown as vscode.ExtensionContext;
		const controller = new ExtensionController(context);
		const controllerAny = controller as unknown as {
			cssParser: { parseCSSFile(document: vscode.TextDocument): Promise<void> };
			ensureDocumentIndexed(document: vscode.TextDocument): Promise<void>;
			indexedCssDocuments: Map<string, number>;
		};

		const originalParse = controllerAny.cssParser.parseCSSFile;
		let parseInvocations = 0;
		controllerAny.cssParser.parseCSSFile = async () => {
			parseInvocations++;
		};

		try {
			const uri = vscode.Uri.file('/workspace/styles/example.sass');
			const document = createMockDocument(
				"primary = hsl(120, 40%, 50%)\nsecondary = hsla(210, 60%, 50%, 0.75)",
				'sass-mock',
				uri
			);
			await controllerAny.ensureDocumentIndexed(document);
			assert.strictEqual(parseInvocations, 1, 'Expected controller to index custom Sass document once');

			// Re-using the same version should not trigger a second parse
			await controllerAny.ensureDocumentIndexed(document);
			assert.strictEqual(parseInvocations, 1, 'Expected cached version to skip re-indexing');

			// Simulate document update by bumping the version
			const updatedDocument = createMockDocument(
				"primary = hsl(10, 50%, 50%)\nsecondary = hsla(40, 60%, 50%, 0.5)",
				'sass-mock',
				uri
			);
			(updatedDocument as unknown as { version: number }).version = 2;
			await controllerAny.ensureDocumentIndexed(updatedDocument);
			assert.strictEqual(parseInvocations, 2, 'Expected updated document version to trigger re-indexing');
		} finally {
			controllerAny.cssParser.parseCSSFile = originalParse;
			controller.dispose();
		}
	});

	test('indexes PostCSS documents by extension when language id changes', async () => {
		const context = { subscriptions: [] as vscode.Disposable[] } as unknown as vscode.ExtensionContext;
		const controller = new ExtensionController(context);
		const controllerAny = controller as unknown as {
			cssParser: { parseCSSFile(document: vscode.TextDocument): Promise<void> };
			ensureDocumentIndexed(document: vscode.TextDocument): Promise<void>;
			indexedCssDocuments: Map<string, number>;
		};

		const originalParse = controllerAny.cssParser.parseCSSFile;
		let parseInvocations = 0;
		controllerAny.cssParser.parseCSSFile = async () => {
			parseInvocations++;
		};

		try {
			const uri = vscode.Uri.file('/workspace/styles/example.pcss');
			const document = createMockDocument(
				":root { --primary: hsl(205, 90%, 45%); }",
				'lua',
				uri
			);
			await controllerAny.ensureDocumentIndexed(document);
			assert.strictEqual(parseInvocations, 1, 'Expected controller to index PostCSS document once');

			await controllerAny.ensureDocumentIndexed(document);
			assert.strictEqual(parseInvocations, 1, 'Expected cached PostCSS version to skip re-indexing');

			const updatedDocument = createMockDocument(
				":root { --primary: hsl(200, 80%, 50%); }",
				'lua',
				uri
			);
			(updatedDocument as unknown as { version: number }).version = 3;
			await controllerAny.ensureDocumentIndexed(updatedDocument);
			assert.strictEqual(parseInvocations, 2, 'Expected updated PostCSS document version to trigger re-indexing');
		} finally {
			controllerAny.cssParser.parseCSSFile = originalParse;
			controller.dispose();
		}
	});
});
