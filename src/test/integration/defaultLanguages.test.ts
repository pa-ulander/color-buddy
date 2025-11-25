import * as assert from 'assert';
import { promises as fs } from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { createControllerHarness } from '../helpers/controllerHarness';
import { DEFAULT_LANGUAGES, type ColorData, type ColorFormat } from '../../types';

type LanguageFixture = {
	content: string;
	match: string;
};

const HEX = '#123456';

const PROJECT_ROOT = path.resolve(__dirname, '../../..');
const FIXTURE_DIRECTORY = path.join(PROJECT_ROOT, 'src', 'test', 'integration', 'fixtures', 'languages');

const FIXTURE_FILES: Record<string, { file: string; match: string }> = {
	css: { file: 'css.fixture.css', match: HEX },
	scss: { file: 'scss.fixture.scss', match: HEX },
	sass: { file: 'sass.fixture.sass', match: HEX },
	less: { file: 'less.fixture.less', match: HEX },
	stylus: { file: 'stylus.fixture.styl', match: HEX },
	postcss: { file: 'postcss.fixture.pcss', match: HEX },
	html: { file: 'html.fixture.html', match: HEX },
	xml: { file: 'xml.fixture.xml', match: HEX },
	svg: { file: 'svg.fixture.svg', match: HEX },
	javascript: { file: 'javascript.fixture.js', match: HEX },
	javascriptreact: { file: 'javascriptreact.fixture.jsx', match: HEX },
	typescript: { file: 'typescript.fixture.ts', match: HEX },
	typescriptreact: { file: 'typescriptreact.fixture.tsx', match: HEX },
	vue: { file: 'vue.fixture.vue', match: HEX },
	svelte: { file: 'svelte.fixture.svelte', match: HEX },
	astro: { file: 'astro.fixture.astro', match: HEX },
	json: { file: 'json.fixture.json', match: HEX },
	jsonc: { file: 'jsonc.fixture.jsonc', match: HEX },
	yaml: { file: 'yaml.fixture.yaml', match: HEX },
	toml: { file: 'toml.fixture.toml', match: HEX },
	markdown: { file: 'markdown.fixture.md', match: HEX },
	mdx: { file: 'mdx.fixture.mdx', match: HEX },
	plaintext: { file: 'plaintext.fixture.txt', match: HEX },
	python: { file: 'python.fixture.py', match: HEX },
	ruby: { file: 'ruby.fixture.rb', match: HEX },
	php: { file: 'php.fixture.php', match: HEX },
	perl: { file: 'perl.fixture.pl', match: HEX },
	go: { file: 'go.fixture.go', match: HEX },
	rust: { file: 'rust.fixture.rs', match: HEX },
	java: { file: 'java.fixture.java', match: HEX },
	kotlin: { file: 'kotlin.fixture.kt', match: HEX },
	swift: { file: 'swift.fixture.swift', match: HEX },
	csharp: { file: 'csharp.fixture.cs', match: HEX },
	cpp: { file: 'cpp.fixture.cpp', match: HEX },
	c: { file: 'c.fixture.c', match: HEX },
	'objective-c': { file: 'objective-c.fixture.m', match: HEX },
	dart: { file: 'dart.fixture.dart', match: HEX },
	lua: { file: 'lua.fixture.lua', match: HEX },
	shellscript: { file: 'shellscript.fixture.sh', match: HEX },
	powershell: { file: 'powershell.fixture.ps1', match: HEX },
	sql: { file: 'sql.fixture.sql', match: HEX },
	graphql: { file: 'graphql.fixture.graphql', match: HEX }
};

const LANGUAGE_FIXTURES: Record<string, LanguageFixture> = {};

const NATIVE_COLOR_PROVIDER_LANGUAGES = new Set(['css', 'scss', 'less']);

function getControllerEnsureColorData(controller: unknown): (document: vscode.TextDocument) => Promise<ColorData[]> {
	return (controller as unknown as { ensureColorData(document: vscode.TextDocument): Promise<ColorData[]> }).ensureColorData.bind(controller);
}

function getControllerProvider(controller: unknown) {
	return (controller as unknown as {
		provider: {
			provideDocumentColors(data: ColorData[], options?: { allowedFormats?: Set<string> }): vscode.ColorInformation[];
			provideHover(data: ColorData[], position: vscode.Position): Promise<vscode.Hover | undefined>;
		};
	}).provider;
}

suite('Default language integration coverage', () => {
	let controller: unknown;
	let restore: () => void;

	suiteSetup(async () => {
		await Promise.all(
			Object.entries(FIXTURE_FILES).map(async ([language, { file, match }]) => {
				const fixturePath = path.join(FIXTURE_DIRECTORY, file);
				const content = await fs.readFile(fixturePath, 'utf8');
				LANGUAGE_FIXTURES[language] = { content, match };
			})
		);

		const harness = await createControllerHarness();
		controller = harness.controller;
		restore = harness.restore;
	});

	suiteTeardown(() => {
		restore();
	});

	test('fixture coverage matches DEFAULT_LANGUAGES', () => {
		const missing = DEFAULT_LANGUAGES.filter(language => !(language in FIXTURE_FILES));
		assert.deepStrictEqual(missing, [], `Missing fixtures for languages: ${missing.join(', ')}`);

		const extra = Object.keys(FIXTURE_FILES).filter(language => !DEFAULT_LANGUAGES.includes(language));
		assert.deepStrictEqual(extra, [], `Fixtures exist for non-default languages: ${extra.join(', ')}`);
	});

	DEFAULT_LANGUAGES.forEach(language => {
		test(`renders color data for ${language}`, async function () {
			this.timeout(15000);
			const fixture = LANGUAGE_FIXTURES[language];
			assert.ok(fixture, `missing fixture for ${language}`);
			const document = await vscode.workspace.openTextDocument({ language, content: fixture.content });
			const ensureColorData = getControllerEnsureColorData(controller);
			const colorData = await ensureColorData(document);
			assert.ok(colorData.length > 0, `expected color data for ${language}`);

			const matchIndex = document.getText().indexOf(fixture.match);
			assert.ok(matchIndex >= 0, `expected to find match '${fixture.match}' in ${language} fixture`);
			const matchRange = new vscode.Range(document.positionAt(matchIndex), document.positionAt(matchIndex + fixture.match.length));
			const entry = colorData.find(data => data.range.isEqual(matchRange));
			assert.ok(entry, `expected color entry for ${fixture.match} in ${language}`);

			const provider = getControllerProvider(controller);

			let allowedFormats: Set<ColorFormat> | undefined;
			if (NATIVE_COLOR_PROVIDER_LANGUAGES.has(language)) {
				allowedFormats = new Set<ColorFormat>(['tailwind']);
			} else if (language === 'sass') {
				allowedFormats = new Set<ColorFormat>(['tailwind', 'hsl', 'hsla']);
			}

			const colorInfos = provider.provideDocumentColors(colorData, allowedFormats ? { allowedFormats } : undefined);

			if (!allowedFormats) {
				assert.ok(colorInfos.some(info => document.getText(info.range) === fixture.match), `expected document colors for ${language}`);
			} else {
				assert.strictEqual(colorInfos.length, 0, `expected no custom color provider output for ${language}`);
			}

			const hover = await provider.provideHover(colorData, matchRange.start);
			assert.ok(hover, `expected hover for ${language}`);
			const markdown = hover!.contents[0] as vscode.MarkdownString;
			const value = markdown.value;
			assert.ok(value.includes('![color swatch]'), `hover should include swatch for ${language}`);
			assert.ok(value.includes('Color Preview'), `hover should include heading for ${language}`);
		});
	});
});
