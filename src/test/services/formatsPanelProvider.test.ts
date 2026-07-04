import * as assert from 'assert';
import * as vscode from 'vscode';
import { FormatsPanelProvider } from '../../services/panels/formats/FormatsPanelProvider';
import type { AccessibilityViewData, AccessibilityUsageMatch } from '../../services/accessibilityViewProvider';

suite('FormatsPanelProvider Tests', () => {
	let provider: FormatsPanelProvider;
	const extensionUri = vscode.Uri.file('/test');

	setup(() => {
		provider = new FormatsPanelProvider(extensionUri, 'formats');
	});

	test('Renders format conversion options with visible text', () => {
		const mockMatch: AccessibilityUsageMatch = {
			uri: vscode.Uri.file('/test/app.css'),
			range: new vscode.Range(0, 0, 0, 7),
			previewText: '#ef4444',
			relativePath: 'app.css',
			isConvertible: true
		};

		const mockData: AccessibilityViewData = {
			label: 'bg-destructive',
			normalizedColor: '#ef4444',
			colorName: 'Red',
			colorHex: '#ef4444',
			brightness: 50,
			report: { samples: [] } as any,
			conversions: [
				{ format: 'hex', value: '#ef4444' },
				{ format: 'rgb', value: 'rgb(239, 68, 68)' },
				{ format: 'rgba', value: 'rgba(239, 68, 68, 1)' },
				{ format: 'hsl', value: 'hsl(0 84.24% 60.2%)' },
				{ format: 'hsla', value: 'hsla(0 84.24% 60.2% / 1.00)' },
				{ format: 'tailwind', value: '0 84.24% 60.2%' },
				{ format: 'hexAlpha', value: '#ef4444ff' }
			],
			usageMatches: [mockMatch],
			searchValue: 'bg-destructive'
		};

		provider.updateView(mockData);
		const lastData = provider.getLastRenderedData();
		assert.ok(lastData, 'Data should be stored');

		// Get the HTML content
		const webview = {
			asWebviewUri: (uri: vscode.Uri) => uri,
			cspSource: 'test'
		} as any;
		
		const html = (provider as any).getWebviewHtml(webview, mockData);
		
		// Test that format names are present in HTML
		assert.ok(html.includes('Hex'), 'Should contain "Hex" format label');
		assert.ok(html.includes('RGB'), 'Should contain "RGB" format label');
		assert.ok(html.includes('RGBA'), 'Should contain "RGBA" format label');
		assert.ok(html.includes('HSL'), 'Should contain "HSL" format label');
		assert.ok(html.includes('HSLA'), 'Should contain "HSLA" format label');
		assert.ok(html.includes('TAILWIND'), 'Should contain "TAILWIND" format label');
		assert.ok(html.includes('Hex (with alpha)'), 'Should contain "Hex (with alpha)" format label');
		
		// Test that format values are present in HTML
		assert.ok(html.includes('#ef4444'), 'Should contain hex value');
		assert.ok(html.includes('rgb(239, 68, 68)'), 'Should contain RGB value');
		assert.ok(html.includes('rgba(239, 68, 68, 1)'), 'Should contain RGBA value');
		assert.ok(html.includes('hsl(0 84.24% 60.2%)'), 'Should contain HSL value');
		assert.ok(html.includes('hsla(0 84.24% 60.2% / 1.00)'), 'Should contain HSLA value');
		assert.ok(html.includes('0 84.24% 60.2%'), 'Should contain Tailwind value');
		assert.ok(html.includes('#ef4444ff'), 'Should contain hex alpha value');
		
		// Test structure - should have radio buttons
		assert.ok(html.includes('type="radio"'), 'Should contain radio buttons');
		assert.ok(html.includes('cb-format-row'), 'Should have format row class');
		assert.ok(html.includes('cb-format-label'), 'Should have format label class');
		assert.ok(html.includes('cb-format-code'), 'Should have format code class');
		
		// Test that icons are present
		assert.ok(html.includes('codicon-replace'), 'Should contain replace icon');
		assert.ok(html.includes('codicon-copy'), 'Should contain copy icon');
	});

	test('Format labels and values are in separate elements', () => {
		const mockMatch: AccessibilityUsageMatch = {
			uri: vscode.Uri.file('/test/app.css'),
			range: new vscode.Range(0, 0, 0, 7),
			previewText: '#ef4444',
			relativePath: 'app.css',
			isConvertible: true
		};

		const mockData: AccessibilityViewData = {
			label: 'color',
			normalizedColor: '#ef4444',
			colorName: 'Red',
			colorHex: '#ef4444',
			brightness: 50,
			report: { samples: [] } as any,
			conversions: [
				{ format: 'hex', value: '#ef4444' },
				{ format: 'rgb', value: 'rgb(239, 68, 68)' }
			],
			usageMatches: [mockMatch],
			searchValue: 'color'
		};

		const webview = {
			asWebviewUri: (uri: vscode.Uri) => uri,
			cspSource: 'test'
		} as any;
		
		const html = (provider as any).getWebviewHtml(webview, mockData);
		
		// Check that label and value are in separate span/code elements
		const hexLabelMatch = html.match(/<span[^>]*class="cb-format-label"[^>]*>([^<]*)</);
		assert.ok(hexLabelMatch, 'Should find format label span');
		assert.ok(hexLabelMatch[1].includes('Hex'), 'Label should contain "Hex"');
		
		const hexValueMatch = html.match(/<code[^>]*class="cb-format-code"[^>]*>([^<]*)</);
		assert.ok(hexValueMatch, 'Should find format value code');
		assert.ok(hexValueMatch[1].includes('#ef4444'), 'Value should contain hex color');
	});
});
