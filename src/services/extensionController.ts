import * as vscode from 'vscode';
import * as path from 'path';
import type {
	AccessibilityReport,
	ColorData,
	ColorFormat,
	CopyColorCommandPayload,
	ConvertColorCommandPayload,
	CSSVariableDeclaration,
	TestAccessibilityCommandPayload,
	FindUsagesCommandPayload
} from '../types';
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
import { buildAccessibilityMetadata } from '../utils/accessibilityMetadata';
import { getColorUsageCount } from '../utils/colorUsage';
import { getColorInsights } from '../utils/colorInsights';
import { appendWcagStatusSection } from '../utils/accessibilityFormatting';
import {
	AccessibilityViewProvider,
	type AccessibilityReportPresenter,
	type AccessibilityViewData,
	type AccessibilityVariableContext,
	type AccessibilityUsageMatch
} from './accessibilityViewProvider';
import { UsageSearchService, ColorSearchContext } from './panels';

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
	'less',
	'html'
]);

const VOLAR_EXTENSION_ID = 'vue.volar';

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
const COLORBUDDY_CONTAINER_COMMAND = 'workbench.view.extension.colorbuddy';

interface ColorUsageMatch {
	uri: vscode.Uri;
	range: vscode.Range;
	previewText: string;
	relativePath?: string;
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

interface VariableContextSummary {
	label: string;
	value: string;
	resolvedValue: string;
	location: string;
	uri: vscode.Uri;
	line: number;
}

interface AccessibilityCommandColorContext {
	vscodeColor: vscode.Color;
	label: string;
	normalizedColor: string;
	format?: ColorFormat;
	activeColor?: ColorData;
	colorData?: ColorData[];
	metadata?: TestAccessibilityCommandPayload['metadata'];
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
	private readonly accessibilityViewProvider: AccessibilityReportPresenter;
	private readonly usageSearchService: UsageSearchService;
	private readonly disposables: vscode.Disposable[] = [];
	private cssFileWatcher: vscode.FileSystemWatcher | null = null;
	private registeredLanguageKey: string | null = null;
	private indexedCssDocuments: Map<string, number> = new Map();
	private readonly statusBarItem: vscode.StatusBarItem;
	private statusBarRequestId = 0;
	private htmlRefreshInterval: NodeJS.Timeout | null = null;

	constructor(private readonly context: vscode.ExtensionContext) {
		// Initialize services with dependency injection
		this.registry = new Registry();
		this.cache = new Cache();
		this.stateManager = new StateManager();
		this.colorParser = new ColorParser();
		this.colorFormatter = new ColorFormatter();
		this.colorDetector = new ColorDetector(this.registry, this.colorParser);
		this.cssParser = new CSSParser(this.registry, this.colorParser);
		this.provider = new Provider(this.registry, this.colorParser, this.colorFormatter, this.cssParser);
		this.accessibilityViewProvider = new AccessibilityViewProvider(this.context.extensionUri);
		this.usageSearchService = new UsageSearchService(this.colorFormatter);
		this.statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
		this.statusBarItem.name = 'ColorBuddy Active Color';
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
		this.registerViewProviders();
		this.refreshVisibleEditors();
		this.startHtmlRefreshInterval();
		this.context.subscriptions.push(this.statusBarItem);
		this.statusBarItem.hide();
		void this.updateStatusBar(vscode.window.activeTextEditor);

		// Re-apply decorations after other extensions finish loading
		// VS Code may clear our decorations when other language extensions activate
		setTimeout(() => {
			this.refreshVisibleEditors();
		}, 3000);

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
	 * Start periodic refresh for all visible editors to work around external decoration clearing.
	 * Other extensions (especially language servers) may clear decorations when they activate,
	 * so we periodically verify and re-apply them.
	 * 
	 * DISABLED: This was causing severe performance issues (Session 54+).
	 * The 2-second polling refresh was too aggressive. Instead, we rely on:
	 * 1. onDidChangeTextEditorVisibleRanges for scroll/view changes
	 * 2. onDidChangeActiveTextEditor for tab switches
	 * 3. One-time delayed refresh after activation for extension load race conditions
	 */
	private startHtmlRefreshInterval(): void {
		// Completely disabled - was causing performance problems
		// If decorations disappear in HTML files, investigate event-driven solutions instead
		return;
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
			vscode.commands.registerCommand('colorbuddy.findColorUsages', (payload?: FindUsagesCommandPayload) => this.handleFindColorUsagesCommand(payload)),
			vscode.commands.registerCommand('colorbuddy.testColorAccessibility', (payload?: TestAccessibilityCommandPayload) =>
				this.handleTestAccessibilityCommand(payload)
			),
			vscode.commands.registerCommand('colorbuddy.convertColorFormat', (payload?: ConvertColorCommandPayload) =>
				this.handleConvertColorFormatCommand(payload)
			),
			vscode.commands.registerCommand('colorbuddy.bulkConvertColorFormat', (conversions: ConvertColorCommandPayload[]) => 
				this.handleBulkConvertCommand(conversions)
			),
			vscode.commands.registerCommand(EXECUTE_QUICK_ACTION_COMMAND, payload => this.handleExecuteQuickActionCommand(payload)),
			// TEST COMMAND - Directly reveal accessibilityTestResultPanel
			vscode.commands.registerCommand('colorbuddy.testAccessibilityTestResultPanel', async () => {
				console.log('[cb] TEST: Directly revealing accessibilityTestResultPanel');
				try {
					// First, ensure the activity bar container is visible
					await vscode.commands.executeCommand('workbench.view.extension.colorbuddy');
					console.log('[cb] TEST: Container visible');
					
					// Then reveal the specific panel
					await vscode.commands.executeCommand('colorbuddy.accessibilityContrast.focus');
					console.log('[cb] TEST: Panel focus command executed');
				} catch (error) {
					console.error('[cb] TEST: Error opening panel:', error);
				}
			})
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

	private async handleFindColorUsagesCommand(payload?: FindUsagesCommandPayload): Promise<void> {
		console.log(`${LOG_PREFIX} ===== handleFindColorUsagesCommand START =====`);
		console.log(`${LOG_PREFIX} handleFindColorUsagesCommand called with payload:`, JSON.stringify(payload, null, 2));
		try {
			// Get color context from payload or active editor
			const context = await this.resolveFindUsagesColorContext(payload);
			console.log(`${LOG_PREFIX} resolveFindUsagesColorContext returned:`, context ? 'valid context' : 'null');
			if (!context) {
				await vscode.window.showInformationMessage(t(LocalizedStrings.COMMAND_FIND_USAGES_NO_COLOR));
				return;
			}

			// Create color search context for UsageSearchService
			const searchContext: ColorSearchContext = {
				label: context.label,
				colorData: context.colorData,
				normalizedColor: context.colorData.normalizedColor ?? context.colorData.originalText,
				vscodeColor: context.colorData.vscodeColor,
				format: context.colorData.format ?? 'hex'
			};

			const targetPanel = payload?.panel ?? 'contexts';

			// Show "searching" state in panel immediately
			await this.updateFindUsagesPanelSearching(context.label, [], targetPanel, searchContext.normalizedColor);

			// Search with progress notification using UsageSearchService
			const allMatches = await vscode.window.withProgress({
				location: vscode.ProgressLocation.Notification,
				title: `Finding usages of ${context.label}...`,
				cancellable: false
			}, async (progress) => {
				progress.report({ message: 'Searching workspace...', increment: 10 });
				const matches = await this.usageSearchService.searchColorUsages(
					searchContext,
					async (currentMatches: ColorUsageMatch[]) => {
						// Progressive callback - update panel with partial results
						await this.updateFindUsagesPanel(context.label, currentMatches, undefined, targetPanel, searchContext.normalizedColor);
					}
				);
				progress.report({ increment: 90 });
				return matches;
			});
			
			console.log(`${LOG_PREFIX} found ${allMatches.length} total matches`);
			
			// Final update to panel (clears "searching" state)
			await this.updateFindUsagesPanel(context.label, allMatches, undefined, targetPanel, searchContext.normalizedColor);
			
			if (allMatches.length === 0) {
				await vscode.window.showInformationMessage(t(LocalizedStrings.COMMAND_FIND_USAGES_NO_RESULTS, context.label));
				return;
			}
			
		} catch (error) {
			console.error(`${LOG_PREFIX} handleFindColorUsagesCommand error:`, error);
			await vscode.window.showErrorMessage(t(LocalizedStrings.COMMAND_FIND_USAGES_NO_RESULTS, payload?.label ?? 'color'));
		}
	}

	private async resolveFindUsagesColorContext(payload?: FindUsagesCommandPayload): Promise<{ label: string; colorData: ColorData } | null> {
		// If payload provided, parse the color from it
		if (payload?.value) {
			const parsed = this.colorParser.parseColor(payload.value);
			
			if (parsed) {
				// Use the format from parsed result's priority list (first one is the original format)
				const format = parsed.formatPriority?.[0] ?? payload.format ?? 'hex';
				
				// Extract metadata to populate colorData properties
				const metadata = payload.metadata;
				const variableName = metadata?.variableName;
				const tailwindClass = metadata?.tailwindClass;
				const cssClassName = metadata?.cssClassName;
				
				const colorData: ColorData = {
					range: new vscode.Range(0, 0, 0, 0),
					// CRITICAL: Use payload.label (the actual text clicked) as originalText,
					// not payload.value (the normalized color). This ensures we search for
					// what the user actually clicked on, guaranteeing at least 1 result.
					originalText: payload.label ?? payload.value,
					normalizedColor: parsed.cssString,
					vscodeColor: parsed.vscodeColor,
					format: format,
					isCssVariable: !!variableName,
					variableName: variableName,
					isTailwindClass: !!tailwindClass,
					tailwindClass: tailwindClass,
					isCssClass: !!cssClassName,
					cssClassName: cssClassName
				};
				console.log(`${LOG_PREFIX} Created colorData:`, colorData);
				return {
					label: payload.label ?? payload.value,
					colorData
				};
			}
		}

		// Otherwise, try to get from active editor
		const editor = vscode.window.activeTextEditor;
		if (!editor) {
			return null;
		}

		const colorData = await this.ensureColorData(editor.document);
		const activeColor = this.getActiveColorAtPosition(colorData, editor.selection.active);
		if (!activeColor) {
			return null;
		}

		return {
			label: editor.document.getText(activeColor.range),
			colorData: activeColor
		};
	}


	private async handleTestAccessibilityCommand(payload?: TestAccessibilityCommandPayload): Promise<void> {
		console.log(`${LOG_PREFIX} ========================================`);
		console.log(`${LOG_PREFIX} handleTestAccessibilityCommand START`);
		console.log(`${LOG_PREFIX} Payload received:`, JSON.stringify(payload, null, 2));
		console.log(`${LOG_PREFIX} Panel from payload:`, payload?.panel);
		console.log(`${LOG_PREFIX} ========================================`);
		
		try {
			const context = await this.resolveAccessibilityColorContext(payload);
			if (!context) {
				console.log(`${LOG_PREFIX} No context resolved, aborting`);
				return;
			}

			const report = this.provider.getAccessibilityReport(context.vscodeColor);
			const conversions = collectFormatConversions(this.colorParser, this.colorFormatter, context.vscodeColor, context.format);
			const insights = getColorInsights(context.vscodeColor);
			const usageCount = this.resolveUsageCount(context);
			const cssVariableName = this.resolveCssVariableName(context);
			const variableContexts = cssVariableName ? this.getVariableContextSummaries(cssVariableName) : [];
			const tailwindClass = context.activeColor?.tailwindClass ?? context.metadata?.tailwindClass;
			const cssClassName = context.activeColor?.cssClassName ?? context.metadata?.cssClassName;
			const data: AccessibilityViewData = {
				label: context.label || context.normalizedColor,
				normalizedColor: context.normalizedColor,
				colorName: insights.name,
				colorHex: insights.hex,
				brightness: insights.brightness,
				report,
				conversions,
				usageCount,
				cssVariableName,
				tailwindClass,
				cssClassName,
				variableContexts: variableContexts.length ? variableContexts : undefined,
				section: payload?.panel ?? 'summary'
			};

			const panel = payload?.panel ?? 'summary';
			console.log(`${LOG_PREFIX} About to present accessibility report for panel: "${panel}"`);
			await this.presentAccessibilityReport(data, panel);
			console.log(`${LOG_PREFIX} presentAccessibilityReport completed`);
		} catch (error) {
			console.error(`${LOG_PREFIX} failed to test color accessibility`, error);
			await vscode.window.showErrorMessage(t(LocalizedStrings.COMMAND_TEST_ACCESSIBILITY_ERROR));
		}
	}

	private async resolveAccessibilityColorContext(payload?: TestAccessibilityCommandPayload): Promise<AccessibilityCommandColorContext | null> {
		if (payload?.value) {
			const parsed = this.colorParser.parseColor(payload.value);
			if (!parsed) {
				await vscode.window.showInformationMessage(t(LocalizedStrings.COMMAND_TEST_ACCESSIBILITY_NO_COLOR));
				return null;
			}
			return {
				vscodeColor: parsed.vscodeColor,
				label: payload.label ?? payload.value,
				normalizedColor: parsed.cssString,
				format: payload.format ?? parsed.formatPriority[0],
				metadata: payload.metadata
			};
		}

		const editor = vscode.window.activeTextEditor;
		if (!editor) {
			await vscode.window.showInformationMessage(t(LocalizedStrings.COMMAND_TEST_ACCESSIBILITY_NO_EDITOR));
			return null;
		}

		const colorData = await this.ensureColorData(editor.document);
		const activeColor = this.getActiveColorAtPosition(colorData, editor.selection.active);
		if (!activeColor) {
			await vscode.window.showInformationMessage(t(LocalizedStrings.COMMAND_TEST_ACCESSIBILITY_NO_COLOR));
			return null;
		}

		return {
			vscodeColor: activeColor.vscodeColor,
			label: activeColor.originalText,
			normalizedColor: activeColor.normalizedColor ?? activeColor.originalText,
			format: activeColor.format,
			activeColor,
			colorData,
			metadata: buildAccessibilityMetadata(activeColor)
		};
	}

	private async presentAccessibilityReport(data: AccessibilityViewData, panel: 'summary' | 'contrast' | 'contexts' | 'formats' = 'summary'): Promise<void> {
		console.log(`${LOG_PREFIX} presentAccessibilityReport called with panel: "${panel}"`);
		console.log(`${LOG_PREFIX} Updating report data...`);
		this.accessibilityViewProvider.updateReport(data, panel);
		console.log(`${LOG_PREFIX} Report data updated`);
		
		try {
			console.log(`${LOG_PREFIX} Executing command: ${COLORBUDDY_CONTAINER_COMMAND}`);
			await vscode.commands.executeCommand(COLORBUDDY_CONTAINER_COMMAND);
			console.log(`${LOG_PREFIX} Container command executed`);
			
			// Small delay to ensure container is ready
			await new Promise(resolve => setTimeout(resolve, 50));
			
			console.log(`${LOG_PREFIX} Revealing section: "${panel}"`);
			this.accessibilityViewProvider.revealSection(panel, false);
			console.log(`${LOG_PREFIX} Section revealed`);
		} catch (error) {
			console.error(`${LOG_PREFIX} failed to reveal accessibility report view`, error);
			console.error(`${LOG_PREFIX} Error details:`, error);
		}
	}

	private async handleConvertColorFormatCommand(payload?: ConvertColorCommandPayload): Promise<void> {
		if (payload) {
			const handled = await this.tryConvertColorFromPayload(payload);
			if (handled) {
				return;
			}
		}
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

			await this.performColorConversion(editor, activeColor.range, activeColor.vscodeColor, activeColor.format);
		} catch (error) {
			console.error(`${LOG_PREFIX} failed to convert color`, error);
			await vscode.window.showErrorMessage(t(LocalizedStrings.COMMAND_CONVERT_COLOR_ERROR));
		}
	}

	private async tryConvertColorFromPayload(payload: ConvertColorCommandPayload): Promise<boolean> {
		if (!payload.uri || !payload.range || !payload.normalizedColor) {
			return false;
		}

		try {
			const uri = vscode.Uri.parse(payload.uri);
			let editor = vscode.window.visibleTextEditors.find(ed => ed.document.uri.toString() === uri.toString());
			
			const start = new vscode.Position(payload.range.start.line, payload.range.start.character);
			const end = new vscode.Position(payload.range.end.line, payload.range.end.character);
			const range = new vscode.Range(start, end);
			
			if (!editor) {
				const document = await vscode.workspace.openTextDocument(uri);
				// Open document with selection at the target range
				editor = await vscode.window.showTextDocument(document, { 
					preview: false,
					selection: range
				});
			}

			if (!editor) {
				return true;
			}
			
			// Validate range is within document bounds
			if (start.line >= editor.document.lineCount || end.line >= editor.document.lineCount) {
				await vscode.window.showInformationMessage(t(LocalizedStrings.COMMAND_CONVERT_COLOR_NO_COLOR));
				return true;
			}
			
			const candidate = payload.normalizedColor || payload.originalText || editor.document.getText(range);
			const parsed = this.colorParser.parseColor(candidate);
			if (!parsed) {
				await vscode.window.showInformationMessage(t(LocalizedStrings.COMMAND_CONVERT_COLOR_NO_COLOR));
				return true;
			}

			// If source is 'panel', do the conversion directly (user clicked a format in the panel)
			// NO QuickPicks, NO dialogs - just silent replacement at the exact location
			// Otherwise, show the formats panel (user clicked Convert quick action)
			if (payload.source === 'panel' && payload.format) {
				const formatted = this.colorFormatter.formatByFormat(parsed.vscodeColor, payload.format);
				if (formatted) {
					const existingText = editor.document.getText(range);
					const hasTrailingSemicolon = existingText.trimEnd().endsWith(';');
					const formattedWithSemicolon = hasTrailingSemicolon && !formatted.trimEnd().endsWith(';')
						? `${formatted};`
						: formatted;

					await editor.edit(editBuilder => {
						editBuilder.replace(range, formattedWithSemicolon);
					});

					// Update selection/highlight to the new value
					const updatedRange = new vscode.Range(range.start, range.start.translate(0, formattedWithSemicolon.length));
					editor.selection = new vscode.Selection(updatedRange.start, updatedRange.end);
					editor.revealRange(updatedRange, vscode.TextEditorRevealType.InCenterIfOutsideViewport);

					// Update panel data model (needed for checkmark logic)
					const updatedPreview = editor.document.lineAt(updatedRange.start.line).text.trim();
					const lastData = this.accessibilityViewProvider.getLastRenderedData();
					const insights = getColorInsights(parsed.vscodeColor);
					const conversions = collectFormatConversions(this.colorParser, this.colorFormatter, parsed.vscodeColor, payload.format);
					
					// Preserve usage match ranges (stable search results) but update preview text at conversion location
					const updatedMatches = (lastData?.usageMatches && lastData.usageMatches.length > 0)
						? lastData.usageMatches.map(match => {
							const sameLocation = match.uri.toString() === uri.toString()
								&& match.range.start.line === range.start.line
								&& match.range.start.character === range.start.character;
							return sameLocation
								? {
									...match,
									// Keep original range (for stable display), but update preview to show converted value
									previewText: updatedPreview,
									matchText: formattedWithSemicolon
								}
								: match;
						})
						: [];

					const panelData: AccessibilityViewData = {
						label: payload.originalText ?? formattedWithSemicolon,
						normalizedColor: insights.hex,
						colorName: insights.name,
						colorHex: insights.hex,
						brightness: insights.brightness,
						report: { samples: [] } as any,
						conversions,
						currentFormatValue: formattedWithSemicolon,
						editorRange: updatedRange,
						editorUri: uri.toString(),
						usageMatches: updatedMatches
					};

					// Update panel with new data (includes visual-only update for smooth UX)
					this.accessibilityViewProvider.updateReport(panelData, 'formats');
					
					// Also send visual-only update message for smooth transition
					this.accessibilityViewProvider.updateCurrentFormat(payload.format);
				}
			} else {
				await this.performColorConversion(editor, range, parsed.vscodeColor, parsed.formatPriority[0]);
			}
			return true;
		} catch (error) {
			console.error(`${LOG_PREFIX} failed to convert color from payload`, error);
			await vscode.window.showErrorMessage(t(LocalizedStrings.COMMAND_CONVERT_COLOR_ERROR));
			return true;
		}
	}

	/**
	 * Handle bulk conversion of multiple color occurrences.
	 */
	private async handleBulkConvertCommand(conversions: ConvertColorCommandPayload[]): Promise<void> {
		if (!conversions || !Array.isArray(conversions) || conversions.length === 0) {
			return;
		}

		console.log(`${LOG_PREFIX} Starting bulk conversion for ${conversions.length} items`);

		try {
			// Group conversions by URI to optimize edits
			const groupedByUri = new Map<string, ConvertColorCommandPayload[]>();
			for (const conv of conversions) {
				const list = groupedByUri.get(conv.uri) || [];
				list.push(conv);
				groupedByUri.set(conv.uri, list);
			}

			let totalConverted = 0;

			// Wrap in progress notification
			await vscode.window.withProgress({
				location: vscode.ProgressLocation.Notification,
				title: `Converting ${conversions.length} color occurrences...`,
				cancellable: false
			}, async (progress) => {
				const increment = 100 / groupedByUri.size;

				for (const [uriStr, siteConversions] of groupedByUri.entries()) {
					const uri = vscode.Uri.parse(uriStr);
					const doc = await vscode.workspace.openTextDocument(uri);
					const editor = await vscode.window.showTextDocument(doc, { preview: false });

					// Sort conversions for this file in REVERSE order (bottom to top)
					// to avoid range shifts during replacement
					const sortedConversions = [...siteConversions].sort((a, b) => {
						if (b.range.start.line !== a.range.start.line) {
							return b.range.start.line - a.range.start.line;
						}
						return b.range.start.character - a.range.start.character;
					});

					await editor.edit(editBuilder => {
						for (const conv of sortedConversions) {
							const parsed = this.colorParser.parseColor(conv.normalizedColor || conv.originalText || '');
							if (parsed && conv.format) {
								const formatted = this.colorFormatter.formatByFormat(parsed.vscodeColor, conv.format);
								if (formatted) {
									const start = new vscode.Position(conv.range.start.line, conv.range.start.character);
									const end = new vscode.Position(conv.range.end.line, conv.range.end.character);
									const range = new vscode.Range(start, end);
									
									const existingText = doc.getText(range);
									const hasTrailingSemicolon = existingText.trimEnd().endsWith(';');
									const formattedWithSemicolon = hasTrailingSemicolon && !formatted.trimEnd().endsWith(';')
										? `${formatted};`
										: formatted;

									editBuilder.replace(range, formattedWithSemicolon);
									totalConverted++;
								}
							}
						}
					});

					progress.report({ increment });
				}
			});

			await vscode.window.showInformationMessage(`Successfully converted ${totalConverted} occurrences across ${groupedByUri.size} file(s).`);
			
			// Refresh all editors to update decorations
			this.refreshVisibleEditors();
			
		} catch (error) {
			console.error(`${LOG_PREFIX} Bulk conversion failed`, error);
			await vscode.window.showErrorMessage('Bulk conversion failed. Check console for details.');
		}
	}

	/**
	 * Helper to detect if text looks like a Tailwind class
	 */
	// @ts-ignore - keeping for potential future use
	private looksLikeTailwindClass(text: string): boolean {
		// Simple heuristic: bg-, text-, border- prefixes without parentheses
		return /^(bg|text|border)-[\w-]+$/.test(text) && !text.includes('(');
	}

	private async performColorConversion(
		editor: vscode.TextEditor,
		range: vscode.Range,
		color: vscode.Color,
		format?: ColorFormat
	): Promise<void> {
		const conversions = collectFormatConversions(this.colorParser, this.colorFormatter, color, format);
		if (conversions.length === 0) {
			await vscode.window.showInformationMessage(t(LocalizedStrings.COMMAND_CONVERT_COLOR_NO_ALTERNATIVES));
			return;
		}

		const currentValue = editor.document.getText(range);
		const insights = getColorInsights(color);
		
		// Get full color data from document to get all color properties (CSS variable, Tailwind class, etc.)
		const fullColorData = await this.ensureColorData(editor.document);
		const colorDataAtCursor = fullColorData.find(cd => 
			cd.range.start.line === range.start.line &&
			cd.range.start.character === range.start.character
		);
		
		// Build search candidates with all properties if we found the color data
		const colorData: ColorData = colorDataAtCursor || {
			range,
			originalText: currentValue,
			normalizedColor: insights.hex,
			vscodeColor: color,
			format: format || 'hex'
		};
		
		// Use UsageSearchService for workspace search
		const searchContext: ColorSearchContext = {
			label: currentValue,
			colorData: colorData,
			normalizedColor: insights.hex,
			vscodeColor: color,
			format: format || 'hex'
		};
		
		let usageMatches: AccessibilityUsageMatch[] = [];
		const allMatches = await this.usageSearchService.searchColorUsages(searchContext);
		
		if (allMatches.length > 0) {
			// Cache opened documents per URI to avoid repeated reads
			const docCache = new Map<string, vscode.TextDocument>();
			const getDoc = async (uri: vscode.Uri) => {
				const key = uri.toString();
				if (docCache.has(key)) return docCache.get(key)!;
				const doc = await vscode.workspace.openTextDocument(uri);
				docCache.set(key, doc);
				return doc;
			};
			
			usageMatches = [];
			for (const match of allMatches) {
				let matchText = '';
				let isConvertible = false;
				try {
					const doc = await getDoc(match.uri);
					matchText = doc.getText(match.range);
					isConvertible = !!this.colorParser.parseColor(matchText);
				} catch (err) {
					// If we can't read the text, default to non-convertible
					isConvertible = false;
				}
				usageMatches.push({
					uri: match.uri,
					range: match.range,
					previewText: match.previewText,
					relativePath: vscode.workspace.asRelativePath(match.uri, false),
					matchText,
					isConvertible
				});
			}
		}
		
		// Create data for the formats panel
		const data: AccessibilityViewData = {
			label: currentValue,
			normalizedColor: insights.hex,
			colorName: insights.name,
			colorHex: insights.hex,
			brightness: insights.brightness,
			report: { samples: [] } as any, // Not needed for formats
			conversions,
			currentFormatValue: currentValue,
			editorRange: range,
			editorUri: editor.document.uri.toString(),
			usageMatches
		};

		// Update formats panel with conversion options and usage matches
		this.accessibilityViewProvider.updateReport(data, 'formats');
		this.accessibilityViewProvider.revealSection('formats', true);
	}

	/**
	 * Handle convert-at-definition for CSS variables, Tailwind classes, and CSS classes.
	 * This is Option 2: navigate to the definition and convert the actual color value.
	 */
	// DISABLED: Convert-at-definition causes QuickPick dialogs
	// User wants silent replacement at exact location only
	// @ts-ignore - keeping method for potential future use
	private async handleConvertAtDefinition(
		colorData: ColorData,
		targetFormat: ColorFormat
	): Promise<boolean> {
		try {
			// 1. Look up definitions in Registry
			const definitions = this.getDefinitionsForColorData(colorData);
			
			if (definitions.length === 0) {
				await vscode.window.showErrorMessage('Could not find definition for this color reference');
				return true;
			}
			
			// 2. Handle multiple definitions (show QuickPick)
			let selectedDef = definitions[0];
			if (definitions.length > 1) {
				const selected = await this.showDefinitionQuickPick(definitions);
				if (!selected) {
					return true; // User cancelled
				}
				selectedDef = selected;
			}
			
			// 3. Open definition file
			const doc = await vscode.workspace.openTextDocument(selectedDef.uri);
			const editor = await vscode.window.showTextDocument(doc);
			
			// 4. Parse definition line to extract color value
			const lineText = doc.lineAt(selectedDef.line).text;
			const colorValue = this.extractColorFromDefinition(lineText, colorData);
			
			if (!colorValue) {
				await vscode.window.showErrorMessage('Could not extract color value from definition');
				return true;
			}
			
			// 5. Handle nested variables (resolve var() references)
			const resolvedValue = await this.resolveNestedVariable(colorValue);
			
			// 6. Parse and convert color
			const parsed = this.colorParser.parseColor(resolvedValue);
			if (!parsed) {
				await vscode.window.showErrorMessage('Invalid color value in definition');
				return true;
			}
			
			const converted = this.colorFormatter.formatByFormat(parsed.vscodeColor, targetFormat);
			if (!converted) {
				await vscode.window.showErrorMessage('Failed to convert color format');
				return true;
			}
			
			// 7. Calculate exact range in definition line
			const colorRange = this.findColorRangeInLine(lineText, resolvedValue, selectedDef.line);
			
			// 8. Apply edit
			const success = await editor.edit(editBuilder => {
				editBuilder.replace(colorRange, converted);
			});
			
			if (success) {
				// 9. Show success notification with file location
				const fileName = selectedDef.uri.path.split('/').pop() || 'file';
				const varName = colorData.variableName || colorData.tailwindClass || colorData.cssClassName || 'color';
				await vscode.window.showInformationMessage(
					`Converted ${varName} to ${targetFormat} in ${fileName}:${selectedDef.line + 1}`
				);
			}
			
			return true;
		} catch (error) {
			console.error(`${LOG_PREFIX} failed to convert at definition`, error);
			await vscode.window.showErrorMessage('Failed to convert color at definition');
			return true;
		}
	}

	/**
	 * Get definitions from ColorData by looking up in Registry
	 */
	private getDefinitionsForColorData(data: ColorData): Array<{uri: vscode.Uri, line: number, value: string}> {
		if (data.variableName) {
			const decls = this.registry.getVariable(data.variableName);
			if (decls) {
				return decls.map(d => ({uri: d.uri, line: d.line, value: d.value}));
			}
		}
		if (data.tailwindClass) {
			const decls = this.registry.getVariable(data.tailwindClass); // Tailwind classes stored as variables
			if (decls) {
				return decls.map(d => ({uri: d.uri, line: d.line, value: d.value}));
			}
		}
		if (data.cssClassName) {
			const decls = this.registry.getClass(data.cssClassName);
			if (decls) {
				return decls.map(d => ({uri: d.uri, line: d.line, value: d.value}));
			}
		}
		return [];
	}

	/**
	 * Show QuickPick for selecting which definition to convert
	 */
	private async showDefinitionQuickPick(definitions: Array<{uri: vscode.Uri, line: number, value: string}>): Promise<{uri: vscode.Uri, line: number, value: string} | undefined> {
		const items = definitions.map(def => ({
			label: def.uri.path.split('/').pop() || 'file',
			description: `Line ${def.line + 1}`,
			detail: def.value,
			definition: def
		}));
		
		const selected = await vscode.window.showQuickPick(items, {
			placeHolder: 'Multiple definitions found. Select one:'
		});
		
		return selected?.definition;
	}

	/**
	 * Extract color value from definition line
	 */
	private extractColorFromDefinition(lineText: string, colorData: ColorData): string {
		// Parse CSS: --primary: #3b82f6; → #3b82f6
		// Parse Tailwind config: 'primary': '#3b82f6' → #3b82f6
		// Parse CSS class: .primary { color: #3b82f6; } → #3b82f6
		
		if (colorData.variableName) {
			// Match: --name: VALUE;
			const match = lineText.match(/--[\w-]+\s*:\s*([^;]+)/);
			return match?.[1].trim() || '';
		}
		
		if (colorData.cssClassName) {
			// Match: color: VALUE; or background-color: VALUE;
			const match = lineText.match(/(?:color|background(?:-color)?)\s*:\s*([^;]+)/);
			return match?.[1].trim() || '';
		}
		
		if (colorData.tailwindClass) {
			// Match: 'name': 'VALUE' or "name": "VALUE"
			const match = lineText.match(/['"][\w-]+['"]\s*:\s*['"]([^'"]+)['"]/);
			return match?.[1].trim() || '';
		}
		
		return '';
	}

	/**
	 * Resolve nested var() references
	 */
	private async resolveNestedVariable(value: string): Promise<string> {
		// If value is var(--name), recursively resolve
		const varMatch = value.match(/var\(\s*(--[\w-]+)\s*\)/);
		if (!varMatch) {
			return value;
		}
		
		const nestedVar = varMatch[1];
		const decls = this.registry.getVariable(nestedVar);
		if (!decls || decls.length === 0) {
			return value;
		}
		
		// Use first declaration (highest specificity)
		const nestedValue = decls[0].value;
		
		// Check for circular reference using visited set
		return this.cssParser.resolveNestedVariables(nestedValue, {
			visited: new Set([nestedVar])
		});
	}

	/**
	 * Find exact range of color value in line
	 */
	private findColorRangeInLine(lineText: string, colorValue: string, lineNumber: number): vscode.Range {
		const startChar = lineText.indexOf(colorValue);
		if (startChar === -1) {
			// Fallback: replace entire value after colon
			const colonIdx = lineText.indexOf(':');
			const semicolonIdx = lineText.indexOf(';', colonIdx);
			return new vscode.Range(
				lineNumber, colonIdx + 1,
				lineNumber, semicolonIdx > 0 ? semicolonIdx : lineText.length
			);
		}
		
		return new vscode.Range(
			lineNumber, startChar,
			lineNumber, startChar + colorValue.length
		);
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
		console.log(`[cb] ====== QUICK ACTION CLICKED ======`);
		console.log(`[cb] Payload:`, JSON.stringify(payload, null, 2));
		
		if (!payload || typeof payload.target !== 'string') {
			console.warn(`${LOG_PREFIX} quick action invoked without a valid target`, payload);
			return;
		}

		if (payload.target === EXECUTE_QUICK_ACTION_COMMAND) {
			console.warn(`${LOG_PREFIX} quick action target cannot be ${EXECUTE_QUICK_ACTION_COMMAND}`);
			return;
		}

		const args = Array.isArray(payload.args) ? payload.args : [];
		console.log(`[cb] Executing: ${payload.target}`);
		console.log(`[cb] Args:`, JSON.stringify(args, null, 2));

		try {
			await vscode.commands.executeCommand(payload.target, ...args);
			console.log(`[cb] Command completed successfully`);
		} catch (error) {
			console.error(`${LOG_PREFIX} EXCEPTION:`, error);
			await vscode.window.showErrorMessage(`Failed to execute ${payload.target}: ${String(error)}`);
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
					// For CSS/SCSS/LESS: only provide Tailwind colors
					// VS Code already has native color providers for literal colors
					allowedFormats = new Set<ColorFormat>(['tailwind']);
				} else if (this.isSassDocument(document)) {
					allowedFormats = new Set<ColorFormat>(['tailwind', 'hsl', 'hsla']);
				} else if (document.languageId === 'html') {
					// For HTML: exclude colors in <style> tags and inline styles to avoid double swatches
					// VS Code's native provider handles those, but gets cleared in <script> tags
					const text = document.getText();
					const filteredColorData = colorData.filter(data => {
						const offset = document.offsetAt(data.range.start);
						
						// Check if inside <style>...</style> block
						const styleTagRegex = /<style\b[^>]*>([\s\S]*?)<\/style>/gi;
						let match: RegExpExecArray | null;
						while ((match = styleTagRegex.exec(text)) !== null) {
							const contentStart = match.index + match[0].indexOf('>') + 1;
							const contentEnd = match.index + match[0].lastIndexOf('</style>');
							if (offset >= contentStart && offset < contentEnd) {
								return false; // Inside style tag - exclude
							}
						}
						
						// Check if in inline style attribute
						const line = document.lineAt(data.range.start.line).text;
						if (line.includes('style=')) {
							// More precise check: is this color within a style attribute?
							const lineStartOffset = document.offsetAt(new vscode.Position(data.range.start.line, 0));
							const relativeOffset = offset - lineStartOffset;
							const styleAttrMatch = /style\s*=\s*["'][^"']*["']/gi.exec(line);
							if (styleAttrMatch && relativeOffset >= styleAttrMatch.index && relativeOffset < styleAttrMatch.index + styleAttrMatch[0].length) {
								return false; // Inside inline style - exclude
							}
						}
						
						return true; // Not in style context - include
					});
					return this.provider.provideDocumentColors(filteredColorData);
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

		// Register definition provider for ctrl+click navigation to CSS variable/class definitions
		const definitionProvider = vscode.languages.registerDefinitionProvider(selector, {
			provideDefinition: async (document, position) => {
				const colorData = await this.ensureColorData(document);
				const activeColor = colorData.find(data => data.range.contains(position));
				
				if (!activeColor) {
					return undefined;
				}

				const locations: vscode.Location[] = [];

				// Find CSS variable definitions
				if (activeColor.isCssVariable && activeColor.variableName) {
					const declarations = this.registry.getVariable(activeColor.variableName);
					if (declarations && declarations.length > 0) {
						for (const decl of declarations) {
							const position = new vscode.Position(decl.line, 0);
							locations.push(new vscode.Location(decl.uri, position));
						}
					}
				}

				// Find Tailwind/CSS class definitions
				if (activeColor.isCssClass && activeColor.cssClassName) {
					const declarations = this.registry.getClass(activeColor.cssClassName);
					if (declarations && declarations.length > 0) {
						for (const decl of declarations) {
							const position = new vscode.Position(decl.line, 0);
							locations.push(new vscode.Location(decl.uri, position));
						}
					}
				}

				// Find Tailwind class definitions
				if (activeColor.isTailwindClass && activeColor.tailwindClass) {
					const declarations = this.registry.getVariable(activeColor.tailwindClass);
					if (declarations && declarations.length > 0) {
						for (const decl of declarations) {
							const position = new vscode.Position(decl.line, 0);
							locations.push(new vscode.Location(decl.uri, position));
						}
					}
				}

				return locations.length > 0 ? locations : undefined;
			}
		});

		this.stateManager.addProviderSubscription(hoverProvider);
		this.stateManager.addProviderSubscription(colorProvider);
		this.stateManager.addProviderSubscription(definitionProvider);
		this.context.subscriptions.push(hoverProvider, colorProvider, definitionProvider);
	}

	private registerViewProviders(): void {
		for (const provider of this.accessibilityViewProvider.getSectionProviders()) {
			const registration = vscode.window.registerWebviewViewProvider(provider.viewId, provider, {
				webviewOptions: {
					retainContextWhenHidden: true
				}
			});
			this.context.subscriptions.push(registration);
			this.disposables.push(registration);
		}
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

		private isVolarActive(): boolean {
			return vscode.extensions.getExtension(VOLAR_EXTENSION_ID)?.isActive === true;
		}

		private isNativeColorProviderDocument(document: vscode.TextDocument): boolean {
			if (NATIVE_COLOR_PROVIDER_LANGUAGES.has(document.languageId)) {
				return true;
			}
			if (document.languageId === 'vue' && this.isVolarActive()) {
				return true;
			}
			return false;
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
			// Index CSS-like documents and HTML files (for <style> tags)
			if (!this.isCssLikeDocument(document) && document.languageId !== 'html') {
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
		const htmlScriptRanges = this.getHtmlScriptTagRanges(editor.document);

		const decorationRanges: vscode.Range[] = [];
		const colorsByRange = new Map<string, string>();

		for (const data of colorData) {
			const shouldDecorateCssReference = (data.isCssVariable && !data.isWrappedInFunction && !data.isCssVariableDeclaration) || data.isCssClass;
			const shouldDecorateHtmlScriptLiteral = this.shouldDecorateHtmlScriptLiteral(editor.document, data, htmlScriptRanges);

			if (shouldDecorateCssReference || shouldDecorateHtmlScriptLiteral) {
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
			const decorationPool = this.stateManager.ensureDecorationPool(editorKey, chunkCount, () => {
				const decorationType = vscode.window.createTextEditorDecorationType({
					before: {
						contentText: COLOR_SWATCH_CONTENT,
						border: COLOR_SWATCH_BORDER,
						width: `${COLOR_SWATCH_SIZE}px`,
						height: `${COLOR_SWATCH_SIZE}px`,
						margin: COLOR_SWATCH_MARGIN
					},
					backgroundColor: 'transparent'
				});
				// Register with extension context to prevent garbage collection
				this.context.subscriptions.push(decorationType);
				return decorationType;
			});

			let yieldedBetweenChunks = false;
			for (let chunkIndex = 0; chunkIndex < chunkCount; chunkIndex++) {
				const chunkStart = chunkIndex * DECORATION_CHUNK_SIZE;
				const chunk = decorationRangesWithOptions.slice(chunkStart, chunkStart + DECORATION_CHUNK_SIZE);
				editor.setDecorations(decorationPool[chunkIndex], chunk);

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
			this.stateManager.clearDecorationSnapshots(editorKey);
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

	private shouldDecorateHtmlScriptLiteral(
		document: vscode.TextDocument,
		data: ColorData,
		scriptRanges: ReadonlyArray<{ start: number; end: number }>
	): boolean {
		if (document.languageId !== 'html') {
			return false;
		}

		if (data.isCssVariable || data.isCssClass) {
			return false;
		}

		const offset = document.offsetAt(data.range.start);
		return scriptRanges.some(range => offset >= range.start && offset < range.end);
	}

	private getHtmlScriptTagRanges(document: vscode.TextDocument): Array<{ start: number; end: number }> {
		if (document.languageId !== 'html') {
			return [];
		}

		const text = document.getText();
		const lowerText = text.toLowerCase();
		const ranges: Array<{ start: number; end: number }> = [];
		let searchFrom = 0;

		while (searchFrom < lowerText.length) {
			const openTagStart = lowerText.indexOf('<script', searchFrom);
			if (openTagStart === -1) {
				break;
			}

			const openTagEnd = lowerText.indexOf('>', openTagStart);
			if (openTagEnd === -1) {
				break;
			}

			const closeTagStart = lowerText.indexOf('</script>', openTagEnd + 1);
			if (closeTagStart === -1) {
				break;
			}

			ranges.push({ start: openTagEnd + 1, end: closeTagStart });
			searchFrom = closeTagStart + '</script>'.length;
		}

		return ranges;
	}

	private getActiveColorAtPosition(colorData: ColorData[], position: vscode.Position): ColorData | undefined {
		return colorData.find(data => data.range.contains(position));
	}

	// Color search methods removed - now handled by UsageSearchService

	private async updateFindUsagesPanelSearching(colorLabel: string, searchCandidates: string[], targetPanel: 'contexts' | 'formats' = 'contexts', normalizedColor?: string): Promise<void> {
		console.log(`${LOG_PREFIX} preparing to search for ${searchCandidates.length} color format variations of "${colorLabel}"`);
		
		// Show initial "searching" state with format variations
		await this.updateFindUsagesPanel(colorLabel, [], searchCandidates, targetPanel, normalizedColor);
	}

	private async updateFindUsagesPanel(searchValue: string, matches: ColorUsageMatch[], searchCandidates?: string[], targetPanel: 'contexts' | 'formats' = 'contexts', normalizedColor?: string): Promise<void> {
		// Convert matches to the format expected by the view
		const usageMatches = matches.map(match => ({
			uri: match.uri,
			range: match.range,
			previewText: match.previewText,
			relativePath: vscode.workspace.asRelativePath(match.uri, false),
			isConvertible: true
		}));

		// If we're targeting the formats panel, we need real color data for conversions
		let conversions: FormatConversion[] = [];
		let insights = { name: '', hex: '', brightness: 0 };
		
		if (targetPanel === 'formats' || searchCandidates) {
			// Use normalizedColor if provided (for CSS vars/classes), otherwise try searchValue
			const colorToParse = normalizedColor || searchValue;
			const parsed = this.colorParser.parseColor(colorToParse);
			if (parsed) {
				conversions = collectFormatConversions(this.colorParser, this.colorFormatter, parsed.vscodeColor, parsed.formatPriority[0]);
				insights = getColorInsights(parsed.vscodeColor);
			}
		}

		// Create a unified data object for both panels
		const data: AccessibilityViewData = {
			label: searchValue,
			normalizedColor: insights.hex,
			colorName: searchCandidates ? `Searching ${searchCandidates.length} formats...` : (insights.name || ''),
			colorHex: insights.hex,
			brightness: insights.brightness,
			report: { samples: [] } as any, // Only needed for contrast panel
			conversions: conversions.length > 0 ? conversions : (searchCandidates ? searchCandidates.map(c => ({ format: 'custom' as any, value: c, label: c })) : []),
			usageMatches,
			searchValue,
			section: targetPanel
		};

		console.log(`${LOG_PREFIX} Updating ${targetPanel} panel with ${matches.length} matches${searchCandidates ? ' (searching...)' : ''}`);
		
		// Update the content FIRST so it's ready when panel opens
		this.accessibilityViewProvider.updateReport(data, targetPanel);
		
		// Now reveal the container and panel with content already loaded
		try {
			await vscode.commands.executeCommand('workbench.view.extension.colorbuddy');
			await this.accessibilityViewProvider.revealSection(targetPanel, true);
			console.log(`${LOG_PREFIX} ${targetPanel} panel revealed with ${matches.length} matches`);
		} catch (error) {
			console.error(`${LOG_PREFIX} Failed to reveal ${targetPanel} panel:`, error);
		}
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
		markdown.appendMarkdown(`**${t(LocalizedStrings.TOOLTIP_COLOR_VALUE)}:** ${insights.name} (\`${insights.hex}\`)\n\n`);
		markdown.appendMarkdown(`**${t(LocalizedStrings.TOOLTIP_BRIGHTNESS)}:** ${insights.brightness}%\n\n`);
		markdown.appendMarkdown(`**${t(LocalizedStrings.STATUS_BAR_USAGE_COUNT)}:** ${metrics.usageCount}\n\n`);
		this.appendCssVariableContexts(markdown, data);
		appendWcagStatusSection(markdown, data.normalizedColor, report);

		appendFormatConversionList(markdown, conversions, { surface: 'statusBar' });

		const copyPayload = this.buildQuickActionCopyPayload(data, conversions, primaryValue);
		const metadata = buildAccessibilityMetadata(data, metrics.usageCount);
		const accessibilityPayload: TestAccessibilityCommandPayload | undefined = data.normalizedColor
			? {
				value: data.normalizedColor,
				format: data.format,
				source: 'statusBar',
				label: data.originalText,
				metadata
			  }
			: undefined;

		const findUsagesPayload: FindUsagesCommandPayload | undefined = data.normalizedColor
			? {
				value: data.normalizedColor,
				format: data.format,
				source: 'statusBar',
				label: data.originalText
			  }
			: undefined;

		const overrides: Record<string, { args?: unknown[] }> = {};
		if (copyPayload) {
			overrides['colorbuddy.copyColorAs'] = { args: [copyPayload] };
		}
		if (accessibilityPayload) {
			overrides['colorbuddy.testColorAccessibility'] = { args: [accessibilityPayload] };
		}
		if (findUsagesPayload) {
			overrides['colorbuddy.findColorUsages'] = { args: [findUsagesPayload] };
		}

		const quickActionOverrides = Object.keys(overrides).length > 0 ? overrides : undefined;
		appendQuickActions(markdown, { surface: 'statusBar', overrides: quickActionOverrides });

		return markdown;
	}

	private buildQuickActionCopyPayload(
		data: ColorData,
		conversions: FormatConversion[],
		fallbackValue?: string
	): CopyColorCommandPayload | undefined {
		const preferredValue = this.getCssVariableDeclarationValue(data);
		const primaryConversion = conversions[0];
		const value = preferredValue ?? primaryConversion?.value ?? fallbackValue ?? data.normalizedColor ?? data.originalText;
		if (!value) {
			return undefined;
		}
		const format = preferredValue ? data.format : primaryConversion?.format ?? data.format;
		return {
			value,
			format,
			source: 'statusBar'
		};
	}

	private resolveUsageCount(context: AccessibilityCommandColorContext): number | undefined {
		if (context.activeColor && context.colorData) {
			return getColorUsageCount(context.colorData, context.activeColor);
		}
		return context.metadata?.usageCount;
	}

	private resolveCssVariableName(context: AccessibilityCommandColorContext): string | undefined {
		if (context.activeColor?.variableName) {
			return context.activeColor.variableName;
		}
		return context.metadata?.variableName;
	}

	private getVariableContextSummaries(variableName: string): AccessibilityVariableContext[] {
		return this.collectVariableContextEntries(variableName).map(entry => ({
			label: entry.label,
			value: entry.value,
			resolvedValue: entry.resolvedValue,
			location: entry.location,
			uri: entry.uri,
			line: entry.line
		}));
	}

	private collectVariableContextEntries(variableName: string): VariableContextSummary[] {
		const declarations = this.registry.getVariable(variableName);
		if (!declarations || declarations.length === 0) {
			return [];
		}
		const sorted = [...declarations].sort((a, b) => a.context.specificity - b.context.specificity);
		const entries: VariableContextSummary[] = [];
		const seen = new Set<CSSVariableDeclaration>();
		const pushEntry = (declaration: CSSVariableDeclaration, label: string) => {
			const resolved = declaration.resolvedValue ?? this.cssParser.resolveNestedVariables(declaration.value);
			const location = `${vscode.workspace.asRelativePath(declaration.uri)}:${declaration.line + 1}`;
			entries.push({
				label,
				value: declaration.value?.trim() ?? resolved,
				resolvedValue: resolved,
				location,
				uri: declaration.uri,
				line: declaration.line
			});
			seen.add(declaration);
		};

		const rootDecl = sorted.find(decl => decl.context.type === 'root');
		const lightDecl = sorted.find(decl => decl.context.themeHint === 'light');
		const darkDecl = sorted.find(decl => decl.context.themeHint === 'dark');

		if (rootDecl) {
			pushEntry(rootDecl, t(LocalizedStrings.TOOLTIP_DEFAULT_THEME));
		}
		if (lightDecl && lightDecl !== rootDecl) {
			pushEntry(lightDecl, t(LocalizedStrings.TOOLTIP_LIGHT_THEME));
		}
		if (darkDecl && darkDecl !== rootDecl) {
			pushEntry(darkDecl, t(LocalizedStrings.TOOLTIP_DARK_THEME));
		}

		for (const declaration of sorted) {
			if (seen.has(declaration)) {
				continue;
			}
			const label = declaration.selector?.trim() || t(LocalizedStrings.TOOLTIP_VARIABLE);
			pushEntry(declaration, label);
		}

		return entries;
	}

	private getCssVariableDeclarationValue(data: ColorData): string | undefined {
		if (!data.isCssVariable || !data.variableName) {
			return undefined;
		}
		const declarations = this.registry.getVariable(data.variableName);
		if (!declarations || declarations.length === 0) {
			return undefined;
		}
		const sorted = [...declarations].sort((a, b) => a.context.specificity - b.context.specificity);
		const rootDecl = sorted.find(decl => decl.context.type === 'root');
		const target = rootDecl ?? sorted[0];
		return target?.value?.trim();
	}

	private appendCssVariableContexts(markdown: vscode.MarkdownString, data: ColorData): void {
		if (!data.isCssVariable || !data.variableName) {
			return;
		}
		const contexts = this.collectVariableContextEntries(data.variableName);
		for (const context of contexts) {
			this.appendVariableContext(markdown, context);
		}
	}

	private appendVariableContext(markdown: vscode.MarkdownString, context: VariableContextSummary): void {
		const parsed = this.colorParser.parseColor(context.resolvedValue);
		if (parsed) {
			const swatchUri = this.createColorSwatchDataUri(parsed.cssString);
			markdown.appendMarkdown(`![color swatch](${swatchUri}) **${context.label}:** \`${context.resolvedValue}\`\n\n`);
		} else {
			markdown.appendMarkdown(`**${context.label}:** \`${context.resolvedValue}\`\n\n`);
		}
		markdown.appendMarkdown(`${t(LocalizedStrings.TOOLTIP_DEFINED_IN)} [${context.location}](${context.uri.toString()}#L${context.line + 1})\n\n`);
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

	/**
	 * Dispose all resources.
	 */
	dispose(): void {
		this.stateManager.dispose();
		this.cache.clear();
		this.cssFileWatcher?.dispose();
		if (this.htmlRefreshInterval) {
			clearInterval(this.htmlRefreshInterval);
			this.htmlRefreshInterval = null;
		}
		this.disposables.forEach(d => d.dispose());
		this.registeredLanguageKey = null;
		this.statusBarItem.dispose();
	}
}
