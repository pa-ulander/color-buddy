import * as vscode from 'vscode';
import type {
    ColorData
} from './types';
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
import { t, LocalizedStrings } from './i18n/localization';
import { Registry, Cache, StateManager, ColorParser, ColorFormatter, ColorDetector, CSSParser, Provider } from './services';

process.on('uncaughtException', error => {
    console.error(`${LOG_PREFIX} uncaught exception`, error);
});

process.on('unhandledRejection', reason => {
    console.error(`${LOG_PREFIX} unhandled rejection`, reason);
});

// Service instances
const registry = new Registry();
const cache = new Cache();
const stateManager = new StateManager();
const colorParser = new ColorParser();
const colorFormatter = new ColorFormatter();
const colorDetector = new ColorDetector(registry, colorParser);
const cssParser = new CSSParser(registry, colorParser);
const provider = new Provider(registry, colorParser, colorFormatter, cssParser);

export function activate(context: vscode.ExtensionContext) {
    console.log(`${LOG_PREFIX} ${t(LocalizedStrings.EXTENSION_ACTIVATING)}`);

    // Index CSS files for variable definitions first (before registering providers)
    const indexingPromise = indexWorkspaceCSSFiles();

    // Watch for CSS file changes
    const cssWatcher = vscode.workspace.createFileSystemWatcher(CSS_FILE_PATTERN);
    cssWatcher.onDidChange(uri => {
        vscode.workspace.openTextDocument(uri).then(doc => {
            void cssParser.parseCSSFile(doc).then(() => {
                // Refresh all visible editors after CSS changes
                refreshVisibleEditors();
            });
        });
    });
    cssWatcher.onDidCreate(uri => {
        vscode.workspace.openTextDocument(uri).then(doc => {
            void cssParser.parseCSSFile(doc).then(() => {
                refreshVisibleEditors();
            });
        });
    });
    cssWatcher.onDidDelete(uri => {
        // Remove variables from this file
        registry.removeByUri(uri);
        // Refresh after deletion
        refreshVisibleEditors();
    });
    context.subscriptions.push(cssWatcher);

    // Wait for indexing to complete, then register providers and refresh
    void indexingPromise.then(() => {
        console.log(`${LOG_PREFIX} ${t(LocalizedStrings.EXTENSION_ACTIVATED)}`);
        registerLanguageProviders(context);
        refreshVisibleEditors();
    });

    // Register command to re-index CSS files (useful for debugging)
    const reindexCommand = vscode.commands.registerCommand('colorbuddy.reindexCSSFiles', async () => {
        await indexWorkspaceCSSFiles();
        refreshVisibleEditors();
        void vscode.window.showInformationMessage(`ColorBuddy: ${t(LocalizedStrings.EXTENSION_INDEXING_COMPLETE, registry.variableCount)}`);
    });
    context.subscriptions.push(reindexCommand);

    // Register command to show color palette
    const showPaletteCommand = vscode.commands.registerCommand('colorbuddy.showColorPalette', () => {
        const palette = extractWorkspaceColorPalette();
        const items = Array.from(palette.entries()).map(([colorString, color]) => {
            const r = Math.round(color.red * 255);
            const g = Math.round(color.green * 255);
            const b = Math.round(color.blue * 255);
            return {
                label: colorString,
                description: `RGB(${r}, ${g}, ${b})`,
                detail: `Used in workspace CSS variables`
            };
        });
        
        if (items.length === 0) {
            void vscode.window.showInformationMessage(t(LocalizedStrings.PALETTE_NO_COLORS));
        } else {
            void vscode.window.showQuickPick(items, {
                title: t(LocalizedStrings.PALETTE_TITLE) + ` (${items.length})`,
                placeHolder: t(LocalizedStrings.PALETTE_TITLE)
            });
        }
    });
    context.subscriptions.push(showPaletteCommand);

    context.subscriptions.push(
        vscode.window.onDidChangeActiveTextEditor(editor => {
            if (editor) {
                void refreshEditor(editor);
            }
        }),
        vscode.workspace.onDidChangeTextDocument(event => {
            const targetEditor = vscode.window.visibleTextEditors.find(editor => editor.document === event.document);
            if (targetEditor) {
                void refreshEditor(targetEditor);
            }
        }),
        vscode.workspace.onDidCloseTextDocument(document => {
            clearColorCacheForDocument(document);
        }),
        vscode.workspace.onDidChangeConfiguration(event => {
            if (event.affectsConfiguration('colorbuddy.languages')) {
                registerLanguageProviders(context);
                refreshVisibleEditors();
            }
        })
    );
}

export function deactivate() {
    clearAllDecorations();
}

async function refreshEditor(editor: vscode.TextEditor): Promise<void> {
    if (!shouldDecorate(editor.document)) {
        clearDecorationsForEditor(editor);
        return;
    }

    try {
        const colorData = await ensureColorData(editor.document);
        applyCSSVariableDecorations(editor, colorData);
    } catch (error) {
        console.error(`${LOG_PREFIX} failed to refresh color data`, error);
    }
}

function shouldDecorate(document: vscode.TextDocument): boolean {
    const config = vscode.workspace.getConfiguration('colorbuddy');
    const languages = config.get<string[]>('languages', DEFAULT_LANGUAGES);
    if (!languages || languages.length === 0) {
        return false;
    }

    if (languages.includes('*')) {
        return true;
    }

    return languages.includes(document.languageId);
}

async function ensureColorData(document: vscode.TextDocument): Promise<ColorData[]> {
    if (!shouldDecorate(document)) {
        clearColorCacheForDocument(document);
        return [];
    }

    const key = `${document.uri.toString()}-${document.version}`;
    const cached = cache.get(document.uri.toString(), document.version);
    if (cached) {
        return cached;
    }

    return cache.getPendingOrCompute(key, async () => {
        const data = await computeColorData(document);
        cache.set(document.uri.toString(), document.version, data);
        return data;
    });
}

async function computeColorData(document: vscode.TextDocument): Promise<ColorData[]> {
    const text = document.getText();
    const allColorData = colorDetector.collectColorData(document, text);
    const nativeRanges = await getNativeColorRangeKeys(document);

    if (nativeRanges.size === 0) {
        return allColorData;
    }

    return allColorData.filter(data => !nativeRanges.has(rangeKey(data.range)));
}

async function getNativeColorRangeKeys(document: vscode.TextDocument): Promise<Set<string>> {
    if (stateManager.isProbingNativeColors) {
        return new Set();
    }

    stateManager.isProbingNativeColors = true;
    try {
        const colorInfos = await vscode.commands.executeCommand<vscode.ColorInformation[] | undefined>(
            'vscode.executeDocumentColorProvider',
            document.uri
        );

        if (!Array.isArray(colorInfos) || colorInfos.length === 0) {
            return new Set();
        }

        return new Set(colorInfos.map(info => rangeKey(info.range)));
    } catch (error) {
        console.warn('[cb] native color provider probe failed', error);
        return new Set();
    } finally {
        stateManager.isProbingNativeColors = false;
    }
}

function rangeKey(range: vscode.Range): string {
    return `${range.start.line}:${range.start.character}-${range.end.line}:${range.end.character}`;
}

function clearColorCacheForDocument(document: vscode.TextDocument) {
    cache.delete(document.uri.toString());
}

function applyCSSVariableDecorations(editor: vscode.TextEditor, colorData: ColorData[]): void {
    // Clear previous decorations for this editor
    const editorKey = editor.document.uri.toString();
    const existingDecorations = stateManager.getDecoration(editorKey);
    if (existingDecorations) {
        existingDecorations.dispose();
    }

    // Collect all CSS variable and CSS class color ranges
    const decorationRanges: vscode.Range[] = [];
    const colorsByRange = new Map<string, string>();
    
    for (const data of colorData) {
        // Include CSS variables (not wrapped in functions) and CSS class colors
        if ((data.isCssVariable && !data.isWrappedInFunction) || data.isCssClass) {
            decorationRanges.push(data.range);
            const rangeKey = `${data.range.start.line}:${data.range.start.character}`;
            colorsByRange.set(rangeKey, data.normalizedColor);
        }
    }

    if (decorationRanges.length === 0) {
        stateManager.removeDecoration(editorKey);
        return;
    }

    // Create a single decoration type for all CSS variables
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

    // Apply decorations with individual colors
    const decorationRangesWithOptions: { range: vscode.Range; renderOptions?: vscode.DecorationRenderOptions }[] = [];
    for (const range of decorationRanges) {
        const rangeKey = `${range.start.line}:${range.start.character}`;
        const color = colorsByRange.get(rangeKey);
        if (color) {
            decorationRangesWithOptions.push({
                range,
                renderOptions: {
                    before: {
                        backgroundColor: color,
                        border: COLOR_SWATCH_BORDER,
                        width: `${COLOR_SWATCH_SIZE}px`,
                        height: `${COLOR_SWATCH_SIZE}px`,
                        margin: COLOR_SWATCH_MARGIN
                    }
                }
            });
        }
    }

    if (decorationRangesWithOptions.length > 0) {
        editor.setDecorations(decoration, decorationRangesWithOptions);
        stateManager.setDecoration(editorKey, decoration);
    }
}

async function indexWorkspaceCSSFiles(): Promise<void> {
    console.log(`${LOG_PREFIX} ${t(LocalizedStrings.EXTENSION_INDEXING)}`);
    registry.clear();

    const cssFiles = await vscode.workspace.findFiles(CSS_FILE_PATTERN, EXCLUDE_PATTERN, MAX_CSS_FILES);
    
    for (const fileUri of cssFiles) {
        try {
            const document = await vscode.workspace.openTextDocument(fileUri);
            await cssParser.parseCSSFile(document);
        } catch (error) {
            console.error(`${LOG_PREFIX} ${t(LocalizedStrings.EXTENSION_ERROR_CSS_INDEXING, fileUri.fsPath, String(error))}`);
        }
    }
}

function clearDecorationsForEditor(editor: vscode.TextEditor) {
    clearColorCacheForDocument(editor.document);
    
    // Clear CSS variable decorations
    const editorKey = editor.document.uri.toString();
    const decoration = stateManager.getDecoration(editorKey);
    if (decoration) {
        decoration.dispose();
        stateManager.removeDecoration(editorKey);
    }
}

function clearAllDecorations() {
    cache.clear();
    
    // Dispose all CSS variable decorations
    stateManager.clearAllDecorations();
}

function registerLanguageProviders(context: vscode.ExtensionContext) {
    stateManager.clearProviderSubscriptions();

    const config = vscode.workspace.getConfiguration('colorbuddy');
    const languages = config.get<string[]>('languages', DEFAULT_LANGUAGES);

    if (!languages || languages.length === 0) {
        return;
    }

    let selector: vscode.DocumentSelector;
    if (languages.includes('*')) {
        selector = [
            { scheme: 'file' },
            { scheme: 'untitled' }
        ];
    } else {
        selector = languages.map(language => ({ language }));
    }

    const hoverProvider = vscode.languages.registerHoverProvider(selector, {
        async provideHover(document, position) {
            const colorData = await ensureColorData(document);
            return provider.provideHover(colorData, position);
        }
    });

    const colorProvider = vscode.languages.registerColorProvider(selector, {
        async provideDocumentColors(document) {
            if (stateManager.isProbingNativeColors) {
                return [];
            }
            const colorData = await ensureColorData(document);
            return provider.provideDocumentColors(colorData);
        },
        provideColorPresentations(color, context) {
            const originalText = context.document.getText(context.range);
            const presentations = provider.provideColorPresentations(color, originalText);
            // Add text edit to each presentation
            return presentations.map(presentation => {
                presentation.textEdit = vscode.TextEdit.replace(context.range, presentation.label);
                return presentation;
            });
        }
    });

    stateManager.addProviderSubscription(hoverProvider);
    stateManager.addProviderSubscription(colorProvider);
    context.subscriptions.push(hoverProvider, colorProvider);
}

function refreshVisibleEditors() {
    vscode.window.visibleTextEditors.forEach(editor => {
        void refreshEditor(editor);
    });
}

// Extract unique colors from workspace
function extractWorkspaceColorPalette(): Map<string, vscode.Color> {
    const palette = new Map<string, vscode.Color>();
    
    // Extract from CSS variables
    for (const varName of registry.getAllVariableNames()) {
        const declarations = registry.getVariable(varName);
        if (!declarations) { continue; }
        
        for (const decl of declarations) {
            const resolved = cssParser.resolveNestedVariables(decl.value);
            const parsed = colorParser.parseColor(resolved);
            if (parsed) {
                palette.set(parsed.cssString, parsed.vscodeColor);
            }
        }
    }
    
    return palette;
}

// Export selected internals for targeted unit tests.
export const __testing = {
    colorParser,
    colorFormatter,
    colorDetector,
    cssParser,
    provider,
    computeColorData,
    ensureColorData,
    getNativeColorRangeKeys,
    registerLanguageProviders,
    shouldDecorate,
    registry,
    cache,
    stateManager
};



