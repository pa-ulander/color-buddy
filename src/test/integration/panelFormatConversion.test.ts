import * as assert from 'assert';
import * as vscode from 'vscode';
import type { ConvertColorCommandPayload, ColorFormat } from '../../types';
import { createMockDocument } from '../helpers';
import { setupCommandTestEnvironment, getAccessibilityView, createEditor, type CommandTestEnvironment } from '../helpers/commandTestEnvironment';

suite('Panel Format Conversion Tests', () => {
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

	test('Sequential format conversions update checkmark correctly', async function() {
		this.timeout(10000);
		const docText = 'body { color: #ff6347; }';
		const document = createMockDocument(docText, 'css');
		const colorIndex = docText.indexOf('#ff6347');
		const cursor = document.positionAt(colorIndex + 1);
		const selection = new vscode.Selection(cursor, cursor);
		const editor = createEditor(document, selection);
		env.setActiveEditor(editor);
		env.setVisibleEditors([editor]);

		const convertCommand = env.registeredCommands.get('colorbuddy.convertColorFormat');
		assert.ok(typeof convertCommand === 'function', 'Convert command should be registered');

		// Open formats panel
		await (convertCommand as (...args: unknown[]) => unknown)();

		const viewProvider = getAccessibilityView(env);
		const initialData = viewProvider.getLastRenderedData();
		assert.ok(initialData?.conversions && initialData.conversions.length > 0, 'Should have format conversions');

		// Verify initial format is hex
		assert.ok(initialData.currentFormatValue?.includes('#ff6347'), 'Initial format should be hex');

		// Convert to RGB
		const rgbFormat = initialData.conversions.find((c: any) => c.format === 'rgb')?.format;
		assert.ok(rgbFormat, 'Should have RGB format option');

		const rgbPayload: ConvertColorCommandPayload = {
			uri: document.uri.toString(),
			range: {
				start: { line: 0, character: colorIndex },
				end: { line: 0, character: colorIndex + '#ff6347'.length }
			},
			normalizedColor: '#ff6347',
			originalText: '#ff6347',
			format: rgbFormat as ColorFormat,
			source: 'panel'
		};

		await (convertCommand as (...args: unknown[]) => unknown)(rgbPayload);

		// Verify panel data shows RGB as current
		let updatedData = viewProvider.getLastRenderedData();
		assert.ok(updatedData?.currentFormatValue?.includes('rgb(255, 99, 71)'), 'Current format should be RGB after conversion');
		assert.strictEqual(document.getText(), 'body { color: rgb(255, 99, 71); }', 'Document should have RGB value');

		// Convert to HSL
		const hslFormat = updatedData?.conversions.find((c: any) => c.format === 'hsl')?.format;
		assert.ok(hslFormat, 'Should have HSL format option');

		const hslPayload: ConvertColorCommandPayload = {
			uri: document.uri.toString(),
			range: {
				start: { line: 0, character: colorIndex },
				end: { line: 0, character: colorIndex + 'rgb(255, 99, 71)'.length }
			},
			normalizedColor: 'rgb(255, 99, 71)',
			originalText: 'rgb(255, 99, 71)',
			format: hslFormat as ColorFormat,
			source: 'panel'
		};

		await (convertCommand as (...args: unknown[]) => unknown)(hslPayload);

		// Verify panel data shows HSL as current
		updatedData = viewProvider.getLastRenderedData();
		assert.ok(updatedData?.currentFormatValue?.includes('hsl('), 'Current format should be HSL after second conversion');

		// Convert back to hex
		const hexFormat = updatedData?.conversions.find((c: any) => c.format === 'hex')?.format;
		assert.ok(hexFormat, 'Should have hex format option');

		const hexPayload: ConvertColorCommandPayload = {
			uri: document.uri.toString(),
			range: {
				start: { line: 0, character: colorIndex },
				end: { line: 0, character: colorIndex + updatedData!.currentFormatValue!.length }
			},
			normalizedColor: updatedData!.currentFormatValue!,
			originalText: updatedData!.currentFormatValue!,
			format: hexFormat as ColorFormat,
			source: 'panel'
		};

		await (convertCommand as (...args: unknown[]) => unknown)(hexPayload);

		// Verify we're back to hex
		updatedData = viewProvider.getLastRenderedData();
		assert.ok(updatedData?.currentFormatValue?.includes('#ff6347'), 'Should return to hex format');
		assert.strictEqual(document.getText(), 'body { color: #ff6347; }', 'Document should have hex value again');
	});

	test('Panel checkmark tracks current format after multiple conversions', async function() {
		this.timeout(10000);
		const docText = 'div { background: rgba(255, 99, 71, 0.5); }';
		const document = createMockDocument(docText, 'css');
		const colorIndex = docText.indexOf('rgba');
		const cursor = document.positionAt(colorIndex + 1);
		const selection = new vscode.Selection(cursor, cursor);
		const editor = createEditor(document, selection);
		env.setActiveEditor(editor);
		env.setVisibleEditors([editor]);

		const convertCommand = env.registeredCommands.get('colorbuddy.convertColorFormat');
		assert.ok(typeof convertCommand === 'function', 'Convert command should be registered');

		// Open formats panel
		await (convertCommand as (...args: unknown[]) => unknown)();

		const viewProvider = getAccessibilityView(env);
		let currentData = viewProvider.getLastRenderedData();
		
		// Get available formats
		const formats = ['hex', 'rgb', 'hsl'] as ColorFormat[];
		
		for (const targetFormat of formats) {
			const conversion = currentData?.conversions.find((c: any) => c.format === targetFormat);
			if (!conversion) continue;

			const currentValue = currentData!.currentFormatValue!;
			const payload: ConvertColorCommandPayload = {
				uri: document.uri.toString(),
				range: {
					start: { line: 0, character: docText.indexOf(currentValue) },
					end: { line: 0, character: docText.indexOf(currentValue) + currentValue.length }
				},
				normalizedColor: currentValue,
				originalText: currentValue,
				format: targetFormat,
				source: 'panel'
			};

			await (convertCommand as (...args: unknown[]) => unknown)(payload);

			// Verify panel data updated
			currentData = viewProvider.getLastRenderedData();
			assert.ok(currentData, `Panel data should exist after converting to ${targetFormat}`);
			assert.ok(
				currentData.currentFormatValue?.toLowerCase().includes(targetFormat === 'hex' ? '#' : targetFormat),
				`Current format value should reflect ${targetFormat} format`
			);

			// Verify conversions list still contains all formats
			assert.ok(
				currentData.conversions && currentData.conversions.length >= 3,
				'Should maintain full conversion list'
			);
		}
	});

	test('Panel highlight updates without re-rendering entire list', async function() {
		this.timeout(10000);
		const docText = 'p { color: hsl(9, 100%, 64%); }';
		const document = createMockDocument(docText, 'css');
		const colorIndex = docText.indexOf('hsl');
		const cursor = document.positionAt(colorIndex + 1);
		const selection = new vscode.Selection(cursor, cursor);
		const editor = createEditor(document, selection);
		env.setActiveEditor(editor);
		env.setVisibleEditors([editor]);

		const convertCommand = env.registeredCommands.get('colorbuddy.convertColorFormat');
		await (convertCommand as (...args: unknown[]) => unknown)();

		const viewProvider = getAccessibilityView(env);
		const initialData = viewProvider.getLastRenderedData();
		const initialConversions = initialData?.conversions;
		assert.ok(initialConversions && initialConversions.length > 0, 'Should have conversions');

		// Convert to hex
		const hexConversion = initialConversions.find((c: any) => c.format === 'hex');
		assert.ok(hexConversion, 'Should have hex conversion');

		const payload: ConvertColorCommandPayload = {
			uri: document.uri.toString(),
			range: {
				start: { line: 0, character: colorIndex },
				end: { line: 0, character: colorIndex + 'hsl(9, 100%, 64%)'.length }
			},
			normalizedColor: 'hsl(9, 100%, 64%)',
			originalText: 'hsl(9, 100%, 64%)',
			format: 'hex',
			source: 'panel'
		};

		await (convertCommand as (...args: unknown[]) => unknown)(payload);

		const updatedData = viewProvider.getLastRenderedData();
		
		// Verify data model is updated
		assert.ok(updatedData?.currentFormatValue?.includes('#'), 'Should show hex as current');
		
		// Verify conversions list structure is maintained (same formats available)
		assert.strictEqual(
			updatedData?.conversions?.length,
			initialConversions.length,
			'Conversion list should maintain same length'
		);

		// Verify all original formats still present
		const updatedFormats = updatedData?.conversions?.map((c: any) => c.format) || [];
		const initialFormats = initialConversions.map((c: any) => c.format);
		for (const format of initialFormats) {
			assert.ok(
				updatedFormats.includes(format),
				`Format ${format} should still be available`
			);
		}
	});

	test('Panel conversion preserves trailing semicolon across format changes', async function() {
		this.timeout(10000);
		const docText = 'span { border-color: #3b82f6; }';
		const document = createMockDocument(docText, 'css');
		const colorIndex = docText.indexOf('#3b82f6');
		const cursor = document.positionAt(colorIndex + 1);
		const selection = new vscode.Selection(cursor, cursor);
		const editor = createEditor(document, selection);
		env.setActiveEditor(editor);
		env.setVisibleEditors([editor]);

		const convertCommand = env.registeredCommands.get('colorbuddy.convertColorFormat');
		await (convertCommand as (...args: unknown[]) => unknown)();

		const viewProvider = getAccessibilityView(env);
		const formats = ['rgb', 'hsl', 'hex'] as ColorFormat[];

		for (const format of formats) {
			const currentData = viewProvider.getLastRenderedData();
			const currentValue = currentData?.currentFormatValue || '#3b82f6';
			
			// Add semicolon to range
			const valueWithSemicolon = currentValue.endsWith(';') ? currentValue : `${currentValue};`;
			const rangeStart = document.getText().indexOf(currentValue.replace(';', ''));
			const rangeEnd = rangeStart + valueWithSemicolon.length;

			const payload: ConvertColorCommandPayload = {
				uri: document.uri.toString(),
				range: {
					start: { line: 0, character: rangeStart },
					end: { line: 0, character: rangeEnd }
				},
				normalizedColor: currentValue.replace(';', ''),
				originalText: valueWithSemicolon,
				format,
				source: 'panel'
			};

			await (convertCommand as (...args: unknown[]) => unknown)(payload);

			const docText = document.getText();
			const updatedData = viewProvider.getLastRenderedData();
			
			assert.ok(docText.includes(';'), `Document should preserve semicolon after converting to ${format}`);
			assert.ok(
				updatedData?.currentFormatValue?.endsWith(';'),
				`Panel data should show semicolon for ${format}`
			);
		}
	});

	test('Current format value matches document text after conversion', async function() {
		this.timeout(10000);
		const docText = 'a { color: rgb(59, 130, 246); }';
		const document = createMockDocument(docText, 'css');
		const colorIndex = docText.indexOf('rgb');
		const cursor = document.positionAt(colorIndex + 1);
		const selection = new vscode.Selection(cursor, cursor);
		const editor = createEditor(document, selection);
		env.setActiveEditor(editor);
		env.setVisibleEditors([editor]);

		const convertCommand = env.registeredCommands.get('colorbuddy.convertColorFormat');
		await (convertCommand as (...args: unknown[]) => unknown)();

		const viewProvider = getAccessibilityView(env);

		// Convert to hex
		const hexPayload: ConvertColorCommandPayload = {
			uri: document.uri.toString(),
			range: {
				start: { line: 0, character: colorIndex },
				end: { line: 0, character: colorIndex + 'rgb(59, 130, 246)'.length }
			},
			normalizedColor: 'rgb(59, 130, 246)',
			originalText: 'rgb(59, 130, 246)',
			format: 'hex',
			source: 'panel'
		};

		await (convertCommand as (...args: unknown[]) => unknown)(hexPayload);

		const updatedData = viewProvider.getLastRenderedData();
		const docAfterConversion = document.getText();
		
		// Extract actual color value from document
		const colorMatch = docAfterConversion.match(/#[0-9a-f]{6}/i);
		assert.ok(colorMatch, 'Document should contain hex color');
		
		// Verify panel data matches document
		assert.ok(
			updatedData?.currentFormatValue?.includes(colorMatch[0]),
			'Panel currentFormatValue should match document hex value'
		);

		// Convert to HSLA (if available)
		const hslaConversion = updatedData?.conversions.find((c: any) => c.format === 'hsla');
		if (hslaConversion) {
			const hslaPayload: ConvertColorCommandPayload = {
				uri: document.uri.toString(),
				range: {
					start: { line: 0, character: colorIndex },
					end: { line: 0, character: colorIndex + updatedData!.currentFormatValue!.length }
				},
				normalizedColor: updatedData!.currentFormatValue!,
				originalText: updatedData!.currentFormatValue!,
				format: 'hsla',
				source: 'panel'
			};

			await (convertCommand as (...args: unknown[]) => unknown)(hslaPayload);

			const finalData = viewProvider.getLastRenderedData();
			const finalDoc = document.getText();
			
			assert.ok(finalDoc.includes('hsla('), 'Document should contain HSLA color');
			assert.ok(
				finalData?.currentFormatValue?.includes('hsla('),
				'Panel should show HSLA as current format'
			);
		}
	});

	test('Panel conversions list maintains stable order across format changes', async function() {
		this.timeout(10000);
		const docText = 'button { background: #ef4444; }';
		const document = createMockDocument(docText, 'css');
		const colorIndex = docText.indexOf('#ef4444');
		const cursor = document.positionAt(colorIndex + 1);
		const selection = new vscode.Selection(cursor, cursor);
		const editor = createEditor(document, selection);
		env.setActiveEditor(editor);
		env.setVisibleEditors([editor]);

		const convertCommand = env.registeredCommands.get('colorbuddy.convertColorFormat');
		await (convertCommand as (...args: unknown[]) => unknown)();

		const viewProvider = getAccessibilityView(env);
		const initialData = viewProvider.getLastRenderedData();
		const initialOrder = initialData?.conversions?.map((c: any) => c.format) || [];

		assert.ok(initialOrder.length > 0, 'Should have initial conversion formats');

		// Convert through multiple formats
		const formatsToTest = ['rgb', 'hsl', 'hex'] as ColorFormat[];
		
		for (const targetFormat of formatsToTest) {
			const currentData = viewProvider.getLastRenderedData();
			const currentValue = currentData?.currentFormatValue || '#ef4444';

			const payload: ConvertColorCommandPayload = {
				uri: document.uri.toString(),
				range: {
					start: { line: 0, character: colorIndex },
					end: { line: 0, character: colorIndex + currentValue.length }
				},
				normalizedColor: currentValue,
				originalText: currentValue,
				format: targetFormat,
				source: 'panel'
			};

			await (convertCommand as (...args: unknown[]) => unknown)(payload);

			const updatedData = viewProvider.getLastRenderedData();
			const updatedOrder = updatedData?.conversions?.map((c: any) => c.format) || [];

			// Verify order hasn't changed
			assert.deepStrictEqual(
				updatedOrder,
				initialOrder,
				`Conversion list order should remain stable after converting to ${targetFormat}`
			);
		}
	});
});
