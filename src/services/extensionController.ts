import * as vscode from 'vscode';
import type { ColorData, ColorFormat } from '../types';
import { DEFAULT_LANGUAGES } from '../types';
import {
	MAX_CSS_FILES,
	CSS_FILE_PATTERN,
	EXCLUDE_PATTERN,
	COLOR_SWATCH_SIZE,
	COLOR_SWATCH_MARGIN,
	COLOR_SWATCH_BORDER,
	COLOR_SWATCH_CONTENT,
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
	private readonly disposables: vscode.Disposable[] = [];
	private cssFileWatcher: vscode.FileSystemWatcher | null = null;
	private registeredLanguageKey: string | null = null;
	private indexedCssDocuments: Map<string, number> = new Map();

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
			vscode.commands.registerCommand('colorbuddy.exportPerformanceLogs', () => this.handleExportLogsCommand())
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

	/**
	 * Handle export performance logs command.
	 */
	private async handleExportLogsCommand(): Promise<void> {
		if (!perfLogger.isEnabled()) {
			const enable = await vscode.window.showWarningMessage(
				'Performance logging is currently disabled. Enable it to start collecting logs.',
				'Enable Logging',
				'Cancel'
			);
			if (enable === 'Enable Logging') {
				const config = vscode.workspace.getConfiguration('colorbuddy');
				await config.update('enablePerformanceLogging', true, vscode.ConfigurationTarget.Global);
				perfLogger.updateEnabled();
				await vscode.window.showInformationMessage(
					'Performance logging enabled. Use the extension normally, then run this command again to export logs.'
				);
			}
			return;
		}

		const logContent = perfLogger.exportLogs();
		
		// Create a new untitled document with the logs
		const doc = await vscode.workspace.openTextDocument({
			content: logContent,
			language: 'plaintext'
		});
		
		await vscode.window.showTextDocument(doc);
		await vscode.window.showInformationMessage(
			'Performance logs exported. Save this file to share or analyze the logs.'
		);
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
			}),
			vscode.workspace.onDidChangeTextDocument(event => {
				const targetEditor = vscode.window.visibleTextEditors.find(
					editor => editor.document === event.document
				);
				if (targetEditor) {
					this.refreshEditor(targetEditor).catch(error => {
						console.error(`${LOG_PREFIX} failed to refresh document editor`, error);
					});
				}
			}),
			vscode.workspace.onDidCloseTextDocument(document => {
				this.clearColorCacheForDocument(document);
			}),
			vscode.workspace.onDidChangeConfiguration(event => {
				if (event.affectsConfiguration('colorbuddy.languages')) {
					this.stateManager.clearLanguageCache();
					this.registerLanguageProviders();
					this.refreshVisibleEditors();
				}
				if (event.affectsConfiguration('colorbuddy.enablePerformanceLogging')) {
					perfLogger.updateEnabled();
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
				if (NATIVE_COLOR_PROVIDER_LANGUAGES.has(document.languageId)) {
					allowedFormats = new Set<ColorFormat>(['tailwind']);
				} else if (document.languageId === 'sass') {
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
				this.applyCSSVariableDecorations(editor, colorData);
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

		const cached = this.cache.get(document.uri.toString(), document.version);
		if (cached) {
			perfLogger.log('Cache hit for document', document.uri.fsPath);
			return cached;
		}

		perfLogger.log('Cache miss for document', document.uri.fsPath);
		const key = `${document.uri.toString()}-${document.version}`;
		return this.cache.getPendingOrCompute(key, async () => {
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

	private async ensureDocumentIndexed(document: vscode.TextDocument): Promise<void> {
		if (!CSS_LIKE_LANGUAGES.has(document.languageId)) {
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
	private applyCSSVariableDecorations(editor: vscode.TextEditor, colorData: ColorData[]): void {
		perfLogger.start('applyCSSVariableDecorations');
		const editorKey = this.getEditorKey(editor);
		const existingDecoration = this.stateManager.getDecoration(editorKey);
		if (existingDecoration) {
			perfLogger.log('Disposing existing decoration for editor', editor.document.uri.fsPath);
			existingDecoration.dispose();
		}

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
			this.stateManager.removeDecoration(editorKey);
			return;
		}

		const decoration = vscode.window.createTextEditorDecorationType({
			before: {
				contentText: COLOR_SWATCH_CONTENT,
				border: COLOR_SWATCH_BORDER,
				width: `${COLOR_SWATCH_SIZE}px`,
				height: `${COLOR_SWATCH_SIZE}px`,
				margin: COLOR_SWATCH_MARGIN
			},
			backgroundColor: 'transparent'
		});

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
				count: decorationRangesWithOptions.length
			});
			editor.setDecorations(decoration, decorationRangesWithOptions);
			this.stateManager.setDecoration(editorKey, decoration);
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

	/**
	 * Dispose all resources.
	 */
	dispose(): void {
		this.stateManager.dispose();
		this.cache.clear();
		this.cssFileWatcher?.dispose();
		this.disposables.forEach(d => d.dispose());
		this.registeredLanguageKey = null;
	}
}
