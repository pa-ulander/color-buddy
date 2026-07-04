import * as assert from 'assert';
import * as vscode from 'vscode';
import type { FindUsagesCommandPayload } from '../../types';
import { createMockDocument } from '../helpers';
import { setupCommandTestEnvironment, getAccessibilityView, createEditor, type CommandTestEnvironment } from '../helpers/commandTestEnvironment';

suite('Panel Format Search Integration Tests', () => {
	let env: CommandTestEnvironment;

	setup(async function() {
		this.timeout(15000);
		env = await setupCommandTestEnvironment();
	});

	teardown(async function() {
		this.timeout(15000);
		if (env) {
			await env.restore();
		}
	});

	test('Opening Convert panel triggers search and populates matches', async function() {
		this.timeout(10000);
		const docText = 'body { color: #ff0000; }\np { background: #ff0000; }';
		const document = createMockDocument(docText, 'css');
		env.addMockDocument(document);
		const colorIndex = docText.indexOf('#ff0000');
		const cursor = document.positionAt(colorIndex + 1);
		const selection = new vscode.Selection(cursor, cursor);
		const editor = createEditor(document, selection);
		env.setActiveEditor(editor);
		env.setVisibleEditors([editor]);

		// Mock findFiles for usage search
		env.setFindFilesResults([document.uri]);

		const findUsagesCommand = env.registeredCommands.get('colorbuddy.findColorUsages');
		assert.ok(typeof findUsagesCommand === 'function', 'Find usages command should be registered');

		const payload: FindUsagesCommandPayload = {
			value: '#ff0000',
			label: '#ff0000',
			panel: 'formats' // Request formats panel instead of usages panel
		};

		await (findUsagesCommand as (...args: unknown[]) => unknown)(payload);

		const viewProvider = getAccessibilityView(env);
		const data = viewProvider.getLastRenderedData();

		assert.strictEqual(data?.usageMatches?.length, 2, 'Should find 2 matches for #ff0000');
		assert.strictEqual(data?.section, 'formats', 'Should have updated the formats section');
	});

	test('Format panel renders radio buttons for each match and conversion option', async function() {
		this.timeout(10000);
		const docText = 'body { color: #ff0000; background: #ff0000; }';
		const document = createMockDocument(docText, 'css');
		env.addMockDocument(document);
		const colorIndex = docText.indexOf('#ff0000');
		const cursor = document.positionAt(colorIndex + 1);
		const selection = new vscode.Selection(cursor, cursor);
		const editor = createEditor(document, selection);
		env.setActiveEditor(editor);
		env.setVisibleEditors([editor]);

		env.setFindFilesResults([document.uri]);

		const findUsagesCommand = env.registeredCommands.get('colorbuddy.findColorUsages');
		const payload: FindUsagesCommandPayload = {
			value: '#ff0000',
			label: '#ff0000',
			panel: 'formats'
		};

		await (findUsagesCommand as (...args: unknown[]) => unknown)(payload);

		const viewProvider = getAccessibilityView(env);
		const formatsProvider = viewProvider.getSectionProviders().find(p => p.viewId === 'colorbuddy.formatConversionPanel');
		assert.ok(formatsProvider, 'Formats provider should exist');

		const html = (formatsProvider as any).renderContent(viewProvider.getLastRenderedData());

		assert.strictEqual(viewProvider.getLastRenderedData()?.usageMatches?.length, 2, 'Should have 2 matches for bulk button');
		
		// Check for specific elements in the format conversion list
		assert.ok(html.includes('type="radio"'), 'HTML should include radio buttons for format selection');
		assert.ok(html.includes('codicon-copy'), 'HTML should include copy icons for each format');
		assert.ok(html.includes('codicon-replace'), 'HTML should include replace (convert) icons for each format');
		assert.ok(html.includes('Bulk Convert'), 'HTML should include a Bulk Convert button');
	});
});
