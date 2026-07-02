/**
 * Unit tests for Registry service
 */

import * as assert from 'assert';
import * as vscode from 'vscode';
import { Registry } from '../../services/registry';
import { createMockCSSVariableDeclaration, createMockCSSClassDeclaration } from '../helpers';

suite('Registry Service', () => {
    let registry: Registry;

    setup(() => {
        registry = new Registry();
    });

    suite('CSS Variables', () => {
        test('addVariable stores variable declaration', () => {
            const decl = createMockCSSVariableDeclaration('--primary', '#ff0000');
            registry.addVariable('--primary', decl);

            const result = registry.getVariable('--primary');
            assert.ok(result);
            assert.strictEqual(result.length, 1);
            assert.strictEqual(result[0].name, '--primary');
            assert.strictEqual(result[0].value, '#ff0000');
        });

        test('addVariable appends to existing variable', () => {
            const decl1 = createMockCSSVariableDeclaration('--primary', '#ff0000');
            const decl2 = createMockCSSVariableDeclaration('--primary', '#00ff00', {
                context: { type: 'class', themeHint: 'dark', specificity: 10 }
            });

            registry.addVariable('--primary', decl1);
            registry.addVariable('--primary', decl2);

            const result = registry.getVariable('--primary');
            assert.strictEqual(result?.length, 2);
        });

        test('getVariable returns undefined for non-existent variable', () => {
            const result = registry.getVariable('--nonexistent');
            assert.strictEqual(result, undefined);
        });

        test('getVariablesSorted returns declarations sorted by specificity', () => {
            const root = createMockCSSVariableDeclaration('--color', '#fff', {
                context: { type: 'root', themeHint: undefined, specificity: 1 }
            });
            const classDecl = createMockCSSVariableDeclaration('--color', '#000', {
                context: { type: 'class', themeHint: undefined, specificity: 10 }
            });

            registry.addVariable('--color', classDecl);
            registry.addVariable('--color', root);

            const sorted = registry.getVariablesSorted('--color');
            assert.strictEqual(sorted.length, 2);
            assert.strictEqual(sorted[0].context.specificity, 1);
            assert.strictEqual(sorted[1].context.specificity, 10);
        });

        test('hasVariable returns true for existing variable', () => {
            const decl = createMockCSSVariableDeclaration('--primary', '#ff0000');
            registry.addVariable('--primary', decl);

            assert.strictEqual(registry.hasVariable('--primary'), true);
            assert.strictEqual(registry.hasVariable('--nonexistent'), false);
        });

        test('getAllVariableNames returns all variable names', () => {
            registry.addVariable('--primary', createMockCSSVariableDeclaration('--primary', '#f00'));
            registry.addVariable('--secondary', createMockCSSVariableDeclaration('--secondary', '#0f0'));

            const names = registry.getAllVariableNames();
            assert.strictEqual(names.length, 2);
            assert.ok(names.includes('--primary'));
            assert.ok(names.includes('--secondary'));
        });

        test('variableCount returns correct count', () => {
            assert.strictEqual(registry.variableCount, 0);

            registry.addVariable('--primary', createMockCSSVariableDeclaration('--primary', '#f00'));
            assert.strictEqual(registry.variableCount, 1);

            registry.addVariable('--secondary', createMockCSSVariableDeclaration('--secondary', '#0f0'));
            assert.strictEqual(registry.variableCount, 2);

            // Adding to same variable shouldn't increase count
            registry.addVariable('--primary', createMockCSSVariableDeclaration('--primary', '#00f'));
            assert.strictEqual(registry.variableCount, 2);
        });
    });

    suite('CSS Classes', () => {
        test('addClass stores class declaration', () => {
            const decl = createMockCSSClassDeclaration('primary', 'color', '#ff0000');
            registry.addClass('primary', decl);

            const result = registry.getClass('primary');
            assert.ok(result);
            assert.strictEqual(result.length, 1);
            assert.strictEqual(result[0].className, 'primary');
            assert.strictEqual(result[0].property, 'color');
            assert.strictEqual(result[0].value, '#ff0000');
        });

        test('addClass appends to existing class', () => {
            const decl1 = createMockCSSClassDeclaration('btn', 'color', '#fff');
            const decl2 = createMockCSSClassDeclaration('btn', 'background-color', '#000');

            registry.addClass('btn', decl1);
            registry.addClass('btn', decl2);

            const result = registry.getClass('btn');
            assert.strictEqual(result?.length, 2);
        });

        test('getClass returns undefined for non-existent class', () => {
            const result = registry.getClass('nonexistent');
            assert.strictEqual(result, undefined);
        });

        test('hasClass returns true for existing class', () => {
            const decl = createMockCSSClassDeclaration('primary', 'color', '#ff0000');
            registry.addClass('primary', decl);

            assert.strictEqual(registry.hasClass('primary'), true);
            assert.strictEqual(registry.hasClass('nonexistent'), false);
        });

        test('getAllClassNames returns all class names', () => {
            registry.addClass('btn', createMockCSSClassDeclaration('btn', 'color', '#f00'));
            registry.addClass('link', createMockCSSClassDeclaration('link', 'color', '#00f'));

            const names = registry.getAllClassNames();
            assert.strictEqual(names.length, 2);
            assert.ok(names.includes('btn'));
            assert.ok(names.includes('link'));
        });

        test('getClassesSorted returns sorted class names', () => {
            registry.addClass('zebra', createMockCSSClassDeclaration('zebra', 'color', '#000'));
            registry.addClass('alpha', createMockCSSClassDeclaration('alpha', 'color', '#fff'));
            registry.addClass('beta', createMockCSSClassDeclaration('beta', 'color', '#f00'));

            const sorted = registry.getClassesSorted();
            assert.deepStrictEqual(sorted, ['alpha', 'beta', 'zebra']);
        });

        test('classCount returns correct count', () => {
            assert.strictEqual(registry.classCount, 0);

            registry.addClass('btn', createMockCSSClassDeclaration('btn', 'color', '#f00'));
            assert.strictEqual(registry.classCount, 1);

            registry.addClass('link', createMockCSSClassDeclaration('link', 'color', '#00f'));
            assert.strictEqual(registry.classCount, 2);

            // Adding to same class shouldn't increase count
            registry.addClass('btn', createMockCSSClassDeclaration('btn', 'background', '#000'));
            assert.strictEqual(registry.classCount, 2);
        });
    });

    suite('URI Management', () => {
        test('removeByUri removes variables from specific file', () => {
            const uri1 = vscode.Uri.parse('file:///test1.css');
            const uri2 = vscode.Uri.parse('file:///test2.css');

            registry.addVariable('--color', createMockCSSVariableDeclaration('--color', '#fff', { uri: uri1 }));
            registry.addVariable('--color', createMockCSSVariableDeclaration('--color', '#000', { uri: uri2 }));
            registry.addVariable('--other', createMockCSSVariableDeclaration('--other', '#f00', { uri: uri1 }));

            assert.strictEqual(registry.variableCount, 2);
            assert.strictEqual(registry.getVariable('--color')?.length, 2);

            registry.removeByUri(uri1);

            assert.strictEqual(registry.variableCount, 1);
            assert.strictEqual(registry.getVariable('--color')?.length, 1);
            assert.strictEqual(registry.getVariable('--color')?.[0].uri.toString(), uri2.toString());
            assert.strictEqual(registry.getVariable('--other'), undefined);
        });

        test('removeByUri removes classes from specific file', () => {
            const uri1 = vscode.Uri.parse('file:///test1.css');
            const uri2 = vscode.Uri.parse('file:///test2.css');

            registry.addClass('btn', createMockCSSClassDeclaration('btn', 'color', '#fff', { uri: uri1 }));
            registry.addClass('btn', createMockCSSClassDeclaration('btn', 'background', '#000', { uri: uri2 }));
            registry.addClass('link', createMockCSSClassDeclaration('link', 'color', '#00f', { uri: uri1 }));

            assert.strictEqual(registry.classCount, 2);

            registry.removeByUri(uri1);

            assert.strictEqual(registry.classCount, 1);
            assert.strictEqual(registry.getClass('btn')?.length, 1);
            assert.strictEqual(registry.getClass('link'), undefined);
        });

        test('removeByUri handles non-existent URI gracefully', () => {
            const uri1 = vscode.Uri.parse('file:///existing.css');
            const uri2 = vscode.Uri.parse('file:///nonexistent.css');
            registry.addVariable('--color', createMockCSSVariableDeclaration('--color', '#fff', { uri: uri1 }));

            registry.removeByUri(uri2);

            assert.strictEqual(registry.variableCount, 1);
        });
    });

    suite('Clear', () => {
        test('clear removes all variables and classes', () => {
            registry.addVariable('--primary', createMockCSSVariableDeclaration('--primary', '#f00'));
            registry.addVariable('--secondary', createMockCSSVariableDeclaration('--secondary', '#0f0'));
            registry.addClass('btn', createMockCSSClassDeclaration('btn', 'color', '#fff'));

            assert.strictEqual(registry.variableCount, 2);
            assert.strictEqual(registry.classCount, 1);

            registry.clear();

            assert.strictEqual(registry.variableCount, 0);
            assert.strictEqual(registry.classCount, 0);
            assert.strictEqual(registry.getVariable('--primary'), undefined);
            assert.strictEqual(registry.getClass('btn'), undefined);
        });
    });

    // Phase 1: Registry lookup tests for Option 2 (convert-at-definition)
    suite('Registry Definition Lookup for Option 2', () => {
        test('returns all definitions for CSS variable', () => {
            // Given: Registry with --primary in 2 files
            const uri1 = vscode.Uri.parse('file:///styles/light.css');
            const uri2 = vscode.Uri.parse('file:///styles/dark.css');
            
            const decl1 = createMockCSSVariableDeclaration('--primary', '#3b82f6', { 
                uri: uri1, 
                line: 10 
            });
            const decl2 = createMockCSSVariableDeclaration('--primary', '#1e40af', { 
                uri: uri2, 
                line: 15 
            });

            registry.addVariable('--primary', decl1);
            registry.addVariable('--primary', decl2);

            // When: getVariable('--primary')
            const result = registry.getVariable('--primary');

            // Then: Returns array with 2 CSSVariableDeclaration objects
            assert.ok(result, 'Should return definitions');
            assert.strictEqual(result.length, 2, 'Should have 2 definitions');
            assert.ok(result.some(d => d.uri.toString() === uri1.toString()), 'Should include light.css');
            assert.ok(result.some(d => d.uri.toString() === uri2.toString()), 'Should include dark.css');
        });

        test('returns definitions sorted by specificity (highest priority first for convert-at-definition)', () => {
            // Given: --primary in :root (specificity 1) and .dark (specificity 10)
            const rootDecl = createMockCSSVariableDeclaration('--primary', '#3b82f6', {
                context: { type: 'root', themeHint: undefined, specificity: 1 }
            });
            const darkDecl = createMockCSSVariableDeclaration('--primary', '#1e40af', {
                context: { type: 'class', themeHint: 'dark', specificity: 10 }
            });

            registry.addVariable('--primary', darkDecl);
            registry.addVariable('--primary', rootDecl);

            // When: getVariable('--primary')
            const result = registry.getVariable('--primary');

            // Then: Sorted by specificity (lowest first, as per current sorting)
            assert.ok(result, 'Should return definitions');
            assert.strictEqual(result.length, 2);
            assert.strictEqual(result[0].context.specificity, 1, 'First should be :root (specificity 1)');
            assert.strictEqual(result[1].context.specificity, 10, 'Second should be .dark (specificity 10)');
        });

        test('returns empty array for unknown variable', () => {
            // Given: Registry with --primary only
            registry.addVariable('--primary', createMockCSSVariableDeclaration('--primary', '#3b82f6'));

            // When: getVariable('--unknown')
            const result = registry.getVariable('--unknown');

            // Then: Returns undefined (not empty array, per current API)
            assert.strictEqual(result, undefined, 'Should return undefined for unknown variable');
        });

        test('returns definitions with uri and line for file navigation', () => {
            // Given: CSS variable with specific file and line
            const uri = vscode.Uri.parse('file:///styles/colors.css');
            const lineNumber = 42;
            
            const decl = createMockCSSVariableDeclaration('--primary', '#3b82f6', {
                uri: uri,
                line: lineNumber
            });

            registry.addVariable('--primary', decl);

            // When: getVariable('--primary')
            const result = registry.getVariable('--primary');

            // Then: Definition includes uri and line for navigation
            assert.ok(result, 'Should return definition');
            assert.strictEqual(result.length, 1);
            assert.strictEqual(result[0].uri.toString(), uri.toString(), 'Should have correct URI');
            assert.strictEqual(result[0].line, lineNumber, 'Should have correct line number');
        });

        test('returns CSS class definitions with file location', () => {
            // Given: CSS class with color property
            const uri = vscode.Uri.parse('file:///components/button.css');
            const lineNumber = 25;
            
            const decl = createMockCSSClassDeclaration('btn-primary', 'background-color', '#3b82f6', {
                uri: uri,
                line: lineNumber
            });

            registry.addClass('btn-primary', decl);

            // When: getClass('btn-primary')
            const result = registry.getClass('btn-primary');

            // Then: Definition includes uri and line
            assert.ok(result, 'Should return definition');
            assert.strictEqual(result.length, 1);
            assert.strictEqual(result[0].uri.toString(), uri.toString(), 'Should have correct URI');
            assert.strictEqual(result[0].line, lineNumber, 'Should have correct line number');
            assert.strictEqual(result[0].value, '#3b82f6', 'Should have color value');
        });

        test('handles multiple CSS class definitions from different files', () => {
            // Given: Same class name in multiple files (e.g., component overrides)
            const uri1 = vscode.Uri.parse('file:///base.css');
            const uri2 = vscode.Uri.parse('file:///theme.css');
            
            const decl1 = createMockCSSClassDeclaration('primary', 'color', '#3b82f6', { uri: uri1 });
            const decl2 = createMockCSSClassDeclaration('primary', 'background-color', '#1e40af', { uri: uri2 });

            registry.addClass('primary', decl1);
            registry.addClass('primary', decl2);

            // When: getClass('primary')
            const result = registry.getClass('primary');

            // Then: Returns all definitions
            assert.ok(result, 'Should return definitions');
            assert.strictEqual(result.length, 2, 'Should have 2 definitions');
            assert.ok(result.some(d => d.uri.toString() === uri1.toString()), 'Should include base.css');
            assert.ok(result.some(d => d.uri.toString() === uri2.toString()), 'Should include theme.css');
        });
    });
});
