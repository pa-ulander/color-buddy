import * as assert from 'assert';
import * as vscode from 'vscode';
import { AccessibilityViewProvider } from '../../services/accessibilityViewProvider';
import type { AccessibilityViewData } from '../../services/accessibilityViewProvider';

suite('Accessibility View Links', () => {
	let provider: AccessibilityViewProvider;
	let summaryProvider: any;

	setup(() => {
		const extensionUri = vscode.Uri.file('/test/extension');
		provider = new AccessibilityViewProvider(extensionUri);
		// Get the summary section provider which has the renderSummarySection logic
		summaryProvider = provider.getSectionProviders().find((p: any) => p.section === 'summary');
	});

	test('definition links use command:vscode.open format (working format)', () => {
		// Create test data with variable contexts (definitions)
		const testUri = vscode.Uri.file('/test/theme.css');
		const data: AccessibilityViewData = {
			label: 'bg-primary',
			normalizedColor: 'hsl(217, 82%, 38%)',
			colorName: 'Defined value',
			colorHex: '217 82% 38%',
			brightness: 38,
			report: {
				samples: []
			},
			conversions: [
				{ format: 'hex', value: '#2563eb' },
				{ format: 'rgb', value: 'rgb(37, 99, 235)' }
			],
			usageCount: 2,
			cssVariableName: '--primary',
			variableContexts: [
				{
					label: 'app.css',
					value: '217 82% 38%',
					resolvedValue: '217 82% 38%',
					location: 'line 13',
					uri: testUri,
					line: 12
				}
			],
			section: 'summary'
		};

		// Render the summary section
		const html = (summaryProvider as any).renderSummarySection(data);

		// Verify the link uses command:vscode.open format (same as WCAG panel)
		const uriWithFragment = `${testUri.toString()}#13`;
		const encodedArgs = encodeURIComponent(JSON.stringify([uriWithFragment]));
		const expectedCommandUri = `command:vscode.open?${encodedArgs}`;
		
		assert.ok(html.includes(expectedCommandUri), 
			`Link should use command:vscode.open format: ${expectedCommandUri}`);
	});

	test('definition links work with multiple contexts', () => {
		const themeUri = vscode.Uri.file('/test/theme.css');
		const darkUri = vscode.Uri.file('/test/dark.css');
		
		const data: AccessibilityViewData = {
			label: 'bg-primary',
			normalizedColor: 'hsl(217, 82%, 38%)',
			colorName: 'Defined value',
			colorHex: '217 82% 38%',
			brightness: 38,
			report: {
				samples: []
			},
			conversions: [],
			usageCount: 2,
			cssVariableName: '--primary',
			variableContexts: [
				{
					label: 'theme.css',
					value: '#3b82f6',
					resolvedValue: '#3b82f6',
					location: 'line 10',
					uri: themeUri,
					line: 9
				},
				{
					label: 'dark.css',
					value: '#60a5fa',
					resolvedValue: '#60a5fa',
					location: 'line 15',
					uri: darkUri,
					line: 14
				}
			],
			section: 'summary'
		};

		const html = (summaryProvider as any).renderSummarySection(data);

		// Should have 2 command:vscode.open links
		const uriWithFragment1 = `${themeUri.toString()}#10`;
		const encodedArgs1 = encodeURIComponent(JSON.stringify([uriWithFragment1]));
		const expectedCommandUri1 = `command:vscode.open?${encodedArgs1}`;
		
		const uriWithFragment2 = `${darkUri.toString()}#15`;
		const encodedArgs2 = encodeURIComponent(JSON.stringify([uriWithFragment2]));
		const expectedCommandUri2 = `command:vscode.open?${encodedArgs2}`;
		
		assert.ok(html.includes(expectedCommandUri1), 'Should have link to line 10');
		assert.ok(html.includes(expectedCommandUri2), 'Should have link to line 15');

		// Both should include file names
		assert.ok(html.includes('theme.css'), 'Should include theme.css filename');
		assert.ok(html.includes('dark.css'), 'Should include dark.css filename');
	});

	test('definition links handle special characters in paths', () => {
		const pathWithSpaces = vscode.Uri.file('/test/my theme/app colors.css');
		const data: AccessibilityViewData = {
			label: 'color',
			normalizedColor: '#fff',
			colorName: 'White',
			colorHex: '#ffffff',
			brightness: 100,
			report: {
				samples: []
			},
			conversions: [],
			usageCount: 1,
			cssVariableName: '--color',
			variableContexts: [
				{
					label: 'app colors.css',
					value: '#fff',
					resolvedValue: '#fff',
					location: 'line 1',
					uri: pathWithSpaces,
					line: 0
				}
			],
			section: 'summary'
		};

		const html = (summaryProvider as any).renderSummarySection(data);

		// Should use command:vscode.open format with encoded args
		const uriWithFragment = `${pathWithSpaces.toString()}#1`;
		const encodedArgs = encodeURIComponent(JSON.stringify([uriWithFragment]));
		const expectedCommandUri = `command:vscode.open?${encodedArgs}`;
		
		assert.ok(html.includes(expectedCommandUri), 
			'Link should use command:vscode.open format even with special characters in path');
	});

	test('definition links include clickable href with correct line number', () => {
		// Test case matching the screenshot: bg-primary with multiple theme definitions
		const defaultThemeUri = vscode.Uri.file('/workspace/tailwind-color-gutter/tailwind-color-gutter/examples/example.css');
		const darkThemeUri = vscode.Uri.file('/workspace/tailwind-color-gutter/tailwind-color-gutter/examples/example.css');
		
		const data: AccessibilityViewData = {
			label: 'bg-primary',
			normalizedColor: '#2563eb',
			colorName: 'Defined value',
			colorHex: '#2563eb',
			brightness: 15,
			report: {
				samples: []
			},
			conversions: [],
			usageCount: 2,
			cssVariableName: '--primary',
			variableContexts: [
				{
					label: 'Default Theme',
					value: '#2563eb',
					resolvedValue: '#2563eb',
					location: 'line 3',
					uri: defaultThemeUri,
					line: 2
				},
				{
					label: 'Dark Theme',
					value: 'rgba(17, 78, 176, 1)',
					resolvedValue: 'rgba(17, 78, 176, 1)',
					location: 'line 45',
					uri: darkThemeUri,
					line: 44
				}
			],
			section: 'summary'
		};

		const html = (summaryProvider as any).renderSummarySection(data);

		// Verify links use the same format as WCAG panel (command:vscode.open with encoded args)
		// This is the format that actually works in webviews
		const uriWithFragment1 = `${defaultThemeUri.toString()}#3`;
		const encodedArgs1 = encodeURIComponent(JSON.stringify([uriWithFragment1]));
		const expectedCommandUri1 = `command:vscode.open?${encodedArgs1}`;
		
		const uriWithFragment2 = `${darkThemeUri.toString()}#45`;
		const encodedArgs2 = encodeURIComponent(JSON.stringify([uriWithFragment2]));
		const expectedCommandUri2 = `command:vscode.open?${encodedArgs2}`;
		
		assert.ok(html.includes(expectedCommandUri1), 
			`Summary panel should use command:vscode.open format like WCAG panel. Expected: ${expectedCommandUri1}`);
		assert.ok(html.includes(expectedCommandUri2), 
			`Summary panel should use command:vscode.open format like WCAG panel. Expected: ${expectedCommandUri2}`);
		
		// Verify links are in <a href="..."> tags (clickable)
		assert.ok(html.includes(`<a href="${expectedCommandUri1}"`), 
			'Link 1 should be wrapped in anchor tag with href');
		assert.ok(html.includes(`<a href="${expectedCommandUri2}"`), 
			'Link 2 should be wrapped in anchor tag with href');
		
		// Verify location text is present
		assert.ok(html.includes('line 3'), 'Should show line 3 text');
		assert.ok(html.includes('line 45'), 'Should show line 45 text');
	});
});
