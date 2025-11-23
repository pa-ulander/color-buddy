import * as assert from 'assert';
import * as vscode from 'vscode';
import { ColorDetector } from '../../services/colorDetector';
import { ColorParser } from '../../services/colorParser';
import { Registry } from '../../services/registry';
import { createMockDocument } from '../helpers';
import type { CSSVariableDeclaration, CSSVariableContext } from '../../types';

suite('ColorDetector Service', () => {
    let detector: ColorDetector;
    let registry: Registry;
    let parser: ColorParser;

    setup(() => {
        registry = new Registry();
        parser = new ColorParser();
        detector = new ColorDetector(registry, parser);
    });

    suite('Hex Colors', () => {
        test('should detect 3-digit hex colors', () => {
            const doc = createMockDocument('color: #f00;');
            const results = detector.collectColorData(doc, doc.getText());
            
            assert.strictEqual(results.length, 1);
            assert.strictEqual(results[0].originalText, '#f00');
            assert.strictEqual(results[0].range.start.character, 7);
        });

        test('should detect 6-digit hex colors', () => {
            const doc = createMockDocument('background: #ff0000;');
            const results = detector.collectColorData(doc, doc.getText());
            
            assert.strictEqual(results.length, 1);
            assert.strictEqual(results[0].originalText, '#ff0000');
        });

        test('should detect 8-digit hex colors with alpha', () => {
            const doc = createMockDocument('color: #ff000080;');
            const results = detector.collectColorData(doc, doc.getText());
            
            assert.strictEqual(results.length, 1);
            assert.strictEqual(results[0].originalText, '#ff000080');
        });

        test('should detect multiple hex colors', () => {
            const doc = createMockDocument('colors: #f00 #0f0 #00f');
            const results = detector.collectColorData(doc, doc.getText());
            
            assert.strictEqual(results.length, 3);
            assert.strictEqual(results[0].originalText, '#f00');
            assert.strictEqual(results[1].originalText, '#0f0');
            assert.strictEqual(results[2].originalText, '#00f');
        });
    });

    suite('RGB/RGBA Functions', () => {
        test('should detect rgb() function', () => {
            const doc = createMockDocument('color: rgb(255, 0, 0);');
            const results = detector.collectColorData(doc, doc.getText());
            
            assert.strictEqual(results.length, 1);
            assert.strictEqual(results[0].originalText, 'rgb(255, 0, 0)');
        });

        test('should detect rgba() function', () => {
            const doc = createMockDocument('color: rgba(255, 0, 0, 0.5);');
            const results = detector.collectColorData(doc, doc.getText());
            
            assert.strictEqual(results.length, 1);
            assert.strictEqual(results[0].originalText, 'rgba(255, 0, 0, 0.5)');
        });

        test('should detect rgb with slash notation', () => {
            const doc = createMockDocument('color: rgb(255 0 0 / 0.5);');
            const results = detector.collectColorData(doc, doc.getText());
            
            assert.strictEqual(results.length, 1);
            assert.strictEqual(results[0].originalText, 'rgb(255 0 0 / 0.5)');
        });
    });

    suite('HSL/HSLA Functions', () => {
        test('should detect hsl() function', () => {
            const doc = createMockDocument('color: hsl(0, 100%, 50%);');
            const results = detector.collectColorData(doc, doc.getText());
            
            assert.strictEqual(results.length, 1);
            assert.strictEqual(results[0].originalText, 'hsl(0, 100%, 50%)');
        });

        test('should detect hsla() function', () => {
            const doc = createMockDocument('color: hsla(0, 100%, 50%, 0.5);');
            const results = detector.collectColorData(doc, doc.getText());
            
            assert.strictEqual(results.length, 1);
            assert.strictEqual(results[0].originalText, 'hsla(0, 100%, 50%, 0.5)');
        });

        test('should detect hsl with slash notation', () => {
            const doc = createMockDocument('color: hsl(0 100% 50% / 0.5);');
            const results = detector.collectColorData(doc, doc.getText());
            
            assert.strictEqual(results.length, 1);
            assert.strictEqual(results[0].originalText, 'hsl(0 100% 50% / 0.5)');
        });
    });

    suite('Tailwind Compact HSL', () => {
        test('should detect Tailwind compact HSL without alpha', () => {
            const doc = createMockDocument('color: 0 100% 50%;');
            const results = detector.collectColorData(doc, doc.getText());
            
            assert.strictEqual(results.length, 1);
            assert.strictEqual(results[0].originalText, '0 100% 50%');
        });

        test('should detect Tailwind compact HSL with alpha', () => {
            const doc = createMockDocument('color: 0 100% 50% / 0.5;');
            const results = detector.collectColorData(doc, doc.getText());
            
            assert.strictEqual(results.length, 1);
            assert.strictEqual(results[0].originalText, '0 100% 50% / 0.5');
        });

        test('should not detect Tailwind HSL inside functions', () => {
            const doc = createMockDocument('color: hsl(0 100% 50%);');
            const results = detector.collectColorData(doc, doc.getText());
            
            // Should only detect the hsl() function, not the inner HSL values
            assert.strictEqual(results.length, 1);
            assert.strictEqual(results[0].originalText, 'hsl(0 100% 50%)');
        });
    });

    suite('CSS Variables', () => {
        test('should detect CSS variable reference', () => {
            // Setup registry with variable
            const context: CSSVariableContext = { type: 'root', specificity: 0 };
            const decl: CSSVariableDeclaration = {
                name: '--primary',
                value: '#ff0000',
                uri: vscode.Uri.parse('file:///test.css'),
                line: 0,
                selector: ':root',
                context
            };
            registry.addVariable('--primary', decl);

            const doc = createMockDocument('color: var(--primary);');
            const results = detector.collectColorData(doc, doc.getText());
            
            assert.strictEqual(results.length, 1);
            assert.strictEqual(results[0].originalText, 'var(--primary)');
            assert.strictEqual(results[0].isCssVariable, true);
            assert.strictEqual(results[0].variableName, '--primary');
        });

        test('should not detect undefined CSS variable', () => {
            const doc = createMockDocument('color: var(--undefined);');
            const results = detector.collectColorData(doc, doc.getText());
            
            assert.strictEqual(results.length, 0);
        });

        test('should detect CSS variable wrapped in hsl()', () => {
            const context: CSSVariableContext = { type: 'root', specificity: 0 };
            const decl: CSSVariableDeclaration = {
                name: '--primary-hsl',
                value: '0 100% 50%',
                uri: vscode.Uri.parse('file:///test.css'),
                line: 0,
                selector: ':root',
                context
            };
            registry.addVariable('--primary-hsl', decl);

            const doc = createMockDocument('color: hsl(var(--primary-hsl));');
            const results = detector.collectColorData(doc, doc.getText());
            
            // Should detect the wrapped variable reference
            assert.ok(results.length > 0);
            const wrappedVar = results.find(r => r.originalText === 'hsl(var(--primary-hsl))');
            assert.ok(wrappedVar, 'Should find wrapped variable reference');
            assert.strictEqual(wrappedVar.isCssVariable, true);
            assert.strictEqual(wrappedVar.isWrappedInFunction, true);
        });

        test('should resolve nested CSS variables', () => {
            const context: CSSVariableContext = { type: 'root', specificity: 0 };
            const decl1: CSSVariableDeclaration = {
                name: '--color-base',
                value: '#ff0000',
                uri: vscode.Uri.parse('file:///test.css'),
                line: 0,
                selector: ':root',
                context
            };
            const decl2: CSSVariableDeclaration = {
                name: '--color-primary',
                value: 'var(--color-base)',
                uri: vscode.Uri.parse('file:///test.css'),
                line: 1,
                selector: ':root',
                context
            };
            registry.addVariable('--color-base', decl1);
            registry.addVariable('--color-primary', decl2);

            const doc = createMockDocument('color: var(--color-primary);');
            const results = detector.collectColorData(doc, doc.getText());
            
            assert.strictEqual(results.length, 1);
            assert.strictEqual(results[0].originalText, 'var(--color-primary)');
            assert.ok(results[0].normalizedColor);
        });

        test('should detect CSS variable declaration with hex color', () => {
            const doc = createMockDocument(':root { --primary: #ff0000; }');
            const results = detector.collectColorData(doc, doc.getText());

            const declaration = results.find(r => r.isCssVariableDeclaration);
            assert.ok(declaration, 'Expected to detect declaration');
            assert.strictEqual(declaration?.variableName, '--primary');
            assert.strictEqual(declaration?.originalText, '--primary');
            // literal hex should still be detected separately
            assert.ok(results.some(r => r.originalText === '#ff0000'));
        });

        test('should detect CSS variable declaration with Tailwind HSL', () => {
            const doc = createMockDocument(':root { --accent: 210 40% 96.1%; }');
            const results = detector.collectColorData(doc, doc.getText());

            const declaration = results.find(r => r.isCssVariableDeclaration);
            assert.ok(declaration, 'Expected declaration detection');
            assert.strictEqual(declaration?.variableName, '--accent');
            assert.ok(declaration?.normalizedColor.startsWith('rgb'));
        });

        test('should ignore non-color CSS variable declarations', () => {
            const doc = createMockDocument(':root { --radius: 0.65rem; }');
            const results = detector.collectColorData(doc, doc.getText());

            assert.strictEqual(results.length, 0);
        });

        test('should detect Sass-style CSS variable declaration without semicolon', () => {
            const doc = createMockDocument(`:root\n  --primary: 210 40% 96.1%`);
            const results = detector.collectColorData(doc, doc.getText());

            const declaration = results.find(r => r.isCssVariableDeclaration);
            assert.ok(declaration, 'Expected declaration detection for Sass syntax');
            assert.strictEqual(declaration?.variableName, '--primary');
        });
    });

    suite('Tailwind Classes', () => {
        test('should detect bg-primary Tailwind class', () => {
            const context: CSSVariableContext = { type: 'root', specificity: 0 };
            const decl: CSSVariableDeclaration = {
                name: '--primary',
                value: '#ff0000',
                uri: vscode.Uri.parse('file:///test.css'),
                line: 0,
                selector: ':root',
                context
            };
            registry.addVariable('--primary', decl);

            const doc = createMockDocument('<div class="bg-primary">');
            const results = detector.collectColorData(doc, doc.getText());
            
            assert.strictEqual(results.length, 1);
            assert.strictEqual(results[0].originalText, 'bg-primary');
            assert.strictEqual(results[0].isTailwindClass, true);
            assert.strictEqual(results[0].tailwindClass, 'bg-primary');
        });

        test('should detect text-accent Tailwind class', () => {
            const context: CSSVariableContext = { type: 'root', specificity: 0 };
            const decl: CSSVariableDeclaration = {
                name: '--accent',
                value: '#00ff00',
                uri: vscode.Uri.parse('file:///test.css'),
                line: 0,
                selector: ':root',
                context
            };
            registry.addVariable('--accent', decl);

            const doc = createMockDocument('<p class="text-accent">');
            const results = detector.collectColorData(doc, doc.getText());
            
            assert.strictEqual(results.length, 1);
            assert.strictEqual(results[0].originalText, 'text-accent');
        });

        test('should not detect Tailwind class without CSS variable', () => {
            const doc = createMockDocument('<div class="bg-unknown">');
            const results = detector.collectColorData(doc, doc.getText());
            
            assert.strictEqual(results.length, 0);
        });
    });

    suite('CSS Class Colors', () => {
        test('should detect CSS class with color property', () => {
            registry.addClass('plums', {
                className: 'plums',
                property: 'color',
                value: '#ff0000',
                uri: vscode.Uri.parse('file:///test.css'),
                line: 0,
                selector: '.plums'
            });

            const doc = createMockDocument('<div class="plums">');
            const results = detector.collectColorData(doc, doc.getText());
            
            assert.strictEqual(results.length, 1);
            assert.strictEqual(results[0].originalText, 'plums');
            assert.strictEqual(results[0].isCssClass, true);
            assert.strictEqual(results[0].cssClassName, 'plums');
        });

        test('should detect multiple CSS classes', () => {
            registry.addClass('red-text', {
                className: 'red-text',
                property: 'color',
                value: '#ff0000',
                uri: vscode.Uri.parse('file:///test.css'),
                line: 0,
                selector: '.red-text'
            });
            registry.addClass('blue-bg', {
                className: 'blue-bg',
                property: 'background',
                value: '#0000ff',
                uri: vscode.Uri.parse('file:///test.css'),
                line: 1,
                selector: '.blue-bg'
            });

            const doc = createMockDocument('<div class="red-text blue-bg">');
            const results = detector.collectColorData(doc, doc.getText());
            
            assert.strictEqual(results.length, 2);
        });

        test('should not detect undefined CSS class', () => {
            const doc = createMockDocument('<div class="unknown">');
            const results = detector.collectColorData(doc, doc.getText());
            
            assert.strictEqual(results.length, 0);
        });
    });

    suite('Deduplication', () => {
        test('should not duplicate same color at same position', () => {
            const doc = createMockDocument('color: #ff0000;');
            const results = detector.collectColorData(doc, doc.getText());
            
            assert.strictEqual(results.length, 1);
        });

        test('should detect same color at different positions', () => {
            const doc = createMockDocument('color: #ff0000; background: #ff0000;');
            const results = detector.collectColorData(doc, doc.getText());
            
            assert.strictEqual(results.length, 2);
            assert.strictEqual(results[0].originalText, '#ff0000');
            assert.strictEqual(results[1].originalText, '#ff0000');
            assert.notStrictEqual(results[0].range.start.character, results[1].range.start.character);
        });
    });

    suite('Mixed Content', () => {
        test('should detect multiple color formats in one document', () => {
            const context: CSSVariableContext = { type: 'root', specificity: 0 };
            registry.addVariable('--primary', {
                name: '--primary',
                value: '#ff0000',
                uri: vscode.Uri.parse('file:///test.css'),
                line: 0,
                selector: ':root',
                context
            });

            const doc = createMockDocument(`
                color: #ff0000;
                background: rgb(0, 255, 0);
                border: hsl(240, 100%, 50%);
                text-color: var(--primary);
            `);
            const results = detector.collectColorData(doc, doc.getText());
            
            assert.ok(results.length >= 4);
        });

        test('should handle document with no colors', () => {
            const doc = createMockDocument('const x = 123; const y = "hello";');
            const results = detector.collectColorData(doc, doc.getText());
            
            assert.strictEqual(results.length, 0);
        });
    });

    suite('Edge Cases', () => {
        test('should handle empty document', () => {
            const doc = createMockDocument('');
            const results = detector.collectColorData(doc, doc.getText());
            
            assert.strictEqual(results.length, 0);
        });

        test('should handle malformed colors', () => {
            const doc = createMockDocument('color: #gggggg; background: rgb(abc, def, ghi);');
            const results = detector.collectColorData(doc, doc.getText());
            
            // Parser should reject invalid colors
            assert.strictEqual(results.length, 0);
        });

        test('should detect colors in comments', () => {
            const doc = createMockDocument('// color: #ff0000');
            const results = detector.collectColorData(doc, doc.getText());
            
            // Detector doesn't parse comments, so it will detect the color
            assert.strictEqual(results.length, 1);
        });
    });
});
