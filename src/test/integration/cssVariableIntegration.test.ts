import * as assert from 'assert';
import { promises as fs } from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { createControllerHarness } from '../helpers/controllerHarness';
import { DEFAULT_LANGUAGES, type ColorData, type ColorFormat } from '../../types';
import type { CSSParser } from '../../services/cssParser';

const PROJECT_ROOT = path.resolve(__dirname, '../../..');
const FIXTURE_DIRECTORY = path.join(PROJECT_ROOT, 'src', 'test', 'integration', 'fixtures', 'css-variables');

const FIXTURE_FILES: Record<string, { file: string; variable: string }> = {
	css: { file: 'css.cssvar.css', variable: '--primary-color' },
	scss: { file: 'scss.cssvar.scss', variable: '--primary-color' },
	sass: { file: 'sass.cssvar.sass', variable: '--primary-color' },
	less: { file: 'less.cssvar.less', variable: '--primary-color' },
	stylus: { file: 'stylus.cssvar.styl', variable: '--primary-color' },
	postcss: { file: 'postcss.cssvar.pcss', variable: '--primary-color' },
	html: { file: 'html.cssvar.html', variable: '--primary-color' },
	xml: { file: 'xml.cssvar.xml', variable: '--primary-color' },
	svg: { file: 'svg.cssvar.svg', variable: '--primary-color' },
	javascript: { file: 'javascript.cssvar.js', variable: '--primary-color' },
	javascriptreact: { file: 'javascriptreact.cssvar.jsx', variable: '--primary-color' },
	typescript: { file: 'typescript.cssvar.ts', variable: '--primary-color' },
	typescriptreact: { file: 'typescriptreact.cssvar.tsx', variable: '--primary-color' },
	vue: { file: 'vue.cssvar.vue', variable: '--primary-color' },
	svelte: { file: 'svelte.cssvar.svelte', variable: '--primary-color' },
	astro: { file: 'astro.cssvar.astro', variable: '--primary-color' },
	json: { file: 'json.cssvar.json', variable: '--primary-color' },
	jsonc: { file: 'jsonc.cssvar.jsonc', variable: '--primary-color' },
	yaml: { file: 'yaml.cssvar.yaml', variable: '--primary-color' },
	toml: { file: 'toml.cssvar.toml', variable: '--primary-color' },
	markdown: { file: 'markdown.cssvar.md', variable: '--primary-color' },
	mdx: { file: 'mdx.cssvar.mdx', variable: '--primary-color' },
	plaintext: { file: 'plaintext.cssvar.txt', variable: '--primary-color' },
	python: { file: 'python.cssvar.py', variable: '--primary-color' },
	ruby: { file: 'ruby.cssvar.rb', variable: '--primary-color' },
	php: { file: 'php.cssvar.php', variable: '--primary-color' },
	perl: { file: 'perl.cssvar.pl', variable: '--primary-color' },
	go: { file: 'go.cssvar.go', variable: '--primary-color' },
	rust: { file: 'rust.cssvar.rs', variable: '--primary-color' },
	java: { file: 'java.cssvar.java', variable: '--primary-color' },
	kotlin: { file: 'kotlin.cssvar.kt', variable: '--primary-color' },
	swift: { file: 'swift.cssvar.swift', variable: '--primary-color' },
	csharp: { file: 'csharp.cssvar.cs', variable: '--primary-color' },
	cpp: { file: 'cpp.cssvar.cpp', variable: '--primary-color' },
	c: { file: 'c.cssvar.c', variable: '--primary-color' },
	'objective-c': { file: 'objective-c.cssvar.m', variable: '--primary-color' },
	dart: { file: 'dart.cssvar.dart', variable: '--primary-color' },
	lua: { file: 'lua.cssvar.lua', variable: '--primary-color' },
	shellscript: { file: 'shellscript.cssvar.sh', variable: '--primary-color' },
	powershell: { file: 'powershell.cssvar.ps1', variable: '--primary-color' },
	sql: { file: 'sql.cssvar.sql', variable: '--primary-color' },
	graphql: { file: 'graphql.cssvar.graphql', variable: '--primary-color' }
};

const LANGUAGE_FIXTURES: Record<string, { content: string; variable: string }> = {};

const NATIVE_COLOR_PROVIDER_LANGUAGES = new Set(['css', 'scss', 'less']);

function getEnsureColorData(controller: unknown) {
	return (controller as unknown as { ensureColorData(document: vscode.TextDocument): Promise<ColorData[]> }).ensureColorData.bind(controller);
}

function getProvider(controller: unknown) {
	return (controller as unknown as {
		provider: {
			provideDocumentColors(data: ColorData[], options?: { allowedFormats?: Set<ColorFormat> }): vscode.ColorInformation[];
			provideHover(data: ColorData[], position: vscode.Position): Promise<vscode.Hover | undefined>;
		};
	}).provider;
}

suite('CSS variable integration', () => {
	let controller: unknown;
	let restore: () => void;

	suiteSetup(async () => {
		await Promise.all(
			Object.entries(FIXTURE_FILES).map(async ([language, { file, variable }]) => {
				const fixturePath = path.join(FIXTURE_DIRECTORY, file);
				const content = await fs.readFile(fixturePath, 'utf8');
				LANGUAGE_FIXTURES[language] = { content, variable };
			})
		);

		const harness = await createControllerHarness();
		controller = harness.controller;
		restore = harness.restore;

		const cssUri = vscode.Uri.file(path.join(PROJECT_ROOT, 'src', 'test', 'integration', 'fixtures', 'css', 'registry.css'));
		const cssDocument = await vscode.workspace.openTextDocument(cssUri);
		const cssParser = (controller as unknown as { cssParser: CSSParser }).cssParser;
		await cssParser.parseCSSFile(cssDocument);
	});

	suiteTeardown(() => {
		restore();
	});

	test('fixture coverage matches DEFAULT_LANGUAGES', () => {
		const missing = DEFAULT_LANGUAGES.filter(language => !(language in FIXTURE_FILES));
		assert.deepStrictEqual(missing, [], `Missing CSS variable fixtures for languages: ${missing.join(', ')}`);

		const extra = Object.keys(FIXTURE_FILES).filter(language => !DEFAULT_LANGUAGES.includes(language));
		assert.deepStrictEqual(extra, [], `Unexpected CSS variable fixtures for non-default languages: ${extra.join(', ')}`);
	});

	DEFAULT_LANGUAGES.forEach(language => {
		test(`resolves CSS variables in ${language}`, async function () {
			this.timeout(10000);
			const fixture = LANGUAGE_FIXTURES[language];
			assert.ok(fixture, `missing CSS variable fixture for ${language}`);

			const document = await vscode.workspace.openTextDocument({ language, content: fixture.content });
			const ensureColorData = getEnsureColorData(controller);
			const colorData = await ensureColorData(document);
			const variableEntry = colorData.find(entry => entry.isCssVariable && entry.variableName === fixture.variable);
			assert.ok(variableEntry, `expected CSS variable data in ${language}`);

			const provider = getProvider(controller);

			let allowedFormats: Set<ColorFormat> | undefined;
			if (NATIVE_COLOR_PROVIDER_LANGUAGES.has(language)) {
				allowedFormats = new Set<ColorFormat>(['tailwind']);
			} else if (language === 'sass') {
				allowedFormats = new Set<ColorFormat>(['tailwind', 'hsl', 'hsla']);
			}

			const colorInfos = provider.provideDocumentColors(colorData, allowedFormats ? { allowedFormats } : undefined);
			assert.strictEqual(colorInfos.length, 0, 'CSS variables should not surface document colors');

			const hover = await provider.provideHover(colorData, variableEntry.range.start);
			assert.ok(hover, `expected hover for CSS variable in ${language}`);
			const markdown = hover!.contents[0] as vscode.MarkdownString;
			const value = markdown.value;
			assert.ok(value.includes('CSS Variable'), 'hover should label CSS variable');
			assert.ok(value.includes(fixture.variable), 'hover should mention variable name');
			assert.ok(value.includes('Default Theme'), 'hover should include default theme value');
		});
	});
});
