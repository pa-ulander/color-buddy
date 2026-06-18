import * as assert from 'assert';
import * as vscode from 'vscode';
import { appendQuickActions } from '../../utils/quickActions';

suite('QuickActions', () => {
	suite('appendQuickActions', () => {
		test('should include convert action for literal colors', () => {
			const markdown = new vscode.MarkdownString();
			const overrides = {
				'colorbuddy.findColorUsages': {
					args: [{
						uri: 'file:///test.css',
						range: { start: { line: 0, character: 0 }, end: { line: 0, character: 7 } },
						normalizedColor: 'rgb(255, 0, 0)',
						originalText: '#ff0000',
						format: 'hex',
						source: 'hover',
						panel: 'formats'
					}]
				}
			};
			
			appendQuickActions(markdown, { surface: 'hover', overrides });
			const content = markdown.value;
			
			// Should include convert action
			assert.ok(content.includes('Convert'), 'Should include Convert action for literal colors');
			assert.ok(content.includes('colorbuddy.findColorUsages'), 'Should include convert command');
		});
		
test('should show convert action for CSS variables (Option 2: convert-at-definition)', () => {
		const markdown = new vscode.MarkdownString();
		// No convert override provided, but action is still enabled (Option 2)
		const overrides = {
			'colorbuddy.copyColorAs': {
				args: [{
					value: 'rgb(255, 0, 0)',
					format: 'rgb',
					source: 'hover'
				}]
			}
		};
		
		appendQuickActions(markdown, { surface: 'hover', overrides });
		const content = markdown.value;
		
		// Should include convert action as enabled (Option 2: converts at definition)
		assert.ok(content.includes('Copy'), 'Should include Copy action');
		assert.ok(content.includes('Convert'), 'Should include Convert action for CSS variables');
		assert.ok(!content.includes('~~`Convert`~~'), 'Convert should NOT be disabled (Option 2 support)');
		assert.ok(content.includes('[`Convert`]'), 'Convert should be clickable link');
		});
		
test('should show convert action for Tailwind classes (Option 2: convert-at-definition)', () => {
		const markdown = new vscode.MarkdownString();
		const overrides = {
			'colorbuddy.copyColorAs': {
				args: [{
					value: 'rgb(255, 0, 0)',
					format: 'rgb',
					source: 'hover'
				}]
			}
		};
		
		appendQuickActions(markdown, { surface: 'hover', overrides });
		const content = markdown.value;
		
		assert.ok(content.includes('Copy'), 'Should include Copy action');
		assert.ok(content.includes('Convert'), 'Should include Convert action');
		assert.ok(!content.includes('~~`Convert`~~'), 'Convert should NOT be disabled (Option 2 support)');
		assert.ok(content.includes('[`Convert`]'), 'Convert should be clickable link');
		});
		
test('should show convert action for CSS class names (Option 2: convert-at-definition)', () => {
		const markdown = new vscode.MarkdownString();
		const overrides = {
			'colorbuddy.copyColorAs': {
				args: [{
					value: 'rgb(255, 0, 0)',
					format: 'rgb',
					source: 'hover'
				}]
			}
		};
		
		appendQuickActions(markdown, { surface: 'hover', overrides });
		const content = markdown.value;
		
		assert.ok(content.includes('Copy'), 'Should include Copy action');
		assert.ok(content.includes('Convert'), 'Should include Convert action');
		assert.ok(!content.includes('~~`Convert`~~'), 'Convert should NOT be disabled (Option 2 support)');
		assert.ok(content.includes('[`Convert`]'), 'Convert should be clickable link');
		});
		
		test('should include all actions when all overrides provided', () => {
			const markdown = new vscode.MarkdownString();
			const overrides = {
				'colorbuddy.copyColorAs': {
					args: [{ value: 'rgb(255, 0, 0)', format: 'rgb', source: 'hover' }]
				},
				'colorbuddy.convertColorFormat': {
					args: [{
						uri: 'file:///test.css',
						range: { start: { line: 0, character: 0 }, end: { line: 0, character: 7 } },
						normalizedColor: 'rgb(255, 0, 0)',
						originalText: '#ff0000',
						format: 'hex',
						source: 'hover'
					}]
				},
				'colorbuddy.testColorAccessibility': {
					args: [{ value: 'rgb(255, 0, 0)', format: 'rgb', source: 'hover' }]
				},
				'colorbuddy.findColorUsages': {
					args: [{ value: 'rgb(255, 0, 0)', format: 'rgb', source: 'hover' }]
				}
			};
			
			appendQuickActions(markdown, { surface: 'hover', overrides });
			const content = markdown.value;
			
			assert.ok(content.includes('Copy'), 'Should include Copy');
			assert.ok(content.includes('Convert'), 'Should include Convert');
			assert.ok(content.includes('accessibility'), 'Should include Test accessibility');
			assert.ok(content.includes('Find usages'), 'Should include Find usages');
		});
	});
});
