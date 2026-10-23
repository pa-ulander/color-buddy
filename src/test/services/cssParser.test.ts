import * as assert from 'assert';
import * as vscode from 'vscode';
import { CSSParser } from '../../services/cssParser';
import { ColorParser } from '../../services/colorParser';
import { Registry } from '../../services/registry';
import { createTextSnapshot } from '../../utils/textSnapshot';

suite('CSSParser', () => {
	const createParser = () => {
		const registry = new Registry();
		const parser = new CSSParser(registry, new ColorParser());
		return { registry, parser };
	};

	suite('findContainingSelector', () => {
		test('returns :root when no opening brace precedes the index', () => {
			const { parser } = createParser();
			assert.strictEqual(parser.findContainingSelector('--a: #fff;', 0), ':root');
			assert.strictEqual(parser.findContainingSelector('--a: #fff;', 3), ':root');
		});

		test('returns the selector on the same line as the brace', () => {
			const { parser } = createParser();
			const text = ':root {\n  --a: #fff;\n}\n.dark   .card {\n  --a: #000;\n}';
			assert.strictEqual(parser.findContainingSelector(text, text.indexOf('--a')), ':root');
			assert.strictEqual(parser.findContainingSelector(text, text.lastIndexOf('--a')), '.dark .card');
		});

		test('walks back over blank and comment lines to find the selector', () => {
			const { parser } = createParser();
			const text = '/* header */\n[data-theme="dark"]\n\n/* comment */\n{\n  --a: #000;\n}';
			assert.strictEqual(parser.findContainingSelector(text, text.indexOf('--a')), '[data-theme="dark"]');
		});

		test('handles brace at the very start of the text', () => {
			const { parser } = createParser();
			const text = '{ --a: #000; }';
			assert.strictEqual(parser.findContainingSelector(text, text.indexOf('--a')), ':root');
		});
	});

	suite('parseCSSFile', () => {
		test('indexes variables and classes from a lightweight text snapshot', async () => {
			const { parser, registry } = createParser();
			const uri = vscode.Uri.file('/workspace/styles/snapshot.css');
			const text = ':root {\n  --brand: #ff0000;\n}\n\n.dark {\n  --brand: #00ff00;\n}\n\n.button {\n  color: var(--brand);\n}\n';
			await parser.parseCSSFile(createTextSnapshot(uri, text));

			const variables = registry.getVariable('--brand');
			assert.ok(variables && variables.length === 2, 'Expected both --brand declarations');
			const lines = variables.map(v => v.line).sort((a, b) => a - b);
			assert.deepStrictEqual(lines, [1, 5]);
			assert.ok(variables.every(v => v.uri.toString() === uri.toString()));

			const classes = registry.getClass('button');
			assert.ok(classes && classes.length === 1, 'Expected .button class color');
			assert.strictEqual(classes[0].line, 8);
		});

		test('parses large stylesheets in roughly linear time', async () => {
			const { parser, registry } = createParser();
			let css = ':root {\n';
			for (let i = 0; i < 3000; i++) {
				css += `  --color-${i}: #${(i * 4099 % 0xffffff).toString(16).padStart(6, '0')};\n`;
			}
			css += '}\n';
			for (let i = 0; i < 15000; i++) {
				css += `.bg-c${i} {\n  background-color: var(--color-${i % 3000});\n}\n`;
			}

			const uri = vscode.Uri.file('/workspace/styles/large.css');
			const start = Date.now();
			await parser.parseCSSFile(createTextSnapshot(uri, css));
			const elapsed = Date.now() - start;

			assert.strictEqual(registry.classCount, 15000);
			// Previously quadratic (tens of seconds); must stay far below that so the shared extension host is not starved.
			assert.ok(elapsed < 5000, `Expected large stylesheet to parse quickly, took ${elapsed}ms`);
		}).timeout(60000);

		test('terminates on variable cycles that do not include the declaration being resolved', async () => {
			const { parser, registry } = createParser();
			const css = ':root {\n  --a: var(--b);\n  --b: var(--c);\n  --c: var(--b);\n  --ok: var(--base);\n  --base: #ff0000;\n}\n.x {\n  color: var(--b);\n}\n';
			await parser.parseCSSFile(createTextSnapshot(vscode.Uri.file('/workspace/styles/cycle.css'), css));

			assert.ok(registry.getVariable('--a'), 'Expected --a to be indexed');
			assert.strictEqual(registry.getVariable('--ok')?.[0].resolvedValue, '#ff0000');
		});
	});

	suite('resolveNestedVariables', () => {
		test('leaves circular references unresolved instead of looping', async () => {
			const { parser } = createParser();
			const css = ':root {\n  --b: var(--c);\n  --c: var(--b);\n}\n';
			await parser.parseCSSFile(createTextSnapshot(vscode.Uri.file('/workspace/styles/cycle2.css'), css));

			const result = parser.resolveNestedVariables('var(--b)');
			assert.ok(result.includes('var(--'), `Expected unresolved reference, got ${result}`);
		});

		test('resolves deep chains and multiple references', async () => {
			const { parser } = createParser();
			const css = ':root {\n  --h: 210;\n  --s: 40%;\n  --l: var(--l2);\n  --l2: 50%;\n}\n';
			await parser.parseCSSFile(createTextSnapshot(vscode.Uri.file('/workspace/styles/chain.css'), css));

			assert.strictEqual(parser.resolveNestedVariables('hsl(var(--h) var(--s) var(--l))'), 'hsl(210 40% 50%)');
		});
	});
});
