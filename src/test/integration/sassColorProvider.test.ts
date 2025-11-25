import * as assert from 'assert';
import * as path from 'path';
import * as vscode from 'vscode';
import { createControllerHarness } from '../helpers/controllerHarness';

const PROJECT_ROOT = path.resolve(__dirname, '..', '..', '..');
const FIXTURE_ROOT = vscode.Uri.file(path.join(PROJECT_ROOT, 'src', 'test', 'integration', 'fixtures'));

async function executeDocumentColorProvider(document: vscode.TextDocument): Promise<vscode.ColorInformation[]> {
	const colors = await vscode.commands.executeCommand<vscode.ColorInformation[]>(
		'vscode.executeDocumentColorProvider',
		document.uri
	);
	return colors ?? [];
}

async function refreshLanguageProviders(controller: unknown): Promise<void> {
	const instance = controller as { stateManager: { clearLanguageCache(): void }; registerLanguageProviders(): void };
	instance.stateManager.clearLanguageCache();
	instance.registerLanguageProviders();
}

suite('Preprocessor Document Colors', () => {
	let controller: unknown;
	let restore: () => void;

	suiteSetup(async () => {
		const harness = await createControllerHarness();
		controller = harness.controller;
		restore = harness.restore;
	});

	suiteTeardown(() => {
		restore();
	});

	test('provides hsl colors for Sass files', async () => {
		const uri = vscode.Uri.joinPath(FIXTURE_ROOT, 'sass', 'hsl-colors.sass');
		const document = await vscode.workspace.openTextDocument(uri);
		const colors = await executeDocumentColorProvider(document);
		assert.ok(colors.length > 0, 'Expected at least one color information entry');
		const colorTexts = colors.map(info => document.getText(info.range));
		const hslDetected = colorTexts.some(text => text.startsWith('hsl('));
		const hslaDetected = colorTexts.some(text => text.startsWith('hsla('));
		const rgbEntries = colorTexts.filter(text => text.startsWith('rgb('));
		assert.ok(hslDetected, 'Expected hsl color to be detected in Sass file');
		assert.ok(hslaDetected, 'Expected hsla color to be detected in Sass file');
		assert.ok(rgbEntries.length <= 1, 'Expected at most one rgb color entry in Sass file');
	}).timeout(10000);

	test('provides hsl colors for custom Sass language ids', async () => {
		const config = vscode.workspace.getConfiguration('colorbuddy');
		const originalLanguages = config.get<string[]>('languages');
		await config.update('languages', ['ruby'], vscode.ConfigurationTarget.Global);
		await refreshLanguageProviders(controller);

		try {
			const baseDocument = await vscode.workspace.openTextDocument(vscode.Uri.joinPath(FIXTURE_ROOT, 'sass', 'hsl-colors.sass'));
			const document = await vscode.languages.setTextDocumentLanguage(baseDocument, 'ruby');
			const colors = await executeDocumentColorProvider(document);
			assert.ok(colors.length > 0, 'Expected at least one color information entry for remapped Sass language id');
			const colorTexts = colors.map(info => document.getText(info.range));
			const hslDetected = colorTexts.some(text => text.startsWith('hsl('));
			const hslaDetected = colorTexts.some(text => text.startsWith('hsla('));
			assert.ok(hslDetected, 'Expected hsl color to be detected with remapped Sass language id');
			assert.ok(hslaDetected, 'Expected hsla color to be detected with remapped Sass language id');
		} finally {
			await config.update('languages', originalLanguages, vscode.ConfigurationTarget.Global);
			await refreshLanguageProviders(controller);
		}
	}).timeout(10000);

	test('provides colors for SCSS files remapped to alternate language ids', async () => {
		const config = vscode.workspace.getConfiguration('colorbuddy');
		const originalLanguages = config.get<string[]>('languages');
		await config.update('languages', ['ruby'], vscode.ConfigurationTarget.Global);
		await refreshLanguageProviders(controller);

		try {
			const baseDocument = await vscode.workspace.openTextDocument(vscode.Uri.joinPath(FIXTURE_ROOT, 'scss', 'hsl-colors.scss'));
			const document = await vscode.languages.setTextDocumentLanguage(baseDocument, 'ruby');
			const colors = await executeDocumentColorProvider(document);
			assert.ok(colors.length > 0, 'Expected color information entries for remapped SCSS language id');
			const colorTexts = colors.map(info => document.getText(info.range));
			assert.ok(colorTexts.includes('#1d4ed8'), 'Expected hex color to be detected in remapped SCSS file');
			assert.ok(colorTexts.some(text => text.startsWith('rgb(')), 'Expected rgb color to be detected in remapped SCSS file');
			assert.ok(colorTexts.some(text => text.startsWith('hsl(')), 'Expected hsl color to be detected in remapped SCSS file');
		} finally {
			await config.update('languages', originalLanguages, vscode.ConfigurationTarget.Global);
			await refreshLanguageProviders(controller);
		}
	}).timeout(10000);

	test('retains native color provider behavior for Less files', async () => {
		const uri = vscode.Uri.joinPath(FIXTURE_ROOT, 'less', 'hsl-colors.less');
		const document = await vscode.workspace.openTextDocument(uri);
		const instance = controller as unknown as {
			ensureColorData(target: vscode.TextDocument): Promise<Array<{ format?: string; range: vscode.Range }>>;
			provider: {
				provideDocumentColors(data: Array<{ format?: string; range: vscode.Range }>, options?: { allowedFormats?: Set<string> }): vscode.ColorInformation[];
			};
		};
		const colorData = await instance.ensureColorData(document);
		assert.ok(colorData.length > 0, 'Expected color detector to find entries in Less file');
		const filtered = instance.provider.provideDocumentColors(colorData, { allowedFormats: new Set(['tailwind']) });
		assert.strictEqual(filtered.length, 0, 'Expected extension to defer to native color provider for Less file');
	}).timeout(10000);

	test('provides colors for Less files remapped to alternate language ids', async () => {
		const config = vscode.workspace.getConfiguration('colorbuddy');
		const originalLanguages = config.get<string[]>('languages');
		await config.update('languages', ['markdown'], vscode.ConfigurationTarget.Global);
		await refreshLanguageProviders(controller);

		try {
			const baseDocument = await vscode.workspace.openTextDocument(vscode.Uri.joinPath(FIXTURE_ROOT, 'less', 'hsl-colors.less'));
			const document = await vscode.languages.setTextDocumentLanguage(baseDocument, 'markdown');
			const colors = await executeDocumentColorProvider(document);
			assert.ok(colors.length > 0, 'Expected color information entries for remapped Less language id');
			const colorTexts = colors.map(info => document.getText(info.range));
			assert.ok(colorTexts.includes('hsl(120, 40%, 50%)'), 'Expected hsl color to be detected in remapped Less file');
			assert.ok(colorTexts.includes('hsla(210, 60%, 50%, 0.75)'), 'Expected hsla color to be detected in remapped Less file');
		} finally {
			await config.update('languages', originalLanguages, vscode.ConfigurationTarget.Global);
			await refreshLanguageProviders(controller);
		}
	}).timeout(10000);

	test('provides hsl colors for Stylus files', async () => {
		const uri = vscode.Uri.joinPath(FIXTURE_ROOT, 'stylus', 'hsl-colors.styl');
		const document = await vscode.workspace.openTextDocument(uri);
		const colors = await executeDocumentColorProvider(document);
		assert.ok(colors.length > 0, 'Expected at least one color information entry for Stylus file');
		const colorTexts = colors.map(info => document.getText(info.range));
		assert.ok(colorTexts.some(text => text.startsWith('hsl(')), 'Expected hsl color to be detected in Stylus file');
		assert.ok(colorTexts.some(text => text.startsWith('hsla(')), 'Expected hsla color to be detected in Stylus file');
	}).timeout(10000);

	test('provides hsl colors for PostCSS files', async () => {
		const uri = vscode.Uri.joinPath(FIXTURE_ROOT, 'postcss', 'hsl-colors.pcss');
		const document = await vscode.workspace.openTextDocument(uri);
		const colors = await executeDocumentColorProvider(document);
		assert.ok(colors.length > 0, 'Expected at least one color information entry for PostCSS file');
		const colorTexts = colors.map(info => document.getText(info.range));
		assert.ok(colorTexts.some(text => text.startsWith('hsl(')), 'Expected hsl color to be detected in PostCSS file');
		assert.ok(colorTexts.some(text => text.startsWith('hsla(')), 'Expected hsla color to be detected in PostCSS file');
	}).timeout(10000);

	test('provides colors for PostCSS files remapped to alternate language ids', async () => {
		const config = vscode.workspace.getConfiguration('colorbuddy');
		const originalLanguages = config.get<string[]>('languages');
		await config.update('languages', ['lua'], vscode.ConfigurationTarget.Global);
		await refreshLanguageProviders(controller);

		try {
			const baseDocument = await vscode.workspace.openTextDocument(vscode.Uri.joinPath(FIXTURE_ROOT, 'postcss', 'hsl-colors.pcss'));
			const document = await vscode.languages.setTextDocumentLanguage(baseDocument, 'lua');
			const colors = await executeDocumentColorProvider(document);
			assert.ok(colors.length > 0, 'Expected color information entries for remapped PostCSS language id');
			const colorTexts = colors.map(info => document.getText(info.range));
			assert.ok(colorTexts.some(text => text.startsWith('hsl(')), 'Expected hsl color to be detected in remapped PostCSS file');
			assert.ok(colorTexts.some(text => text.startsWith('hsla(')), 'Expected hsla color to be detected in remapped PostCSS file');
		} finally {
			await config.update('languages', originalLanguages, vscode.ConfigurationTarget.Global);
			await refreshLanguageProviders(controller);
		}
	}).timeout(10000);
});
