import * as vscode from 'vscode';
import * as path from 'path';
import type { AccessibilityReport, ColorData, ColorFormat, CopyColorCommandPayload, CSSVariableDeclaration } from '../types';
import { DEFAULT_LANGUAGES } from '../types';
import {
	MAX_CSS_FILES,
	CSS_FILE_PATTERN,
	EXCLUDE_PATTERN,
	COLOR_SWATCH_SIZE,
	COLOR_SWATCH_MARGIN,
	COLOR_SWATCH_BORDER,
	COLOR_SWATCH_CONTENT,
	DECORATION_CHUNK_SIZE,
	DECORATION_CHUNK_YIELD_DELAY_MS,
	LOG_PREFIX
} from '../utils/constants';
import { perfLogger } from '../utils/performanceLogger';
import { t, LocalizedStrings } from '../l10n/localization';
import { Registry } from './registry';
import { Cache } from './cache';
import { StateManager } from './stateManager';
import { ColorParser } from './colorParser';
import { ColorFormatter } from './colorFormatter';
import { ColorDetector } from './colorDetector';
import { CSSParser } from './cssParser';
import { Provider } from './provider';
import { collectFormatConversions, getFormatLabel, appendFormatConversionList } from '../utils/colorFormatConversions';
import type { FormatConversion } from '../utils/colorFormatConversions';
import { appendQuickActions, EXECUTE_QUICK_ACTION_COMMAND, QuickActionLinkPayload } from '../utils/quickActions';
import { Telemetry, buildContrastTelemetry, ColorInsightColorKind } from './telemetry';
import { getColorUsageCount } from '../utils/colorUsage';
import { getColorInsights } from '../utils/colorInsights';
import { appendWcagStatusSection } from '../utils/accessibilityFormatting';

const CSS_LIKE_LANGUAGES = new Set([
	'css',
	'scss',
	'sass',
	'less',
	'stylus'
]);

const NATIVE_COLOR_PROVIDER_LANGUAGES = new Set([
	'css',
	'scss',
	'less'
]);

const CSS_LIKE_FILE_EXTENSIONS = new Set([
	'.css',
	'.scss',
	'.sass',
	'.less',
	'.styl',
	'.stylus',
	'.pcss',
	'.postcss'
]);

const SASS_FILE_EXTENSIONS = new Set(['.sass']);
const MAX_COLOR_USAGE_RESULTS = 200;

interface ColorUsageMatch {
	uri: vscode.Uri;
	range: vscode.Range;
	previewText: string;
}

interface ColorUsageQuickPickItem extends vscode.QuickPickItem {
	match?: ColorUsageMatch;
}

interface ExtensionControllerOptions {
	telemetry?: Telemetry;
}

interface StatusBarMetrics {
	usageCount: number;
	contrastWhite?: ContrastSummary;
	contrastBlack?: ContrastSummary;
}

interface ContrastSummary {
	ratio: number;
	level: string;
}

/**
 * Main extension controller managing lifecycle and coordination between services.
 * Follows the dependency injection pattern for better testability and maintainability.
 */
export class ExtensionController implements vscode.Disposable {
	private readonly registry: Registry;
	private readonly cache: Cache;
	private readonly stateManager: StateManager;
	private readonly colorParser: ColorParser;
	private readonly colorFormatter: ColorFormatter;
	private readonly colorDetector: ColorDetector;
	private readonly cssParser: CSSParser;
	private readonly provider: Provider;
	private readonly telemetry: Telemetry;
	private readonly disposables: vscode.Disposable[] = [];
	private cssFileWatcher: vscode.FileSystemWatcher | null = null;
	private registeredLanguageKey: string | null = null;
	private indexedCssDocuments: Map<string, number> = new Map();
	private readonly statusBarItem: vscode.StatusBarItem;
	private statusBarRequestId = 0;

	constructor(private readonly context: vscode.ExtensionContext, options?: ExtensionControllerOptions) {
		// Initialize services with dependency injection
		this.registry = new Registry();
		this.cache = new Cache();
		this.stateManager = new StateManager();
		this.colorParser = new ColorParser();
		this.colorFormatter = new ColorFormatter();
		this.colorDetector = new ColorDetector(this.registry, this.colorParser);
		this.cssParser = new CSSParser(this.registry, this.colorParser);
		this.telemetry = options?.telemetry ?? new Telemetry();
		this.provider = new Provider(this.registry, this.colorParser, this.colorFormatter, this.cssParser, this.telemetry);
		this.statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
		this.statusBarItem.name = 'ColorBuddy Active Color';
		const statusBarPayload: QuickActionLinkPayload = {
			target: 'colorbuddy.showColorPalette',
			source: 'statusBar'
		};
		this.statusBarItem.command = {
			command: EXECUTE_QUICK_ACTION_COMMAND,
			title: t(LocalizedStrings.COMMAND_QUICK_ACTION_PALETTE),
			arguments: [statusBarPayload]
		};
		this.disposables.push(this.telemetry);
	}

	/**
	 * Activate the extension and set up all features.
	 */
	async activate(): Promise<void> {
		perfLogger.start('extension.activate');
		console.log(`${LOG_PREFIX} ${t(LocalizedStrings.EXTENSION_ACTIVATING)}`);

		this.setupErrorHandlers();
		await this.indexWorkspaceCSSFiles();
		this.setupCSSFileWatcher();
		this.registerCommands();
		this.registerEventHandlers();
		this.registerLanguageProviders();
		this.refreshVisibleEditors();
		this.context.subscriptions.push(this.statusBarItem);
		this.statusBarItem.hide();
		void this.updateStatusBar(vscode.window.activeTextEditor);

		console.log(`${LOG_PREFIX} ${t(LocalizedStrings.EXTENSION_ACTIVATED)}`);
		perfLogger.end('extension.activate');
		perfLogger.logSummary();
	}

	/**
	 * Set up global error handlers for uncaught exceptions and unhandled rejections.
	 */
	private setupErrorHandlers(): void {
		const uncaughtHandler = (error: Error) => {
			console.error(`${LOG_PREFIX} uncaught exception`, error);
		};
		const unhandledHandler = (reason: unknown) => {
			console.error(`${LOG_PREFIX} unhandled rejection`, reason);
		};

		process.on('uncaughtException', uncaughtHandler);
		process.on('unhandledRejection', unhandledHandler);

		// Clean up handlers on deactivation
		this.disposables.push({
			dispose: () => {
				process.removeListener('uncaughtException', uncaughtHandler);
				process.removeListener('unhandledRejection', unhandledHandler);
			}
		});
	}

	/**
	 * Set up file system watcher for CSS files.
	 */
	private setupCSSFileWatcher(): void {
		this.cssFileWatcher = vscode.workspace.createFileSystemWatcher(CSS_FILE_PATTERN);

		this.cssFileWatcher.onDidChange(uri => this.handleCSSFileChange(uri));
		this.cssFileWatcher.onDidCreate(uri => this.handleCSSFileChange(uri));
		this.cssFileWatcher.onDidDelete(uri => this.handleCSSFileDelete(uri));

		this.context.subscriptions.push(this.cssFileWatcher);
	}

	/**
	 * Handle CSS file changes by re-parsing and refreshing editors.
	 */
	private async handleCSSFileChange(uri: vscode.Uri): Promise<void> {
		try {
			const document = await vscode.workspace.openTextDocument(uri);
			await this.cssParser.parseCSSFile(document);
			this.refreshVisibleEditors();
		} catch (error) {
			console.error(`${LOG_PREFIX} failed to handle CSS file change for ${uri.fsPath}`, error);
		}
	}

	/**
	 * Handle CSS file deletion by removing variables and refreshing editors.
	 */
	private handleCSSFileDelete(uri: vscode.Uri): void {
		this.registry.removeByUri(uri);
		this.refreshVisibleEditors();
	}

	/**
	 * Register all extension commands.
	 */
	private registerCommands(): void {
		const commands = [
			vscode.commands.registerCommand('colorbuddy.reindexCSSFiles', () => this.handleReindexCommand()),
			vscode.commands.registerCommand('colorbuddy.showColorPalette', () => this.handleShowPaletteCommand()),
			vscode.commands.registerCommand('colorbuddy.exportPerformanceLogs', () => this.handleExportLogsCommand()),
			vscode.commands.registerCommand('colorbuddy.capturePerformanceSnapshot', () => this.handleCapturePerformanceSnapshotCommand()),
			vscode.commands.registerCommand('colorbuddy.copyColorAs', (payload?: CopyColorCommandPayload) => this.handleCopyColorCommand(payload)),
			vscode.commands.registerCommand('colorbuddy.findColorUsages', () => this.handleFindColorUsagesCommand()),
			vscode.commands.registerCommand('colorbuddy.testColorAccessibility', () => this.handleTestAccessibilityCommand()),
			vscode.commands.registerCommand('colorbuddy.convertColorFormat', () => this.handleConvertColorFormatCommand()),
			vscode.commands.registerCommand(EXECUTE_QUICK_ACTION_COMMAND, payload => this.handleExecuteQuickActionCommand(payload))
		];

		this.context.subscriptions.push(...commands);
	}

	/**
	 * Handle re-index CSS files command.
	 */
	private async handleReindexCommand(): Promise<void> {
		try {
			await this.indexWorkspaceCSSFiles();
			this.refreshVisibleEditors();
			await vscode.window.showInformationMessage(
				t(LocalizedStrings.EXTENSION_INDEXING_COMPLETE, this.registry.variableCount)
			);
		} catch (error) {
			console.error(`${LOG_PREFIX} failed to re-index CSS files`, error);
			await vscode.window.showErrorMessage(t(LocalizedStrings.EXTENSION_ERROR_REINDEX));
		}
	}

	/**
	 * Handle show color palette command.
	 */
	private async handleShowPaletteCommand(): Promise<void> {
		const palette = this.extractWorkspaceColorPalette();
		const items = Array.from(palette.entries()).map(([colorString, color]) => {
			const r = Math.round(color.red * 255);
			const g = Math.round(color.green * 255);
			const b = Math.round(color.blue * 255);
			return {
				label: colorString,
				description: `RGB(${r}, ${g}, ${b})`,
				detail: 'Used in workspace CSS variables'
			};
		});

		if (items.length === 0) {
			await vscode.window.showInformationMessage(t(LocalizedStrings.PALETTE_NO_COLORS));
		} else {
			await vscode.window.showQuickPick(items, {
				title: `${t(LocalizedStrings.PALETTE_TITLE)} (${items.length})`,
				placeHolder: t(LocalizedStrings.PALETTE_TITLE)
			});
		}
	}

	private async handleCopyColorCommand(payload?: CopyColorCommandPayload): Promise<void> {
		if (payload && typeof payload === 'object' && typeof payload.value === 'string') {
			try {
				await vscode.env.clipboard.writeText(payload.value);
				if (payload.showNotification !== false) {
					await vscode.window.showInformationMessage(t(LocalizedStrings.COMMAND_COPY_COLOR_SUCCESS, payload.value));
				}
			} catch (error) {
				console.error(`${LOG_PREFIX} failed to copy color payload value`, error);
				await vscode.window.showErrorMessage(t(LocalizedStrings.COMMAND_COPY_COLOR_ERROR));
			}
			return;
		}

		const editor = vscode.window.activeTextEditor;
		if (!editor) {
			await vscode.window.showInformationMessage(t(LocalizedStrings.COMMAND_COPY_COLOR_NO_EDITOR));
			return;
		}

		try {
			const colorData = await this.ensureColorData(editor.document);
			const cursor = editor.selection.active;
			const activeColor = colorData.find(data => data.range.contains(cursor));
			if (!activeColor) {
				await vscode.window.showInformationMessage(t(LocalizedStrings.COMMAND_COPY_COLOR_NO_COLOR));
				return;
			}

			const conversions = collectFormatConversions(this.colorParser, this.colorFormatter, activeColor.vscodeColor, activeColor.format);
			if (conversions.length === 0) {
				await vscode.window.showInformationMessage(t(LocalizedStrings.COMMAND_COPY_COLOR_NO_COLOR));
				return;
			}

			const quickPickItems = conversions.map(conversion => ({
				label: conversion.value,
				description: getFormatLabel(conversion.format)
			}));

			const selection = await vscode.window.showQuickPick(quickPickItems, {
				title: t(LocalizedStrings.COMMAND_COPY_COLOR_TITLE),
				placeHolder: t(LocalizedStrings.COMMAND_COPY_COLOR_PLACEHOLDER)
			});

			if (!selection) {
				return;
			}

			const chosen = conversions.find(conversion => conversion.value === selection.label) ?? conversions[0];
			await vscode.env.clipboard.writeText(chosen.value);
			await vscode.window.showInformationMessage(t(LocalizedStrings.COMMAND_COPY_COLOR_SUCCESS, chosen.value));
		} catch (error) {
			console.error(`${LOG_PREFIX} failed to copy color value`, error);
			await vscode.window.showErrorMessage(t(LocalizedStrings.COMMAND_COPY_COLOR_ERROR));
		}
	}

	private async handleFindColorUsagesCommand(): Promise<void> {
		const editor = vscode.window.activeTextEditor;
		let searchCandidates: string[] = [];
		let sourceLabel: string | undefined;

		if (editor) {
			try {
				const colorData = await this.ensureColorData(editor.document);
				const activeColor = this.getActiveColorAtPosition(colorData, editor.selection.active);
				if (activeColor) {
					searchCandidates = this.getColorSearchCandidates(activeColor);
					sourceLabel = editor.document.getText(activeColor.range);
				}
			} catch (error) {
				console.error(`${LOG_PREFIX} failed to prepare find color usages candidates`, error);
			}
		}

		if (searchCandidates.length === 0) {
			const palette = this.extractWorkspaceColorPalette();
			if (palette.size === 0) {
				await vscode.window.showInformationMessage(t(LocalizedStrings.COMMAND_FIND_USAGES_NO_COLOR));
				return;
			}

			const paletteItems = Array.from(palette.keys()).map(colorString => ({
				label: colorString,
				description: t(LocalizedStrings.TOOLTIP_COLOR)
			}));

			const chosenPaletteColor = await vscode.window.showQuickPick(paletteItems, {
				title: t(LocalizedStrings.COMMAND_FIND_USAGES_PICK_FROM_PALETTE)
			});

			if (!chosenPaletteColor) {
				return;
			}

			searchCandidates = [chosenPaletteColor.label];
			sourceLabel = chosenPaletteColor.label;
		}

		let searchValue = searchCandidates[0];
		if (searchCandidates.length > 1) {
			const candidatePick = await vscode.window.showQuickPick(
				searchCandidates.map(candidate => ({ label: candidate })),
				{ title: t(LocalizedStrings.COMMAND_FIND_USAGES_PICK_VALUE), placeHolder: sourceLabel }
			);
			if (!candidatePick) {
				return;
			}
			searchValue = candidatePick.label;
		}

		const trimmed = searchValue.trim();
		if (!trimmed) {
			await vscode.window.showInformationMessage(t(LocalizedStrings.COMMAND_FIND_USAGES_NO_COLOR));
			return;
		}

		let matches: ColorUsageMatch[] = [];
		try {
			matches = await this.searchColorUsages(trimmed);
		} catch (error) {
			console.error(`${LOG_PREFIX} failed to search for color usages`, error);
			await vscode.window.showErrorMessage(t(LocalizedStrings.COMMAND_FIND_USAGES_NO_RESULTS, trimmed));
			return;
		}

		if (matches.length === 0) {
			await vscode.window.showInformationMessage(t(LocalizedStrings.COMMAND_FIND_USAGES_NO_RESULTS, trimmed));
			return;
		}

		await this.presentColorUsageResults(trimmed, matches);
	}

	private async handleTestAccessibilityCommand(): Promise<void> {
		const editor = vscode.window.activeTextEditor;
		if (!editor) {
			await vscode.window.showInformationMessage(t(LocalizedStrings.COMMAND_TEST_ACCESSIBILITY_NO_EDITOR));
			return;
		}

		try {
			const colorData = await this.ensureColorData(editor.document);
			const activeColor = this.getActiveColorAtPosition(colorData, editor.selection.active);
			if (!activeColor) {
				await vscode.window.showInformationMessage(t(LocalizedStrings.COMMAND_TEST_ACCESSIBILITY_NO_COLOR));
				return;
			}

			const report = this.provider.getAccessibilityReport(activeColor.vscodeColor);
			const summary = report.samples
				.map(sample => `${sample.label}: ${sample.contrastRatio.toFixed(2)}:1 (${sample.level})`)
				.join('\n');
			const message = t(LocalizedStrings.COMMAND_TEST_ACCESSIBILITY_RESULTS, activeColor.normalizedColor, summary);
			await vscode.window.showInformationMessage(message);
		} catch (error) {
			console.error(`${LOG_PREFIX} failed to test color accessibility`, error);
			await vscode.window.showErrorMessage(t(LocalizedStrings.COMMAND_TEST_ACCESSIBILITY_ERROR));
		}
	}

	private async handleConvertColorFormatCommand(): Promise<void> {
		const editor = vscode.window.activeTextEditor;
		if (!editor) {
			await vscode.window.showInformationMessage(t(LocalizedStrings.COMMAND_CONVERT_COLOR_NO_EDITOR));
			return;
		}

		try {
			const colorData = await this.ensureColorData(editor.document);
			const activeColor = this.getActiveColorAtPosition(colorData, editor.selection.active);
			if (!activeColor) {
				await vscode.window.showInformationMessage(t(LocalizedStrings.COMMAND_CONVERT_COLOR_NO_COLOR));
				return;
			}

			const conversions = collectFormatConversions(this.colorParser, this.colorFormatter, activeColor.vscodeColor, activeColor.format);
			if (conversions.length === 0) {
				await vscode.window.showInformationMessage(t(LocalizedStrings.COMMAND_CONVERT_COLOR_NO_ALTERNATIVES));
				return;
			}

			const currentValue = editor.document.getText(activeColor.range);
			const alternativeConversions = conversions.filter(conversion => conversion.value !== currentValue);
			if (alternativeConversions.length === 0) {
				await vscode.window.showInformationMessage(t(LocalizedStrings.COMMAND_CONVERT_COLOR_NO_ALTERNATIVES));
				return;
			}

			let chosen = alternativeConversions[0];
			if (conversions.length > 1) {
				const quickPickItems = conversions.map(conversion => ({
					label: conversion.value,
					description: getFormatLabel(conversion.format),
					detail: conversion.value === currentValue ? t(LocalizedStrings.COMMAND_CONVERT_COLOR_CURRENT_LABEL) : undefined
				}));
				const selection = await vscode.window.showQuickPick(quickPickItems, {
					title: t(LocalizedStrings.COMMAND_CONVERT_COLOR_TITLE),
					placeHolder: t(LocalizedStrings.COMMAND_CONVERT_COLOR_PLACEHOLDER)
				});
				if (!selection) {
					return;
				}
				chosen = conversions.find(conversion => conversion.value === selection.label) ?? alternativeConversions[0];
			}

			const editApplied = await editor.edit(editBuilder => {
				editBuilder.replace(activeColor.range, chosen.value);
			});

			if (!editApplied) {
				await vscode.window.showErrorMessage(t(LocalizedStrings.COMMAND_CONVERT_COLOR_ERROR));
				return;
			}

			await vscode.window.showInformationMessage(t(LocalizedStrings.COMMAND_CONVERT_COLOR_SUCCESS, chosen.value));
		} catch (error) {
			console.error(`${LOG_PREFIX} failed to convert color`, error);
			await vscode.window.showErrorMessage(t(LocalizedStrings.COMMAND_CONVERT_COLOR_ERROR));
		}
	}

	private async ensurePerformanceLoggingEnabled(): Promise<boolean> {
		if (perfLogger.isEnabled()) {
			return true;
		}

		const selection = await vscode.window.showWarningMessage(
			t(LocalizedStrings.COMMAND_PERF_LOGGING_DISABLED),
			t(LocalizedStrings.COMMAND_PERF_ENABLE),
			t(LocalizedStrings.COMMAND_PERF_CANCEL)
		);

		if (selection !== t(LocalizedStrings.COMMAND_PERF_ENABLE)) {
			return false;
		}

		const config = vscode.workspace.getConfiguration('colorbuddy');
		await config.update('enablePerformanceLogging', true, vscode.ConfigurationTarget.Global);
		perfLogger.updateEnabled();
		await vscode.window.showInformationMessage(t(LocalizedStrings.COMMAND_PERF_ENABLED_MESSAGE));
		return false;
	}

	private async handleCapturePerformanceSnapshotCommand(): Promise<void> {
		try {
			const ready = await this.ensurePerformanceLoggingEnabled();
			if (!ready) {
				return;
			}

			const editors = vscode.window.visibleTextEditors;
			if (editors.length === 0) {
				await vscode.window.showInformationMessage(t(LocalizedStrings.COMMAND_CAPTURE_PERF_NO_EDITORS));
				return;
			}

			perfLogger.reset();
			perfLogger.log('capturePerformanceSnapshot:start', { editors: editors.length });

			const results = await Promise.allSettled(editors.map(editor => this.refreshEditor(editor)));
			const failures = results.filter((result): result is PromiseRejectedResult => result.status === 'rejected');
			for (const failure of failures) {
				console.error(`${LOG_PREFIX} failed to refresh editor during performance snapshot`, failure.reason);
			}

			perfLogger.log('capturePerformanceSnapshot:completed', {
				editors: editors.length,
				failures: failures.length
			});
			perfLogger.logSummary();
			const content = perfLogger.exportLogs();
			const document = await vscode.workspace.openTextDocument({ content, language: 'markdown' });
			await vscode.window.showTextDocument(document, { preview: false });
			await vscode.window.showInformationMessage(t(LocalizedStrings.COMMAND_CAPTURE_PERF_SUCCESS, editors.length));
		} catch (error) {
			console.error(`${LOG_PREFIX} failed to capture performance snapshot`, error);
			await vscode.window.showErrorMessage(t(LocalizedStrings.COMMAND_CAPTURE_PERF_ERROR));
		}
	}

	private async handleExecuteQuickActionCommand(payload?: QuickActionLinkPayload): Promise<void> {
		if (!payload || typeof payload.target !== 'string') {
			console.warn(`${LOG_PREFIX} quick action invoked without a valid target`, payload);
			return;
		}

		if (payload.target === EXECUTE_QUICK_ACTION_COMMAND) {
			console.warn(`${LOG_PREFIX} quick action target cannot be ${EXECUTE_QUICK_ACTION_COMMAND}`);
			return;
		}

		const args = Array.isArray(payload.args) ? payload.args : [];
		const source = payload.source === 'statusBar' ? 'statusBar' : 'hover';

		this.telemetry.trackQuickAction({
			target: payload.target,
			source
		});

		try {
			await vscode.commands.executeCommand(payload.target, ...args);
		} catch (error) {
			console.error(`${LOG_PREFIX} failed to execute quick action target ${payload.target}`, error);
		}
	}

	/**
	 * Handle export performance logs command.
	 */
	private async handleExportLogsCommand(): Promise<void> {
		try {
			const ready = await this.ensurePerformanceLoggingEnabled();
			if (!ready) {
				return;
			}

			perfLogger.logSummary();
			const content = perfLogger.exportLogs();
			const document = await vscode.workspace.openTextDocument({ content, language: 'markdown' });
			await vscode.window.showTextDocument(document, { preview: false });
			await vscode.window.showInformationMessage(t(LocalizedStrings.COMMAND_EXPORT_PERF_SUCCESS));
		} catch (error) {
			console.error(`${LOG_PREFIX} failed to export performance logs`, error);
			await vscode.window.showErrorMessage(t(LocalizedStrings.COMMAND_EXPORT_PERF_ERROR));
		}
	}

	/**
	 * Register document and editor event handlers.
	 */
	private registerEventHandlers(): void {
		this.context.subscriptions.push(
			vscode.window.onDidChangeActiveTextEditor(editor => {
				perfLogger.log('Active editor changed', editor?.document.uri.fsPath || 'none');
				// Update visibility tracking
				if (editor) {
					const editorKey = this.getEditorKey(editor);
					this.stateManager.markEditorVisible(editorKey);
					perfLogger.log('Decoration exists for editor', this.stateManager.getDecoration(editorKey) !== undefined);
					this.refreshEditor(editor).catch(error => {
						console.error(`${LOG_PREFIX} failed to refresh active editor`, error);
					});
				}
				void this.updateStatusBar(editor ?? undefined);
			}),
			// Track when editors become visible/hidden
			vscode.window.onDidChangeVisibleTextEditors(editors => {
				perfLogger.log('Visible editors changed', editors.length);
				const currentVisible = new Set(editors.map(e => this.getEditorKey(e)));
				// Mark newly visible editors
				for (const editor of editors) {
					const editorKey = this.getEditorKey(editor);
					if (!this.stateManager.isEditorVisible(editorKey)) {
						perfLogger.log('Editor became visible, refreshing', editor.document.uri.fsPath);
						this.stateManager.markEditorVisible(editorKey);
						this.refreshEditor(editor).catch(error => {
							console.error(`${LOG_PREFIX} failed to refresh newly visible editor`, error);
						});
					}
				}
				// Mark hidden editors
				for (const visibleKey of this.stateManager.getVisibleEditors()) {
					if (!currentVisible.has(visibleKey)) {
						perfLogger.log('Editor became hidden', visibleKey);
						this.stateManager.markEditorHidden(visibleKey);
					}
				}
				void this.updateStatusBar(vscode.window.activeTextEditor);
			}),
			vscode.workspace.onDidChangeTextDocument(event => {
				const targetEditor = vscode.window.visibleTextEditors.find(
					editor => editor.document === event.document
				);
				if (targetEditor) {
					this.refreshEditor(targetEditor).catch(error => {
						console.error(`${LOG_PREFIX} failed to refresh document editor`, error);
					});
					if (targetEditor === vscode.window.activeTextEditor) {
						void this.updateStatusBar(targetEditor);
					}
				}
			}),
			vscode.workspace.onDidCloseTextDocument(document => {
				this.clearColorCacheForDocument(document);
				if (vscode.window.activeTextEditor?.document === document) {
					this.statusBarItem.hide();
				}
			}),
			vscode.workspace.onDidChangeConfiguration(event => {
				if (event.affectsConfiguration('colorbuddy.languages')) {
					this.stateManager.clearLanguageCache();
					this.registerLanguageProviders();
					this.refreshVisibleEditors();
					void this.updateStatusBar(vscode.window.activeTextEditor);
				}
				if (event.affectsConfiguration('colorbuddy.enablePerformanceLogging')) {
					perfLogger.updateEnabled();
				}
			}),
			vscode.window.onDidChangeTextEditorSelection(event => {
				if (event.textEditor === vscode.window.activeTextEditor) {
					void this.updateStatusBar(event.textEditor);
				}
			})
		);
	}

	/**
	 * Register language feature providers (hover, color picker).
	 */
	private registerLanguageProviders(): void {
		const languages = this.getConfiguredLanguages();

		if (!languages || languages.length === 0) {
			this.stateManager.clearProviderSubscriptions();
			this.registeredLanguageKey = null;
			return;
		}

		const languageKey = JSON.stringify(languages);
		if (this.registeredLanguageKey === languageKey) {
			return;
		}

		this.registeredLanguageKey = languageKey;

		this.stateManager.clearProviderSubscriptions();

		const selector = this.createDocumentSelector(languages);

		const hoverProvider = vscode.languages.registerHoverProvider(selector, {
			provideHover: async (document, position) => {
				perfLogger.start('provideHover');
				const colorData = await this.ensureColorData(document);
				const result = await this.provider.provideHover(colorData, position);
				perfLogger.end('provideHover');
				return result;
			}
		});

		// Register color provider for literal colors only (hex, rgb, hsl)
		// This enables VS Code's native color picker for those values
		// We don't include CSS variables or classes here - those only show in hover tooltips
		const colorProvider = vscode.languages.registerColorProvider(selector, {
			provideDocumentColors: async (document) => {
				if (this.stateManager.isDocumentProbing(document.uri)) {
					return [];
				}

				const colorData = await this.ensureColorData(document);

				let allowedFormats: Set<ColorFormat> | undefined;
				if (this.isNativeColorProviderDocument(document)) {
					allowedFormats = new Set<ColorFormat>(['tailwind']);
				} else if (this.isSassDocument(document)) {
					allowedFormats = new Set<ColorFormat>(['tailwind', 'hsl', 'hsla']);
				}

				if (allowedFormats) {
					const colors = this.provider.provideDocumentColors(colorData, { allowedFormats });
					if (colors.length === 0) {
						perfLogger.log('No document colors emitted after format filtering', document.uri.fsPath);
					}
					return colors;
				}

				return this.provider.provideDocumentColors(colorData);
			},
			provideColorPresentations: (color, context) => {
				const originalText = context.document.getText(context.range);
				const presentations = this.provider.provideColorPresentations(color, originalText);
				return presentations.map(presentation => {
					presentation.textEdit = vscode.TextEdit.replace(context.range, presentation.label);
					return presentation;
				});
			}
		});

		this.stateManager.addProviderSubscription(hoverProvider);
		this.stateManager.addProviderSubscription(colorProvider);
		this.context.subscriptions.push(hoverProvider, colorProvider);
	}

	/**
	 * Create a document selector based on language configuration.
	 */
	private createDocumentSelector(languages: string[]): vscode.DocumentSelector {
		if (languages.includes('*')) {
			return [
				{ scheme: 'file' },
				{ scheme: 'untitled' }
			];
		}
		return languages.map(language => ({ language }));
	}

	/**
	 * Refresh a single editor's color decorations.
	 */
	private async refreshEditor(editor: vscode.TextEditor): Promise<void> {
		const editorKey = this.getEditorKey(editor);
		perfLogger.log('refreshEditor called for', editor.document.uri.fsPath);

		if (!this.shouldDecorate(editor.document)) {
			this.clearDecorationsForEditor(editor);
			this.stateManager.cancelScheduledRefresh(editorKey);
			return;
		}

		const targetVersion = editor.document.version;
		const scheduledLabel = `refreshEditor.execute:${editorKey}`;

		const run = async () => {
			if (editor.document.version !== targetVersion) {
				perfLogger.log('Skipping stale refresh for editor', editor.document.uri.fsPath);
				return;
			}

			perfLogger.start(scheduledLabel);
			const refreshStart = Date.now();

			try {
				const colorData = await this.ensureColorData(editor.document);
				if (editor.document.version !== targetVersion) {
					perfLogger.log('Document version changed during refresh, aborting apply', editor.document.uri.fsPath);
					return;
				}
				await this.applyCSSVariableDecorations(editor, colorData);
			} catch (error) {
				console.error(`${LOG_PREFIX} failed to refresh color data`, error);
			} finally {
				const duration = Date.now() - refreshStart;
				this.stateManager.recordRefreshDuration(editorKey, duration);
				const avg = this.stateManager.getAverageRefreshDuration(editorKey);
				if (avg !== undefined) {
					perfLogger.log('refreshEditor rolling average', { editor: editor.document.uri.fsPath, duration, avg });
				} else {
					perfLogger.log('refreshEditor duration', { editor: editor.document.uri.fsPath, duration });
				}
				perfLogger.end(scheduledLabel);
			}
		};

		return this.stateManager.scheduleRefresh(editorKey, targetVersion, run);
	}

	/**
	 * Refresh all visible editors.
	 */
	private refreshVisibleEditors(): void {
		vscode.window.visibleTextEditors.forEach(editor => {
			this.refreshEditor(editor).catch(error => {
				console.error(`${LOG_PREFIX} failed to refresh editor`, error);
			});
		});
	}

	/**
	 * Determine if a document should have color decorations.
	 */
	private shouldDecorate(document: vscode.TextDocument): boolean {
		const languages = this.getConfiguredLanguages();
		
		if (!languages || languages.length === 0) {
			return false;
		}

		return languages.includes('*') || languages.includes(document.languageId);
	}

	/**
	 * Ensure color data is available for a document, using cache when possible.
	 */
	private async ensureColorData(document: vscode.TextDocument): Promise<ColorData[]> {
		if (!this.shouldDecorate(document)) {
			this.clearColorCacheForDocument(document);
			return [];
		}

		await this.ensureDocumentIndexed(document);

		const cacheKey = document.uri.toString();
		const version = document.version;

		const cached = this.cache.get(cacheKey, version);
		if (cached) {
			perfLogger.log('Cache hit for document', document.uri.fsPath);
			return cached;
		}

		perfLogger.log('Cache miss for document', document.uri.fsPath);
		return this.cache.getPendingOrCompute(cacheKey, version, async () => {
			perfLogger.start('computeColorData');
			const data = await this.computeColorData(document);
			this.cache.set(document.uri.toString(), document.version, data);
			perfLogger.log('Colors detected in document', data.length);
			perfLogger.end('computeColorData');
			return data;
		});
	}

	/**
	 * Compute color data for a document.
	 */
	private async computeColorData(document: vscode.TextDocument): Promise<ColorData[]> {
		const text = document.getText();
		const allColorData = this.colorDetector.collectColorData(document, text);

		perfLogger.log('computeColorData', {
			path: document.uri.fsPath,
			allColors: allColorData.length
		});

		// No need to filter native colors since we only decorate CSS variables and classes,
		// which the native color provider doesn't handle (it only handles literal hex/rgb/hsl)
		return allColorData;
	}

		private getDocumentExtension(document: vscode.TextDocument): string | undefined {
			const fileName = document.fileName || document.uri.fsPath;
			if (!fileName) {
				return undefined;
			}
			const extension = path.extname(fileName);
			return extension ? extension.toLowerCase() : undefined;
		}

		private isCssLikeDocument(document: vscode.TextDocument): boolean {
			if (CSS_LIKE_LANGUAGES.has(document.languageId)) {
				return true;
			}
			const extension = this.getDocumentExtension(document);
			if (!extension) {
				return false;
			}
			return CSS_LIKE_FILE_EXTENSIONS.has(extension);
		}

		private isNativeColorProviderDocument(document: vscode.TextDocument): boolean {
			return NATIVE_COLOR_PROVIDER_LANGUAGES.has(document.languageId);
		}

		private isSassDocument(document: vscode.TextDocument): boolean {
			if (document.languageId === 'sass') {
				return true;
			}
			const extension = this.getDocumentExtension(document);
			if (!extension) {
				return false;
			}
			return SASS_FILE_EXTENSIONS.has(extension);
		}

	private async ensureDocumentIndexed(document: vscode.TextDocument): Promise<void> {
			if (!this.isCssLikeDocument(document)) {
			return;
		}

		const key = document.uri.toString();
		const lastVersion = this.indexedCssDocuments.get(key);
		if (lastVersion === document.version) {
			return;
		}

		try {
			await this.cssParser.parseCSSFile(document);
			this.indexedCssDocuments.set(key, document.version);
		} catch (error) {
			console.error(`${LOG_PREFIX} failed to index inline CSS document ${document.uri.fsPath}`, error);
		}
	}

	/**
	 * Apply CSS variable decorations to an editor.
	 */
	private async applyCSSVariableDecorations(editor: vscode.TextEditor, colorData: ColorData[]): Promise<void> {
		perfLogger.start('applyCSSVariableDecorations');
		const editorKey = this.getEditorKey(editor);
		const existingDecorations = this.stateManager.getDecoration(editorKey);

		const decorationRanges: vscode.Range[] = [];
		const colorsByRange = new Map<string, string>();

		for (const data of colorData) {
			if ((data.isCssVariable && !data.isWrappedInFunction && !data.isCssVariableDeclaration) || data.isCssClass) {
				perfLogger.log('Adding decoration for', {
					text: data.originalText,
					line: data.range.start.line,
					isCssVariable: data.isCssVariable,
					isCssClass: data.isCssClass,
					variableName: data.variableName,
					className: data.cssClassName
				});
				decorationRanges.push(data.range);
				const rangeKey = `${data.range.start.line}:${data.range.start.character}`;
				colorsByRange.set(rangeKey, data.normalizedColor);
			}
		}

		if (decorationRanges.length === 0) {
			if (existingDecorations) {
				for (const decoration of existingDecorations) {
					editor.setDecorations(decoration, []);
				}
			}
			this.stateManager.clearDecorationSnapshots(editorKey);
			this.stateManager.removeDecoration(editorKey);
			return;
		}

		const decorationRangesWithOptions = decorationRanges.map(range => {
			const rangeKey = `${range.start.line}:${range.start.character}`;
			const color = colorsByRange.get(rangeKey);
			return {
				range,
				renderOptions: color ? {
					before: {
						contentText: COLOR_SWATCH_CONTENT,
						backgroundColor: color,
						border: COLOR_SWATCH_BORDER,
						width: `${COLOR_SWATCH_SIZE}px`,
						height: `${COLOR_SWATCH_SIZE}px`,
						margin: COLOR_SWATCH_MARGIN
					}
				} : undefined
			};
		}).filter(item => item.renderOptions);

		if (decorationRangesWithOptions.length > 0) {
			perfLogger.log('Applying decorations to editor', {
				path: editor.document.uri.fsPath,
				count: decorationRangesWithOptions.length,
				chunks: Math.ceil(decorationRangesWithOptions.length / DECORATION_CHUNK_SIZE)
			});
			const chunkCount = Math.ceil(decorationRangesWithOptions.length / DECORATION_CHUNK_SIZE);
			const decorationPool = this.stateManager.ensureDecorationPool(editorKey, chunkCount, () =>
				vscode.window.createTextEditorDecorationType({
					before: {
						contentText: COLOR_SWATCH_CONTENT,
						border: COLOR_SWATCH_BORDER,
						width: `${COLOR_SWATCH_SIZE}px`,
						height: `${COLOR_SWATCH_SIZE}px`,
						margin: COLOR_SWATCH_MARGIN
					},
					backgroundColor: 'transparent'
				})
			);

			let yieldedBetweenChunks = false;
			for (let chunkIndex = 0; chunkIndex < chunkCount; chunkIndex++) {
				const chunkStart = chunkIndex * DECORATION_CHUNK_SIZE;
				const chunk = decorationRangesWithOptions.slice(chunkStart, chunkStart + DECORATION_CHUNK_SIZE);
				const signature = this.computeDecorationChunkSignature(chunk);
				if (this.stateManager.getDecorationChunkSignature(editorKey, chunkIndex) === signature) {
					continue;
				}
				editor.setDecorations(decorationPool[chunkIndex], chunk);
				this.stateManager.setDecorationChunkSignature(editorKey, chunkIndex, signature);

				if (chunkCount > 1 && chunkIndex < chunkCount - 1) {
					if (!yieldedBetweenChunks) {
						perfLogger.log('Yielding between decoration chunks', {
							path: editor.document.uri.fsPath,
							chunkCount,
							yieldDelayMs: DECORATION_CHUNK_YIELD_DELAY_MS
						});
						yieldedBetweenChunks = true;
					}
					await this.delay(DECORATION_CHUNK_YIELD_DELAY_MS);
				}
			}

			for (let poolIndex = chunkCount; poolIndex < decorationPool.length; poolIndex++) {
				editor.setDecorations(decorationPool[poolIndex], []);
			}
			this.stateManager.pruneDecorationSnapshots(editorKey, chunkCount);
		} else {
			perfLogger.log('No decorations to apply for editor', editor.document.uri.fsPath);
		}
		perfLogger.end('applyCSSVariableDecorations');
	}

	/**
	 * Index all CSS files in the workspace.
	 */
	private async indexWorkspaceCSSFiles(): Promise<void> {
		perfLogger.start('indexWorkspaceCSSFiles');
		console.log(`${LOG_PREFIX} ${t(LocalizedStrings.EXTENSION_INDEXING)}`);
		this.registry.clear();

		const cssFiles = await vscode.workspace.findFiles(
			CSS_FILE_PATTERN,
			EXCLUDE_PATTERN,
			MAX_CSS_FILES
		);

		perfLogger.log('CSS files found', cssFiles.length);

		for (const fileUri of cssFiles) {
			try {
				perfLogger.start('parseCSSFile');
				const document = await vscode.workspace.openTextDocument(fileUri);
				await this.cssParser.parseCSSFile(document);
				perfLogger.end('parseCSSFile');
			} catch (error) {
				console.error(
					`${LOG_PREFIX} ${t(LocalizedStrings.EXTENSION_ERROR_CSS_INDEXING, fileUri.fsPath, String(error))}`
				);
			}
		}

		perfLogger.log('Total CSS variables indexed', this.registry.variableCount);
		perfLogger.log('Total CSS classes indexed', this.registry.classCount);
		perfLogger.end('indexWorkspaceCSSFiles');
	}

	/**
	 * Clear color cache for a document.
	 */
	private clearColorCacheForDocument(document: vscode.TextDocument): void {
		this.cache.delete(document.uri.toString());
		this.stateManager.cancelScheduledRefresh(document.uri.toString());
	}

	/**
	 * Clear decorations for a specific editor.
	 */
	private clearDecorationsForEditor(editor: vscode.TextEditor): void {
		this.clearColorCacheForDocument(editor.document);
		const editorKey = this.getEditorKey(editor);
		this.stateManager.cancelScheduledRefresh(editorKey);
		this.stateManager.removeDecoration(editorKey);
	}

	/**
	 * Extract unique colors from workspace CSS variables.
	 */
	private extractWorkspaceColorPalette(): Map<string, vscode.Color> {
		const palette = new Map<string, vscode.Color>();

		for (const varName of this.registry.getAllVariableNames()) {
			const declarations = this.registry.getVariable(varName);
			if (!declarations) {
				continue;
			}

			for (const decl of declarations) {
				const resolved = decl.resolvedValue ?? this.cssParser.resolveNestedVariables(decl.value);
				const parsed = this.colorParser.parseColor(resolved);
				if (parsed) {
					palette.set(parsed.cssString, parsed.vscodeColor);
				}
			}
		}

		return palette;
	}

	private getConfiguredLanguages(): string[] {
		const cached = this.stateManager.getCachedLanguages();
		if (cached) {
			return cached;
		}

		const config = vscode.workspace.getConfiguration('colorbuddy');
		const languages = config.get<string[]>('languages', DEFAULT_LANGUAGES) ?? DEFAULT_LANGUAGES;
		const normalized = Array.isArray(languages) ? [...languages] : [...DEFAULT_LANGUAGES];
		this.stateManager.setCachedLanguages(normalized);
		return normalized;
	}

	/**
	 * Get a unique key for an editor.
	 */
	private getEditorKey(editor: vscode.TextEditor): string {
		return editor.document.uri.toString();
	}

	private async delay(ms: number): Promise<void> {
		await new Promise<void>(resolve => setTimeout(resolve, ms));
	}

	private computeDecorationChunkSignature(chunk: readonly vscode.DecorationOptions[]): string {
		return chunk.map(option => {
			const { range } = option;
			const color = option.renderOptions?.before?.backgroundColor ?? '';
			return `${range.start.line}:${range.start.character}:${color}`;
		}).join('|');
	}

	private getActiveColorAtPosition(colorData: ColorData[], position: vscode.Position): ColorData | undefined {
		return colorData.find(data => data.range.contains(position));
	}

	private getColorSearchCandidates(data: ColorData): string[] {
		const values = new Set<string>();
		if (data.originalText) {
			values.add(data.originalText);
		}
		if (data.normalizedColor) {
			values.add(data.normalizedColor);
		}
		if (data.isCssVariable && data.variableName) {
			values.add(data.variableName);
		}
		if (data.isTailwindClass && data.tailwindClass) {
			values.add(data.tailwindClass);
		}
		if (data.isCssClass && data.cssClassName) {
			values.add(data.cssClassName);
		}

		for (const conversion of collectFormatConversions(this.colorParser, this.colorFormatter, data.vscodeColor, data.format)) {
			values.add(conversion.value);
		}

		return Array.from(values);
	}

	private async searchColorUsages(searchValue: string): Promise<ColorUsageMatch[]> {
		const matches: ColorUsageMatch[] = [];
		const query: vscode.TextSearchQuery = { pattern: searchValue };
		const options: vscode.FindTextInFilesOptions = { useIgnoreFiles: true, useGlobalIgnoreFiles: true };

		await vscode.workspace.findTextInFiles(query, options, (result: vscode.TextSearchResult) => {
			const match = result as vscode.TextSearchMatch;
			if (!match.preview) {
				return;
			}

			const range = Array.isArray(match.ranges) ? match.ranges[0] : match.ranges;
			if (!range) {
				return;
			}

			matches.push({
				uri: match.uri,
				range,
				previewText: match.preview.text.trim()
			});

			if (matches.length >= MAX_COLOR_USAGE_RESULTS) {
				return;
			}
		});

		return matches;
	}

	private async presentColorUsageResults(searchValue: string, matches: ColorUsageMatch[]): Promise<void> {
		const truncated = matches.slice(0, MAX_COLOR_USAGE_RESULTS);
		const items: ColorUsageQuickPickItem[] = truncated.map(match => {
			const relative = vscode.workspace.asRelativePath(match.uri, false);
			const label = `${relative}:${match.range.start.line + 1}`;
			const preview = match.previewText || '(preview unavailable)';
			return {
				label,
				description: preview,
				match
			};
		});

		if (matches.length > MAX_COLOR_USAGE_RESULTS) {
			items.push({
				label: `$(warning) ${matches.length - MAX_COLOR_USAGE_RESULTS} more results not shown`,
				description: '',
				match: undefined
			});
		}

		const selection = await vscode.window.showQuickPick(items, {
			title: t(LocalizedStrings.COMMAND_FIND_USAGES_RESULTS_TITLE),
			matchOnDescription: true,
			placeHolder: searchValue
		});

		if (!selection || !selection.match) {
			return;
		}

		const document = await vscode.workspace.openTextDocument(selection.match.uri);
		const textEditor = await vscode.window.showTextDocument(document, { preview: true });
		textEditor.selection = new vscode.Selection(selection.match.range.start, selection.match.range.end);
		textEditor.revealRange(selection.match.range, vscode.TextEditorRevealType.InCenterIfOutsideViewport);
	}

	private getStatusBarText(_data: ColorData, _primaryValue: string, _metrics: StatusBarMetrics): string {
		return '$(symbol-color)';
	}

	private buildStatusBarTooltip(
		data: ColorData,
		primaryValue: string,
		metrics: StatusBarMetrics,
		report: AccessibilityReport,
		conversions: FormatConversion[]
	): vscode.MarkdownString {
		const markdown = new vscode.MarkdownString('', true);
		markdown.supportHtml = true;
		markdown.isTrusted = true;

		if (data.isCssVariable && data.variableName) {
			markdown.appendMarkdown(`**${t(LocalizedStrings.TOOLTIP_VARIABLE)}:** \`${data.variableName}\`\n\n`);
		}
		if (data.isTailwindClass && data.tailwindClass) {
			markdown.appendMarkdown(`**${t(LocalizedStrings.TOOLTIP_TAILWIND_CLASS)}:** \`${data.tailwindClass}\`\n\n`);
		}
		if (data.isCssClass && data.cssClassName) {
			markdown.appendMarkdown(`**${t(LocalizedStrings.TOOLTIP_CSS_CLASS)}:** \`${data.cssClassName}\`\n\n`);
		}

		markdown.appendMarkdown(`**${t(LocalizedStrings.TOOLTIP_COLOR)}:** \`${primaryValue}\`\n\n`);
		markdown.appendMarkdown(`**${t(LocalizedStrings.TOOLTIP_NORMALIZED)}:** \`${data.normalizedColor}\`\n\n`);
		const insights = getColorInsights(data.vscodeColor);
		markdown.appendMarkdown(`**${t(LocalizedStrings.TOOLTIP_COLOR_NAME)}:** ${insights.name} (\`${insights.hex}\`)\n\n`);
		markdown.appendMarkdown(`**${t(LocalizedStrings.TOOLTIP_BRIGHTNESS)}:** ${insights.brightness}%\n\n`);
		markdown.appendMarkdown(`**${t(LocalizedStrings.STATUS_BAR_USAGE_COUNT)}:** ${metrics.usageCount}\n\n`);
		this.appendCssVariableContexts(markdown, data);
		appendWcagStatusSection(markdown, data.normalizedColor, report);

		appendFormatConversionList(markdown, conversions, { surface: 'statusBar' });

		appendQuickActions(markdown, { surface: 'statusBar' });

		return markdown;
	}

	private appendCssVariableContexts(markdown: vscode.MarkdownString, data: ColorData): void {
		if (!data.isCssVariable || !data.variableName) {
			return;
		}
		const declarations = this.registry.getVariable(data.variableName);
		if (!declarations || declarations.length === 0) {
			return;
		}

		const sorted = [...declarations].sort((a, b) => a.context.specificity - b.context.specificity);
		const rootDecl = sorted.find(decl => decl.context.type === 'root');
		const lightDecl = sorted.find(decl => decl.context.themeHint === 'light');
		const darkDecl = sorted.find(decl => decl.context.themeHint === 'dark');

		if (rootDecl) {
			this.appendVariableDeclaration(markdown, rootDecl, t(LocalizedStrings.TOOLTIP_DEFAULT_THEME));
		}
		if (lightDecl && lightDecl !== rootDecl) {
			this.appendVariableDeclaration(markdown, lightDecl, t(LocalizedStrings.TOOLTIP_LIGHT_THEME));
		}
		if (darkDecl) {
			this.appendVariableDeclaration(markdown, darkDecl, t(LocalizedStrings.TOOLTIP_DARK_THEME));
		}
	}

	private appendVariableDeclaration(markdown: vscode.MarkdownString, declaration: CSSVariableDeclaration, label: string): void {
		const resolved = declaration.resolvedValue ?? this.cssParser.resolveNestedVariables(declaration.value);
		const parsed = this.colorParser.parseColor(resolved);
		if (parsed) {
			const swatchUri = this.createColorSwatchDataUri(parsed.cssString);
			markdown.appendMarkdown(`![color swatch](${swatchUri}) **${label}:** \`${resolved}\`\n\n`);
		} else {
			markdown.appendMarkdown(`**${label}:** \`${resolved}\`\n\n`);
		}
		markdown.appendMarkdown(`${t(LocalizedStrings.TOOLTIP_DEFINED_IN)} [${vscode.workspace.asRelativePath(declaration.uri)}:${declaration.line + 1}](${declaration.uri.toString()}#L${declaration.line + 1})\n\n`);
	}

	private createColorSwatchDataUri(color: string): string {
		const sanitizedColor = color.replace(/'/g, "\\'").replace(/"/g, '\\"');
		const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 10 10"><rect x="0.5" y="0.5" width="9" height="9" fill="${sanitizedColor}" stroke="white" stroke-width="1" /></svg>`;
		const encodedSvg = Buffer.from(svg).toString('base64');
		return `data:image/svg+xml;base64,${encodedSvg}`;
	}

	private async updateStatusBar(editor: vscode.TextEditor | undefined): Promise<void> {
		const requestId = ++this.statusBarRequestId;
		if (!editor) {
			this.statusBarItem.hide();
			return;
		}

		if (!this.shouldDecorate(editor.document)) {
			this.statusBarItem.hide();
			return;
		}

		try {
			const colorData = await this.ensureColorData(editor.document);
			if (requestId !== this.statusBarRequestId) {
				return;
			}

			const position = editor.selection.active;
			const activeColor = colorData.find(data => data.range.contains(position));
			if (!activeColor) {
				this.statusBarItem.hide();
				return;
			}

			const conversions = collectFormatConversions(this.colorParser, this.colorFormatter, activeColor.vscodeColor, activeColor.format);
			const primary = conversions[0]?.value ?? activeColor.normalizedColor;
			const usageCount = getColorUsageCount(colorData, activeColor);
			const accessibilityReport = this.provider.getAccessibilityReport(activeColor.vscodeColor);
			const contrastMetrics = this.extractContrastMetrics(accessibilityReport);
			const metrics: StatusBarMetrics = {
				usageCount,
				contrastWhite: contrastMetrics.contrastWhite,
				contrastBlack: contrastMetrics.contrastBlack
			};
			this.recordStatusBarTelemetry(activeColor, usageCount, accessibilityReport);
			const text = this.getStatusBarText(activeColor, primary, metrics);
			this.statusBarItem.text = text;
			this.statusBarItem.tooltip = this.buildStatusBarTooltip(activeColor, primary, metrics, accessibilityReport, conversions);
			this.statusBarItem.show();
		} catch (error) {
			console.error(`${LOG_PREFIX} failed to update status bar`, error);
			this.statusBarItem.hide();
		}
	}

	private extractContrastMetrics(report: AccessibilityReport): {
		contrastWhite?: ContrastSummary;
		contrastBlack?: ContrastSummary;
	} {
		const result: { contrastWhite?: ContrastSummary; contrastBlack?: ContrastSummary } = {};
		for (const sample of report.samples) {
			const description = sample.backgroundDescription.toLowerCase();
			const summary: ContrastSummary = {
				ratio: sample.contrastRatio,
				level: sample.level
			};
			if (description === '#ffffff') {
				result.contrastWhite = summary;
			} else if (description === '#000000') {
				result.contrastBlack = summary;
			}
		}
		return result;
	}

	private recordStatusBarTelemetry(data: ColorData, usageCount: number, report: AccessibilityReport): void {
		this.telemetry.trackColorInsight({
			surface: 'statusBar',
			colorKind: this.getColorInsightKind(data),
			usageCount,
			contrast: buildContrastTelemetry(report)
		});
	}

	private getColorInsightKind(data: ColorData): ColorInsightColorKind {
		if (data.isTailwindClass && data.tailwindClass) {
			return 'tailwindClass';
		}
		if (data.isCssVariable && data.variableName) {
			return 'cssVariable';
		}
		if (data.isCssClass && data.cssClassName) {
			return 'cssClass';
		}
		return 'literal';
	}

	/**
	 * Dispose all resources.
	 */
	dispose(): void {
		this.stateManager.dispose();
		this.cache.clear();
		this.cssFileWatcher?.dispose();
		this.disposables.forEach(d => d.dispose());
		this.registeredLanguageKey = null;
		this.statusBarItem.dispose();
	}
}
