import * as assert from 'assert';
import { promises as fs } from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { createControllerHarness } from '../helpers/controllerHarness';
import { DEFAULT_LANGUAGES, type ColorData } from '../../types';
import type { CSSParser } from '../../services/cssParser';

const PROJECT_ROOT = path.resolve(__dirname, '../../..');
const FIXTURE_DIRECTORY = path.join(PROJECT_ROOT, 'src', 'test', 'integration', 'fixtures', 'tailwind');

const FIXTURE_FILES: Record<string, string> = {
	css: 'css.tailwind.css',
	scss: 'scss.tailwind.scss',
	sass: 'sass.tailwind.sass',
	less: 'less.tailwind.less',
	stylus: 'stylus.tailwind.styl',
	postcss: 'postcss.tailwind.pcss',
	html: 'html.tailwind.html',
	xml: 'xml.tailwind.xml',
	svg: 'svg.tailwind.svg',
	javascript: 'javascript.tailwind.js',
	javascriptreact: 'javascriptreact.tailwind.jsx',
	typescript: 'typescript.tailwind.ts',
	typescriptreact: 'typescriptreact.tailwind.tsx',
	vue: 'vue.tailwind.vue',
	svelte: 'svelte.tailwind.svelte',
	astro: 'astro.tailwind.astro',
	json: 'json.tailwind.json',
	jsonc: 'jsonc.tailwind.jsonc',
	yaml: 'yaml.tailwind.yaml',
	toml: 'toml.tailwind.toml',
	markdown: 'markdown.tailwind.md',
	mdx: 'mdx.tailwind.mdx',
	plaintext: 'plaintext.tailwind.txt',
	python: 'python.tailwind.py',
	ruby: 'ruby.tailwind.rb',
	php: 'php.tailwind.php',
	perl: 'perl.tailwind.pl',
	go: 'go.tailwind.go',
	rust: 'rust.tailwind.rs',
	java: 'java.tailwind.java',
	kotlin: 'kotlin.tailwind.kt',
	swift: 'swift.tailwind.swift',
	csharp: 'csharp.tailwind.cs',
	cpp: 'cpp.tailwind.cpp',
	c: 'c.tailwind.c',
	'objective-c': 'objective-c.tailwind.m',
	dart: 'dart.tailwind.dart',
	lua: 'lua.tailwind.lua',
	shellscript: 'shellscript.tailwind.sh',
	powershell: 'powershell.tailwind.ps1',
	sql: 'sql.tailwind.sql',
	graphql: 'graphql.tailwind.graphql'
};

const LANGUAGE_FIXTURES: Record<string, string> = {};
const REGISTRY_FIXTURE_PATH = path.join(PROJECT_ROOT, 'src', 'test', 'integration', 'fixtures', 'css', 'tailwind-registry.css');

async function loadTailwindFixtures(): Promise<void> {
	const missingMappings = DEFAULT_LANGUAGES.filter(language => !FIXTURE_FILES[language]);
	assert.strictEqual(
		missingMappings.length,
		0,
		`missing Tailwind fixture mapping for: ${missingMappings.join(', ')}`
	);

	await Promise.all(
		DEFAULT_LANGUAGES.map(async language => {
			const fileName = FIXTURE_FILES[language];
			const filePath = path.join(FIXTURE_DIRECTORY, fileName);
			try {
				LANGUAGE_FIXTURES[language] = await fs.readFile(filePath, 'utf8');
			} catch (error) {
				throw new Error(`Failed to load Tailwind fixture for ${language} at ${filePath}: ${(error as Error).message}`);
			}
		})
	);

	const extraFixtures = Object.keys(FIXTURE_FILES).filter(language => !DEFAULT_LANGUAGES.includes(language));
	assert.strictEqual(
		extraFixtures.length,
		0,
		`unexpected Tailwind fixtures for non-default languages: ${extraFixtures.join(', ')}`
	);
}

async function seedTailwindRegistry(controller: unknown): Promise<void> {
	const cssParser = (controller as unknown as { cssParser: CSSParser }).cssParser;
	const cssDocument = await vscode.workspace.openTextDocument(vscode.Uri.file(REGISTRY_FIXTURE_PATH));
	await cssParser.parseCSSFile(cssDocument);
}

function getEnsureColorData(controller: unknown): (document: vscode.TextDocument) => Promise<ColorData[]> {
	return (controller as unknown as { ensureColorData(document: vscode.TextDocument): Promise<ColorData[]> }).ensureColorData.bind(controller);
}

function getProvider(controller: unknown): {
	provideDocumentColors(data: ColorData[]): vscode.ColorInformation[];
	provideHover(data: ColorData[], position: vscode.Position): Promise<vscode.Hover | undefined>;
} {
	return (controller as unknown as {
		provider: {
			provideDocumentColors(data: ColorData[]): vscode.ColorInformation[];
			provideHover(data: ColorData[], position: vscode.Position): Promise<vscode.Hover | undefined>;
		};
	}).provider;
}

function assertTailwindHoverIncludes(
	language: string,
	hover: vscode.Hover | undefined,
	expectedVariable: string
): void {
	assert.ok(hover, `expected hover for Tailwind class in ${language}`);
	assert.ok(hover!.contents.length > 0, `expected hover contents for Tailwind class in ${language}`);
	const firstContent = hover!.contents[0];
	const markdown = firstContent instanceof vscode.MarkdownString ? firstContent : new vscode.MarkdownString(String(firstContent));
	const value = markdown.value;
	assert.ok(value.includes('Tailwind Class'), `hover should label Tailwind class for ${language}`);
	assert.ok(value.includes(expectedVariable), `hover should reference ${expectedVariable} for ${language}`);
}

suite('Tailwind class integration', () => {
	let controller: unknown;
	let restore: () => void;
	let ensureColorData: (document: vscode.TextDocument) => Promise<ColorData[]>;
	let provider: ReturnType<typeof getProvider>;

	suiteSetup(async () => {
		const harness = await createControllerHarness();
		controller = harness.controller;
		restore = harness.restore;
		ensureColorData = getEnsureColorData(controller);
		provider = getProvider(controller);

		await loadTailwindFixtures();
		await seedTailwindRegistry(controller);
	});

	suiteTeardown(() => {
		restore();
	});

	test('has fixtures for all default languages', () => {
		const availableLanguages = Object.keys(LANGUAGE_FIXTURES).sort();
		const expectedLanguages = [...DEFAULT_LANGUAGES].sort();
		assert.deepStrictEqual(availableLanguages, expectedLanguages);
	});

	for (const language of DEFAULT_LANGUAGES) {
		test(`resolves Tailwind classes in ${language}`, async function () {
			this.timeout(10000);
			const content = LANGUAGE_FIXTURES[language];
			assert.ok(content, `missing Tailwind fixture content for ${language}`);

			const document = await vscode.workspace.openTextDocument({ language, content });
			const colorData = await ensureColorData(document);
			const tailwindEntries = colorData.filter(entry => entry.isTailwindClass);
			assert.ok(tailwindEntries.length >= 2, `expected Tailwind class data in ${language}`);

			const tailwindClassNames = tailwindEntries
				.map(entry => entry.tailwindClass)
				.filter((className): className is string => typeof className === 'string');
			assert.ok(tailwindClassNames.includes('bg-primary'), `expected bg-primary class in ${language}`);
			assert.ok(tailwindClassNames.includes('text-accent'), `expected text-accent class in ${language}`);
			assert.ok(tailwindClassNames.includes('from-primary'), `expected from-primary class in ${language}`);
			assert.ok(tailwindClassNames.includes('via-accent'), `expected via-accent class in ${language}`);
			assert.ok(tailwindClassNames.includes('to-accent'), `expected to-accent class in ${language}`);

			const primaryEntry = tailwindEntries.find(entry => entry.variableName === '--primary');
			assert.ok(primaryEntry, `expected Tailwind --primary mapping in ${language}`);

			const accentEntry = tailwindEntries.find(entry => entry.variableName === '--accent');
			assert.ok(accentEntry, `expected Tailwind --accent mapping in ${language}`);

			const fromEntry = tailwindEntries.find(entry => entry.tailwindClass === 'from-primary');
			assert.ok(fromEntry, `expected from-primary entry in ${language}`);
			assert.strictEqual(fromEntry!.variableName, '--primary', `from-primary should resolve to --primary in ${language}`);

			const viaEntry = tailwindEntries.find(entry => entry.tailwindClass === 'via-accent');
			assert.ok(viaEntry, `expected via-accent entry in ${language}`);
			assert.strictEqual(viaEntry!.variableName, '--accent', `via-accent should resolve to --accent in ${language}`);

			const toEntry = tailwindEntries.find(entry => entry.tailwindClass === 'to-accent');
			assert.ok(toEntry, `expected to-accent entry in ${language}`);
			assert.strictEqual(toEntry!.variableName, '--accent', `to-accent should resolve to --accent in ${language}`);

			const colorInfos = provider.provideDocumentColors(colorData);
			assert.strictEqual(colorInfos.length, 0, 'Tailwind classes should not appear in document colors');

			assertTailwindHoverIncludes(language, await provider.provideHover(colorData, primaryEntry!.range.start), '--primary');
			assertTailwindHoverIncludes(language, await provider.provideHover(colorData, accentEntry!.range.start), '--accent');
			assertTailwindHoverIncludes(language, await provider.provideHover(colorData, fromEntry!.range.start), '--primary');
			assertTailwindHoverIncludes(language, await provider.provideHover(colorData, viaEntry!.range.start), '--accent');
			assertTailwindHoverIncludes(language, await provider.provideHover(colorData, toEntry!.range.start), '--accent');
		});
	}
});
