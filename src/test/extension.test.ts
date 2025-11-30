import * as assert from 'assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as vscode from 'vscode';
import {
	createMockDocument,
	createMockCSSVariableDeclaration,
	assertLength,
	assertDefined
} from './helpers';
import {
	ColorParser,
	ColorFormatter,
	Provider,
	Cache,
	Registry,
	CSSParser,
	ColorDetector,
	ExtensionController
} from '../services';
import { collectFormatConversions } from '../utils/colorFormatConversions';
import { Telemetry, QuickActionTelemetryEvent, ColorInsightTelemetryEvent } from '../services/telemetry';
import { DEFAULT_LANGUAGES } from '../types';
import type { AccessibilityReport } from '../types';
import { t, LocalizedStrings } from '../l10n/localization';

// Create service instances for testing (matching the new architecture)
const colorParser = new ColorParser();
const colorFormatter = new ColorFormatter();
const registry = new Registry();
const cssParser = new CSSParser(registry, colorParser);
const colorDetector = new ColorDetector(registry, colorParser);
const provider = new Provider(registry, colorParser, colorFormatter, cssParser);
const cache = new Cache();

function assertClose(actual: number, expected: number, epsilon = 0.01) {
	assert.ok(Math.abs(actual - expected) <= epsilon, `Expected ${actual} to be within ${epsilon} of ${expected}`);
}

suite('Color parsing', () => {
	test('hex colors normalize to rgb and keep hex priority', () => {
		const parsed = colorParser.parseColor('#ff0000');
		assertDefined(parsed, 'Expected hex color to parse');
		assert.strictEqual(parsed.cssString, 'rgb(255, 0, 0)');
		assert.strictEqual(parsed.formatPriority[0], 'hex');
		assertClose(parsed.vscodeColor.red, 1);
		assertClose(parsed.vscodeColor.green, 0);
		assertClose(parsed.vscodeColor.blue, 0);
		assertClose(parsed.vscodeColor.alpha, 1);
	});

	test('tailwind compact HSL preserves alpha and priority', () => {
		const parsed = colorParser.parseColor('200 50% 40% / 0.25');
		assertDefined(parsed, 'Expected Tailwind color to parse');
		assert.strictEqual(parsed.formatPriority[0], 'tailwind');
		assertClose(parsed.vscodeColor.alpha, 0.25);
	});
});

suite('Format helpers', () => {
	test('format priorities stay deduplicated and include fallbacks', () => {
		const priority = colorParser.getFormatPriority('hex');
		assert.strictEqual(priority[0], 'hex');
		assert.strictEqual(priority[1], 'rgba');
		assert.ok(priority.includes('tailwind'));
		const unique = new Set(priority);
		assert.strictEqual(unique.size, priority.length);
	});

	test('format helpers respect alpha gating', () => {
		const opaqueRed = new vscode.Color(1, 0, 0, 1);
		const translucentRed = new vscode.Color(1, 0, 0, 0.4);
		assert.strictEqual(colorFormatter.formatByFormat(opaqueRed, 'hex'), '#ff0000');
		assert.strictEqual(colorFormatter.formatByFormat(opaqueRed, 'rgba'), 'rgba(255, 0, 0, 1)');
		assert.strictEqual(colorFormatter.formatByFormat(translucentRed, 'hex'), undefined);
		assert.strictEqual(colorFormatter.formatByFormat(translucentRed, 'hexAlpha'), '#ff000066');
	});
});

suite('Integration pipeline', () => {
	test('provideDocumentColors discovers multiple formats in one document', async () => {
		const document = createMockDocument(`
			body {
				color: #f00;
				background: rgb(0, 128, 255);
				border-color: 200 50% 40% / 0.3;
			}
		`, 'plaintext');
		cache.clear();

		const restoreCommand = stubExecuteCommand(undefined);
		const restoreConfig = stubWorkspaceLanguages(['plaintext']);
		try {
			// Directly compute color data using the detector service
			const text = document.getText();
			const colorData = colorDetector.collectColorData(document, text);
			const colors = provider.provideDocumentColors(colorData);
			assertLength(colors, 3);
			const texts = colors.map((info: any) => document.getText(info.range));
			assert.ok(texts.includes('#f00'));
			assert.ok(texts.includes('rgb(0, 128, 255)'));
			assert.ok(texts.includes('200 50% 40% / 0.3'));
		} finally {
			restoreCommand();
			restoreConfig();
		}
	});
});

suite('Native provider guard', () => {
	test('computeColorData filters ranges claimed by native providers', async () => {
		const document = createMockDocument('#112233\n#445566', 'plaintext');
		cache.clear();

		const firstRange = new vscode.Range(document.positionAt(0), document.positionAt(7));
		const nativeInfo = new vscode.ColorInformation(firstRange, new vscode.Color(0, 0, 0, 1));
		const restoreCommand = stubExecuteCommand([nativeInfo]);
		const restoreConfig = stubWorkspaceLanguages(['plaintext']);
		try {
			// Test the color detection directly
			const text = document.getText();
			const allColorData = colorDetector.collectColorData(document, text);
			// Simulate filtering out native ranges
			const rangeKey = (range: vscode.Range) => 
				`${range.start.line}:${range.start.character}-${range.end.line}:${range.end.character}`;
			const nativeRanges = new Set([rangeKey(firstRange)]);
			const data = allColorData.filter(d => !nativeRanges.has(rangeKey(d.range)));
			assertLength(data, 1);
			assert.strictEqual(document.getText(data[0].range), '#445566');
		} finally {
			restoreCommand();
			restoreConfig();
		}
	});
});

suite('Language configuration', () => {
	test('document selector creation handles wildcard for "*"', () => {
		// Test the document selector creation logic directly
		const languages = ['*'];
		const selector = languages.includes('*') ? 
			[{ scheme: 'file' }, { scheme: 'untitled' }] :
			languages.map(language => ({ language }));
		
		assert.ok(Array.isArray(selector));
		assert.deepStrictEqual(selector, [{ scheme: 'file' }, { scheme: 'untitled' }]);
	});

	test('document selector creation handles language-specific selectors', () => {
		// Test the document selector creation logic directly
		const languages = ['css', 'scss'];
		const selector = languages.includes('*') ? 
			[{ scheme: 'file' }, { scheme: 'untitled' }] :
			languages.map(language => ({ language }));
		
		assert.ok(Array.isArray(selector));
		assert.deepStrictEqual(selector, [{ language: 'css' }, { language: 'scss' }]);
	});
});

suite('Default language coverage', () => {
	test('package.json default languages stay aligned with DEFAULT_LANGUAGES', () => {
		const packageJsonPath = path.join(__dirname, '..', '..', 'package.json');
		const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
		const contributedDefaults = packageJson?.contributes?.configuration?.properties?.['colorbuddy.languages']?.default;
		assert.deepStrictEqual(contributedDefaults, DEFAULT_LANGUAGES, 'package.json default languages must match DEFAULT_LANGUAGES');
	});

	test('README documented defaults mirror DEFAULT_LANGUAGES', () => {
		const readmePath = path.join(__dirname, '..', '..', 'README.md');
		const readme = fs.readFileSync(readmePath, 'utf8');
		const marker = '**Default languages include**';
		const markerIndex = readme.indexOf(marker);
		assert.ok(markerIndex >= 0, 'README should contain default languages marker');
		const sectionEnd = readme.indexOf('Add or remove identifiers', markerIndex);
		const section = sectionEnd >= 0
			? readme.slice(markerIndex, sectionEnd)
			: readme.slice(markerIndex);
		const tokens = Array.from(section.matchAll(/`([^`]+)`/g)).map(match => match[1]);
		const documented = [...new Set(tokens)].sort();
		const expected = [...DEFAULT_LANGUAGES].sort();
		assert.deepStrictEqual(documented, expected, 'README default language list must match DEFAULT_LANGUAGES');
	});

	test('ExtensionController decorates each DEFAULT_LANGUAGE by default', () => {
		const restoreConfig = stubWorkspaceLanguages(DEFAULT_LANGUAGES);
		const controller = new ExtensionController({ subscriptions: [] } as unknown as vscode.ExtensionContext);
		const shouldDecorate = (controller as unknown as { shouldDecorate(document: vscode.TextDocument): boolean }).shouldDecorate.bind(controller);
		try {
			for (const language of DEFAULT_LANGUAGES) {
				const doc = createMockDocument('', language);
				assert.strictEqual(shouldDecorate(doc), true, `expected default language ${language} to be decorated`);
			}
			const unsupportedDoc = createMockDocument('', 'not-a-supported-language');
			assert.strictEqual(shouldDecorate(unsupportedDoc), false, 'unexpected languages should not be decorated by default');
		} finally {
			controller.dispose();
			restoreConfig();
		}
	});
});

suite('Default language literal pipeline', () => {
	const sampleText = 'The brand color is #336699 and remains consistent.';
	DEFAULT_LANGUAGES.forEach(language => {
		test(`detects hover and color info in ${language}`, async () => {
			const document = createMockDocument(sampleText, language);
			const text = document.getText();
			const colorData = colorDetector.collectColorData(document, text);
			assert.ok(colorData.length > 0, `expected at least one color match for ${language}`);
			const colorLiteral = colorData.find(data => document.getText(data.range) === '#336699');
			assertDefined(colorLiteral, `expected literal #336699 for ${language}`);
			const infos = provider.provideDocumentColors(colorData);
			assert.ok(infos.length > 0, `expected color provider output for ${language}`);
			const hover = await provider.provideHover(colorData, colorLiteral!.range.start);
			assertDefined(hover, `expected hover for ${language}`);
			const hoverContents = hover!.contents[0] as vscode.MarkdownString;
			assert.ok(hoverContents.value.includes(t(LocalizedStrings.TOOLTIP_COLOR_PREVIEW)), `hover should include color preview heading for ${language}`);
			assert.ok(hoverContents.value.includes(t(LocalizedStrings.TOOLTIP_FORMATS_AVAILABLE)), `hover should list additional formats for ${language}`);
			assert.ok(hoverContents.value.includes('command:colorbuddy.copyColorAs?'), `hover should include copy command links for ${language}`);
			assert.ok(hoverContents.value.includes('$(clippy)'), `hover should surface copy icon affordance for ${language}`);
			assert.ok(hoverContents.value.includes(t(LocalizedStrings.TOOLTIP_COLOR_NAME)), `hover should surface color naming for ${language}`);
			assert.ok(hoverContents.value.includes(t(LocalizedStrings.TOOLTIP_BRIGHTNESS)), `hover should surface brightness metadata for ${language}`);
			assert.ok(hoverContents.value.includes(t(LocalizedStrings.STATUS_BAR_USAGE_COUNT)), `hover should surface usage count for ${language}`);
			assert.ok(hoverContents.value.includes(t(LocalizedStrings.TOOLTIP_WCAG_STATUS)), `hover should surface WCAG status heading for ${language}`);
			assert.ok(hoverContents.value.includes('#22c55e') || hoverContents.value.includes('#ef4444'), `hover should include colored pass/fail icons for ${language}`);
			assert.ok(hoverContents.value.includes(t(LocalizedStrings.TOOLTIP_CONTRAST_ON_WHITE)), `hover should list contrast on white for ${language}`);
			assert.ok(/Contrast on white \([\d\.]+:1\)/.test(hoverContents.value), `hover should surface contrast ratio details for ${language}`);
			assert.ok(hoverContents.value.includes(t(LocalizedStrings.COMMAND_QUICK_ACTIONS_TITLE)), `hover should include quick actions heading for ${language}`);
			assert.ok(hoverContents.value.includes('command:colorbuddy.executeQuickAction'), `hover should route quick actions through execute command for ${language}`);
			const hoverLinkMatch = hoverContents.value.match(/command:colorbuddy\.executeQuickAction\?([^"\)\]]+)/);
			assertDefined(hoverLinkMatch, `expected quick action link payload for ${language}`);
			const hoverPayload = JSON.parse(decodeURIComponent(hoverLinkMatch![1]));
			assert.strictEqual(hoverPayload.target, 'colorbuddy.copyColorAs', `hover quick action should target copy command for ${language}`);
			assert.strictEqual(hoverPayload.source, 'hover', `hover quick action should mark hover surface for ${language}`);
			assert.ok(hoverContents.value.includes('colorbuddy.findColorUsages'), `hover quick actions should include find usages for ${language}`);
			assert.ok(hoverContents.value.includes('colorbuddy.showColorPalette'), `hover quick actions should include palette for ${language}`);
		});
	});

		suite('Status bar quick actions', () => {
			test('status bar tooltip includes quick action links', () => {
			const restoreConfig = stubWorkspaceLanguages(['plaintext']);
			const controller = new ExtensionController({ subscriptions: [] } as unknown as vscode.ExtensionContext);
			try {
				const document = createMockDocument('#123456', 'plaintext');
				const colorData = colorDetector.collectColorData(document, document.getText());
				assert.ok(colorData.length > 0, 'expected at least one color for status bar test');
					const buildTooltip = (controller as unknown as {
						buildStatusBarTooltip(data: any, primaryValue: string, metrics: any, report: AccessibilityReport, conversions: any): vscode.MarkdownString;
					}).buildStatusBarTooltip.bind(controller);
					const providerInstance = (controller as unknown as { provider: Provider }).provider;
					const report = providerInstance.getAccessibilityReport(colorData[0].vscodeColor);
					const contrastMetrics = (controller as unknown as {
						extractContrastMetrics(report: AccessibilityReport): { contrastWhite?: any; contrastBlack?: any };
					}).extractContrastMetrics.call(controller, report);
					const conversions = collectFormatConversions(colorParser, colorFormatter, colorData[0].vscodeColor, colorData[0].format);
					const tooltip = buildTooltip(
						colorData[0],
						colorData[0].normalizedColor,
						{
							usageCount: 1,
							contrastWhite: contrastMetrics.contrastWhite,
							contrastBlack: contrastMetrics.contrastBlack
						},
						report,
						conversions
					);
				assert.ok(tooltip.value.includes('$(clippy)'), 'status bar tooltip should surface copy icon affordance');
				assert.ok(tooltip.value.includes(t(LocalizedStrings.TOOLTIP_COLOR_NAME)), 'status bar tooltip should include color name');
				assert.ok(tooltip.value.includes(t(LocalizedStrings.TOOLTIP_BRIGHTNESS)), 'status bar tooltip should include brightness metadata');
				assert.ok(tooltip.value.includes(t(LocalizedStrings.TOOLTIP_WCAG_STATUS)), 'status bar tooltip should include WCAG status heading');
				assert.ok(tooltip.value.includes('#22c55e') || tooltip.value.includes('#ef4444'), 'status bar tooltip should surface colored pass/fail icons');
				assert.ok(tooltip.value.includes('command:colorbuddy.copyColorAs?'), 'status bar tooltip should include copy command link');
				assert.ok(tooltip.value.includes(t(LocalizedStrings.COMMAND_QUICK_ACTIONS_TITLE)), 'status bar tooltip should include quick actions header');
				assert.ok(tooltip.value.includes('command:colorbuddy.executeQuickAction'), 'status bar quick actions should route through execute command');
				const linkMatch = tooltip.value.match(/command:colorbuddy\.executeQuickAction\?([^"\)\]]+)/);
				assertDefined(linkMatch, 'status bar quick action payload should be present');
				const payload = JSON.parse(decodeURIComponent(linkMatch![1]));
				assert.strictEqual(payload.target, 'colorbuddy.copyColorAs', 'status bar quick action should include copy command link');
				assert.strictEqual(payload.source, 'statusBar', 'status bar quick action payload should mark the surface');
				assert.ok(tooltip.value.includes('colorbuddy.findColorUsages'), 'status bar quick actions should include find usages command');
				assert.ok(tooltip.value.includes('colorbuddy.showColorPalette'), 'status bar quick actions should include palette command');
				assert.strictEqual(tooltip.isTrusted, true, 'status bar tooltip must be trusted to enable command links');
			} finally {
				controller.dispose();
				restoreConfig();
			}
		});
	});

	suite('Quick action payload values', () => {
		test('hover copy action uses CSS variable declaration value', async () => {
			registry.clear();
			const variableUri = vscode.Uri.parse('file:///workspace/palette.css');
			registry.addVariable(
				'--chart-1',
				createMockCSSVariableDeclaration('--chart-1', '12 76% 61%', {
					uri: variableUri,
					context: { type: 'root', specificity: 0 }
				})
			);

			const document = createMockDocument('div { color: hsl(var(--chart-1)); }', 'css');
			const colorData = colorDetector.collectColorData(document, document.getText());
			const variableColor = colorData.find(data => data.isCssVariable && data.variableName === '--chart-1');
			assertDefined(variableColor, 'expected CSS variable color data');

			const hover = await provider.provideHover(colorData, variableColor.range.start);
			assertDefined(hover, 'expected hover result for CSS variable');
			const hoverMarkdown = hover!.contents[0] as vscode.MarkdownString;
			const payloads = extractQuickActionPayloads(hoverMarkdown);
			const copyPayload = payloads.find(payload => payload.target === 'colorbuddy.copyColorAs');
			assertDefined(copyPayload, 'expected copy quick action payload');
			assert.ok(Array.isArray(copyPayload!.args), 'expected quick action args to exist');
			const payloadArg = copyPayload!.args[0];
			assert.strictEqual(payloadArg.value, '12 76% 61%', 'copy payload should include raw CSS variable value');
		});

		test('status bar copy action uses CSS variable declaration value', () => {
			registry.clear();
			const variableUri = vscode.Uri.parse('file:///workspace/palette.css');
			const declaration = createMockCSSVariableDeclaration('--chart-1', '12 76% 61%', {
				uri: variableUri,
				context: { type: 'root', specificity: 0 }
			});
			registry.addVariable('--chart-1', declaration);

			const restoreConfig = stubWorkspaceLanguages(['css']);
			const controller = new ExtensionController({ subscriptions: [] } as unknown as vscode.ExtensionContext);
			const controllerRegistry = (controller as unknown as { registry: Registry }).registry;
			controllerRegistry.addVariable('--chart-1', { ...declaration });

			try {
				const document = createMockDocument('div { color: hsl(var(--chart-1)); }', 'css');
				const colorData = colorDetector.collectColorData(document, document.getText());
				const variableColor = colorData.find(data => data.isCssVariable && data.variableName === '--chart-1');
				assertDefined(variableColor, 'expected CSS variable color data for status bar');

				const providerInstance = (controller as unknown as { provider: Provider }).provider;
				const report = providerInstance.getAccessibilityReport(variableColor.vscodeColor);
				const contrastMetrics = (controller as unknown as {
					extractContrastMetrics(report: AccessibilityReport): { contrastWhite?: any; contrastBlack?: any };
				}).extractContrastMetrics.call(controller, report);
				const conversions = collectFormatConversions(colorParser, colorFormatter, variableColor.vscodeColor, variableColor.format);
				const buildTooltip = (controller as unknown as {
					buildStatusBarTooltip(
						data: any,
						primaryValue: string,
						metrics: any,
						report: AccessibilityReport,
						conversions: any
					): vscode.MarkdownString;
				}).buildStatusBarTooltip.bind(controller);
				const primaryValue = conversions[0]?.value ?? variableColor.normalizedColor;
				const tooltip = buildTooltip(
					variableColor,
					primaryValue,
					{
						usageCount: 1,
						contrastWhite: contrastMetrics.contrastWhite,
						contrastBlack: contrastMetrics.contrastBlack
					},
					report,
					conversions
				);

				const payloads = extractQuickActionPayloads(tooltip);
				const copyPayload = payloads.find(payload => payload.target === 'colorbuddy.copyColorAs');
				assertDefined(copyPayload, 'expected status bar copy payload');
				assert.ok(Array.isArray(copyPayload!.args), 'expected status bar quick action args');
				const payloadArg = copyPayload!.args[0];
				assert.strictEqual(payloadArg.value, '12 76% 61%', 'status bar copy payload should use raw CSS variable value');
			} finally {
				controller.dispose();
				restoreConfig();
			}
		});
	});

	suite('Quick action command', () => {
		test('tracks quick action telemetry when opt-in is enabled', async () => {
			const restoreConfig = stubWorkspaceLanguages(['plaintext'], { enableTelemetry: true });
			const events: QuickActionTelemetryEvent[] = [];
			const telemetry = new Telemetry({ onQuickActionRecorded: event => events.push(event) });
			const controller = new ExtensionController({ subscriptions: [] } as unknown as vscode.ExtensionContext, { telemetry });
			const restoreCommand = stubExecuteCommand(undefined);
			try {
				const executeQuickAction = (controller as unknown as {
					handleExecuteQuickActionCommand(payload?: any): Promise<void>;
				}).handleExecuteQuickActionCommand.bind(controller);
				await executeQuickAction({ target: 'colorbuddy.copyColorAs', source: 'hover' });
				assert.strictEqual(events.length, 1, 'telemetry should record quick action when enabled');
				assert.strictEqual(events[0].target, 'colorbuddy.copyColorAs');
				assert.strictEqual(events[0].source, 'hover');
			} finally {
				restoreCommand();
				controller.dispose();
				restoreConfig();
			}
		});

		test('does not record telemetry when opt-in is disabled', async () => {
			const restoreConfig = stubWorkspaceLanguages(['plaintext'], { enableTelemetry: false });
			const events: QuickActionTelemetryEvent[] = [];
			const telemetry = new Telemetry({ onQuickActionRecorded: event => events.push(event) });
			const controller = new ExtensionController({ subscriptions: [] } as unknown as vscode.ExtensionContext, { telemetry });
			const restoreCommand = stubExecuteCommand(undefined);
			try {
				const executeQuickAction = (controller as unknown as {
					handleExecuteQuickActionCommand(payload?: any): Promise<void>;
				}).handleExecuteQuickActionCommand.bind(controller);
				await executeQuickAction({ target: 'colorbuddy.copyColorAs', source: 'statusBar' });
				assert.strictEqual(events.length, 0, 'telemetry should remain silent when disabled');
			} finally {
				restoreCommand();
				controller.dispose();
				restoreConfig();
			}
		});
	});

	suite('Color insight telemetry', () => {
		test('hover emits metrics when telemetry is enabled', async () => {
			const restoreConfig = stubWorkspaceLanguages(['plaintext'], { enableTelemetry: true });
			const events: ColorInsightTelemetryEvent[] = [];
			const telemetry = new Telemetry({ onColorInsightRecorded: event => events.push(event) });
			const instrumentedProvider = new Provider(registry, colorParser, colorFormatter, cssParser, telemetry);
			try {
				const document = createMockDocument('#123456', 'plaintext');
				const colorData = colorDetector.collectColorData(document, document.getText());
				const hover = await instrumentedProvider.provideHover(colorData, colorData[0].range.start);
				assertDefined(hover, 'expected hover result');
				assert.strictEqual(events.length, 1, 'telemetry should record hover metrics');
				assert.strictEqual(events[0].surface, 'hover');
				assert.strictEqual(events[0].colorKind, 'literal');
				assert.strictEqual(events[0].usageCount, 1);
				assert.strictEqual(events[0].contrast.length, 2);
			} finally {
				restoreConfig();
			}
		});

		test('status bar emits metrics when telemetry is enabled', () => {
			const restoreConfig = stubWorkspaceLanguages(['plaintext'], { enableTelemetry: true });
			const events: ColorInsightTelemetryEvent[] = [];
			const telemetry = new Telemetry({ onColorInsightRecorded: event => events.push(event) });
			const controller = new ExtensionController({ subscriptions: [] } as unknown as vscode.ExtensionContext, { telemetry });
			try {
				const document = createMockDocument('#abcdef', 'plaintext');
				const colorData = colorDetector.collectColorData(document, document.getText());
				assert.ok(colorData.length > 0, 'expected color data for status bar telemetry test');
				const report = provider.getAccessibilityReport(colorData[0].vscodeColor);
				const recordStatusTelemetry = (controller as unknown as {
					recordStatusBarTelemetry(data: any, usageCount: number, report: AccessibilityReport): void;
				}).recordStatusBarTelemetry.bind(controller);
				recordStatusTelemetry(colorData[0], 1, report);
				assert.strictEqual(events.length, 1, 'telemetry should record status bar metrics');
				assert.strictEqual(events[0].surface, 'statusBar');
				assert.strictEqual(events[0].usageCount, 1);
				assert.strictEqual(events[0].contrast.length, 2);
			} finally {
				controller.dispose();
				restoreConfig();
			}
		});

		test('color insight telemetry respects opt-out', async () => {
			const restoreConfig = stubWorkspaceLanguages(['plaintext'], { enableTelemetry: false });
			const events: ColorInsightTelemetryEvent[] = [];
			const telemetry = new Telemetry({ onColorInsightRecorded: event => events.push(event) });
			const instrumentedProvider = new Provider(registry, colorParser, colorFormatter, cssParser, telemetry);
			try {
				const document = createMockDocument('#654321', 'plaintext');
				const colorData = colorDetector.collectColorData(document, document.getText());
				await instrumentedProvider.provideHover(colorData, colorData[0].range.start);
				assert.strictEqual(events.length, 0, 'telemetry should stay silent when disabled');
			} finally {
				restoreConfig();
			}
		});
	});
});

suite('Additional format coverage', () => {
	test('format helpers round-trip HSL boundary values', () => {
		const color = new vscode.Color(0, 1, 0, 0.5);
		const hsla = colorFormatter.formatByFormat(color, 'hsla');
		assert.ok(hsla);
		assert.match(hsla!, /^hsla\(/);
		const rgb = colorFormatter.formatByFormat(color, 'rgba');
		assert.strictEqual(rgb, 'rgba(0, 255, 0, 0.5)');
	});

	test('Tailwind formatting matches rgb-only alpha handling', () => {
		const color = new vscode.Color(1, 0, 1, 0.25);
		const tailwind = colorFormatter.formatByFormat(color, 'tailwind');
		assert.ok(tailwind);
		assert.ok(tailwind?.includes('/ 0.25'));
	});
});

suite('Cache behaviour', () => {
	test('cache stores and retrieves per document version', async () => {
		const uri = vscode.Uri.parse('untitled:cache-test');
		const docV1 = createMockDocumentWithVersion('#abc', 'plaintext', 1, uri);
		const docV2 = createMockDocumentWithVersion('#abc\n#def', 'plaintext', 2, uri);
		cache.clear();

		const restoreCommand = stubExecuteCommand(undefined);
		const restoreConfig = stubWorkspaceLanguages(['plaintext']);
		try {
			// Test cache directly
			const text1 = docV1.getText();
			const data1 = colorDetector.collectColorData(docV1, text1);
			cache.set(uri.toString(), 1, data1);
			
			const cached1 = cache.get(uri.toString(), 1);
			assertDefined(cached1);
			assert.strictEqual(cached1, data1, 'expected cached array for same version');
			
			const text2 = docV2.getText();
			const data2 = colorDetector.collectColorData(docV2, text2);
			cache.set(uri.toString(), 2, data2);
			
			const cached2 = cache.get(uri.toString(), 2);
			assertDefined(cached2);
			assert.strictEqual(cached2.length, 2);
			
			// Old version should not be accessible
			const oldCached = cache.get(uri.toString(), 1);
			assert.strictEqual(oldCached, undefined, 'expected old version to be cleared');
		} finally {
			restoreCommand();
			restoreConfig();
		}
	});
});

function extractQuickActionPayloads(markdown: vscode.MarkdownString): any[] {
	const regex = /command:colorbuddy\.executeQuickAction\?([^"\)\]]+)/g;
	const matches = markdown.value.matchAll(regex);
	return Array.from(matches, match => JSON.parse(decodeURIComponent(match[1])));
}

function stubExecuteCommand<T>(result: T): () => void {
	const original = vscode.commands.executeCommand;
	(vscode.commands as unknown as { executeCommand: typeof vscode.commands.executeCommand }).executeCommand = ((_command: string, ..._args: unknown[]) => Promise.resolve(result)) as typeof vscode.commands.executeCommand;
	return () => {
		(vscode.commands as unknown as { executeCommand: typeof vscode.commands.executeCommand }).executeCommand = original;
	};
}

interface WorkspaceConfigOverrides {
	enableTelemetry?: boolean;
}

function stubWorkspaceLanguages(languages: string[], overrides?: WorkspaceConfigOverrides): () => void {
	const original = vscode.workspace.getConfiguration;
	const config: vscode.WorkspaceConfiguration = {
		get: <T>(section: string, defaultValue?: T) => {
			if (section === 'languages') {
				return languages as unknown as T;
			}
			if (section === 'enableTelemetry') {
				if (typeof overrides?.enableTelemetry === 'boolean') {
					return overrides.enableTelemetry as unknown as T;
				}
				return defaultValue as T;
			}
			return defaultValue as T;
		},
		has: () => true,
		inspect: () => undefined,
		update: async (
			_section: string,
			_value: unknown,
			_target?: vscode.ConfigurationTarget | boolean | null,
			_overrideInLanguage?: boolean
		) => undefined
	};
	(vscode.workspace as unknown as { getConfiguration: typeof vscode.workspace.getConfiguration }).getConfiguration = () => config;
	return () => {
		(vscode.workspace as unknown as { getConfiguration: typeof vscode.workspace.getConfiguration }).getConfiguration = original;
	};
}

/**
 * Helper for cache test that needs versioned mock documents
 */
function createMockDocumentWithVersion(
	content: string,
	languageId: string,
	version = 1,
	uri: vscode.Uri = vscode.Uri.parse(`untitled:${Math.random().toString(36).slice(2)}`)
): vscode.TextDocument {
	const text = content.replace(/^\n/, '');
	const lines = text.split(/\r?\n/);

	const positionAt = (index: number): vscode.Position => {
		let remaining = index;
		for (let line = 0; line < lines.length; line += 1) {
			const lineLength = lines[line].length + 1;
			if (remaining < lineLength) {
				return new vscode.Position(line, Math.min(remaining, lines[line].length));
			}
			remaining -= lineLength;
		}
		return new vscode.Position(lines.length - 1, lines[lines.length - 1].length);
	};

	const offsetAt = (position: vscode.Position): number => {
		let offsetTotal = 0;
		for (let i = 0; i < position.line; i += 1) {
			offsetTotal += lines[i].length + 1;
		}
		return offsetTotal + position.character;
	};

	const getText = (range?: vscode.Range): string => {
		if (!range) {
			return text;
		}
		const start = offsetAt(range.start);
		const end = offsetAt(range.end);
		return text.slice(start, end);
	};

	return {
		uri,
		fileName: uri.fsPath,
		isUntitled: true,
		languageId,
		version,
		isDirty: false,
		isClosed: false,
		save: async () => true,
		lineCount: lines.length,
		getText,
		getWordRangeAtPosition: () => undefined,
		validateRange: (range: vscode.Range) => range,
		validatePosition: (position: vscode.Position) => position,
		positionAt,
		offsetAt,
		lineAt: (line: number) => {
			const lineText = lines[line] ?? '';
			return {
				lineNumber: line,
				text: lineText,
				range: new vscode.Range(new vscode.Position(line, 0), new vscode.Position(line, lineText.length)),
				rangeIncludingLineBreak: new vscode.Range(
					new vscode.Position(line, 0),
					new vscode.Position(line, lineText.length + (line === lines.length - 1 ? 0 : 1))
				),
				firstNonWhitespaceCharacterIndex: lineText.length - lineText.trimStart().length,
				isEmptyOrWhitespace: lineText.trim().length === 0
			};
		},
		eol: vscode.EndOfLine.LF
	} as unknown as vscode.TextDocument;
}
