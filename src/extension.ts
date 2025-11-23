import * as vscode from 'vscode';
import type { ColorData } from './types';
import { DEFAULT_LANGUAGES } from './types';
import {
    MAX_CSS_FILES,
    CSS_FILE_PATTERN,
    EXCLUDE_PATTERN,
    COLOR_SWATCH_SIZE,
    COLOR_SWATCH_MARGIN,
    COLOR_SWATCH_BORDER,
    LOG_PREFIX
} from './utils/constants';
import { t, LocalizedStrings } from './l10n/localization';
import {
    Registry,
    Cache,
    StateManager,
    ColorParser,
    ColorFormatter,
    ColorDetector,
    CSSParser,
    Provider
} from './services';

/**
 * Main extension controller managing lifecycle and coordination between services.
 * Follows the dependency injection pattern for better testability and maintainability.
 */
class ExtensionController implements vscode.Disposable {
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
        console.log(`${LOG_PREFIX} ${t(LocalizedStrings.EXTENSION_ACTIVATING)}`);

        this.setupErrorHandlers();
        await this.indexWorkspaceCSSFiles();
        this.setupCSSFileWatcher();
        this.registerCommands();
        this.registerEventHandlers();
        this.registerLanguageProviders();
        this.refreshVisibleEditors();

        console.log(`${LOG_PREFIX} ${t(LocalizedStrings.EXTENSION_ACTIVATED)}`);
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
            vscode.commands.registerCommand('colorbuddy.showColorPalette', () => this.handleShowPaletteCommand())
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
     * Register document and editor event handlers.
     */
    private registerEventHandlers(): void {
        this.context.subscriptions.push(
            vscode.window.onDidChangeActiveTextEditor(editor => {
                if (editor) {
                    this.refreshEditor(editor).catch(error => {
                        console.error(`${LOG_PREFIX} failed to refresh active editor`, error);
                    });
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
                const colorData = await this.ensureColorData(document);
                return this.provider.provideHover(colorData, position);
            }
        });

        const colorProvider = vscode.languages.registerColorProvider(selector, {
            provideDocumentColors: async (document) => {
                if (this.stateManager.isDocumentProbing(document.uri)) {
                    return [];
                }
                const colorData = await this.ensureColorData(document);
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
        if (!this.shouldDecorate(editor.document)) {
            this.clearDecorationsForEditor(editor);
            return;
        }

        try {
            const colorData = await this.ensureColorData(editor.document);
            this.applyCSSVariableDecorations(editor, colorData);
        } catch (error) {
            console.error(`${LOG_PREFIX} failed to refresh color data`, error);
        }
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

        const cached = this.cache.get(document.uri.toString(), document.version);
        if (cached) {
            return cached;
        }

        const key = `${document.uri.toString()}-${document.version}`;
        return this.cache.getPendingOrCompute(key, async () => {
            const data = await this.computeColorData(document);
            this.cache.set(document.uri.toString(), document.version, data);
            return data;
        });
    }

    /**
     * Compute color data for a document.
     */
    private async computeColorData(document: vscode.TextDocument): Promise<ColorData[]> {
        const text = document.getText();
        const allColorData = this.colorDetector.collectColorData(document, text);
        const nativeRanges = await this.getNativeColorRangeKeys(document);

        if (nativeRanges.size === 0) {
            return allColorData;
        }

        return allColorData.filter(data => !nativeRanges.has(this.rangeKey(data.range)));
    }

    /**
     * Get native color provider ranges to avoid duplicates.
     */
    private async getNativeColorRangeKeys(document: vscode.TextDocument): Promise<Set<string>> {
        if (this.stateManager.isDocumentProbing(document.uri)) {
            return new Set();
        }

        this.stateManager.startNativeColorProbe(document.uri);
        try {
            const colorInfos = await vscode.commands.executeCommand<vscode.ColorInformation[] | undefined>(
                'vscode.executeDocumentColorProvider',
                document.uri
            );

            if (!Array.isArray(colorInfos) || colorInfos.length === 0) {
                return new Set();
            }

            return new Set(colorInfos.map(info => this.rangeKey(info.range)));
        } catch (error) {
            console.warn(`${LOG_PREFIX} native color provider probe failed`, error);
            return new Set();
        } finally {
            this.stateManager.finishNativeColorProbe(document.uri);
        }
    }

    /**
     * Create a unique key for a range.
     */
    private rangeKey(range: vscode.Range): string {
        return `${range.start.line}:${range.start.character}-${range.end.line}:${range.end.character}`;
    }

    /**
     * Apply CSS variable decorations to an editor.
     */
    private applyCSSVariableDecorations(editor: vscode.TextEditor, colorData: ColorData[]): void {
        const editorKey = this.getEditorKey(editor);
        const existingDecoration = this.stateManager.getDecoration(editorKey);
        if (existingDecoration) {
            existingDecoration.dispose();
        }

        const decorationRanges: vscode.Range[] = [];
        const colorsByRange = new Map<string, string>();

        for (const data of colorData) {
            if ((data.isCssVariable && !data.isWrappedInFunction) || data.isCssClass) {
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
                contentText: '',
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
            editor.setDecorations(decoration, decorationRangesWithOptions);
            this.stateManager.setDecoration(editorKey, decoration);
        }
    }

    /**
     * Index all CSS files in the workspace.
     */
    private async indexWorkspaceCSSFiles(): Promise<void> {
        console.log(`${LOG_PREFIX} ${t(LocalizedStrings.EXTENSION_INDEXING)}`);
        this.registry.clear();

        const cssFiles = await vscode.workspace.findFiles(
            CSS_FILE_PATTERN,
            EXCLUDE_PATTERN,
            MAX_CSS_FILES
        );

        for (const fileUri of cssFiles) {
            try {
                const document = await vscode.workspace.openTextDocument(fileUri);
                await this.cssParser.parseCSSFile(document);
            } catch (error) {
                console.error(
                    `${LOG_PREFIX} ${t(LocalizedStrings.EXTENSION_ERROR_CSS_INDEXING, fileUri.fsPath, String(error))}`
                );
            }
        }
    }

    /**
     * Clear color cache for a document.
     */
    private clearColorCacheForDocument(document: vscode.TextDocument): void {
        this.cache.delete(document.uri.toString());
    }

    /**
     * Clear decorations for a specific editor.
     */
    private clearDecorationsForEditor(editor: vscode.TextEditor): void {
        this.clearColorCacheForDocument(editor.document);
        const editorKey = this.getEditorKey(editor);
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

// Extension state
let controller: ExtensionController | null = null;

/**
 * Extension activation entry point.
 */
export async function activate(context: vscode.ExtensionContext): Promise<void> {
    controller = new ExtensionController(context);
    await controller.activate();
}

/**
 * Extension deactivation entry point.
 */
export function deactivate(): void {
    controller?.dispose();
    controller = null;
}
 
