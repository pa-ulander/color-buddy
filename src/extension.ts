import * as vscode from 'vscode';
import type {
    ColorData,
    CSSVariableDeclaration,
    CSSVariableContext,
    CSSClassColorDeclaration,
    ColorFormat
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
import { Registry, Cache, StateManager, ColorParser, ColorFormatter, ColorDetector } from './services';

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

export function activate(context: vscode.ExtensionContext) {
    console.log(`${LOG_PREFIX} ${t(LocalizedStrings.EXTENSION_ACTIVATING)}`);

    // Index CSS files for variable definitions first (before registering providers)
    const indexingPromise = indexWorkspaceCSSFiles();

    // Watch for CSS file changes
    const cssWatcher = vscode.workspace.createFileSystemWatcher(CSS_FILE_PATTERN);
    cssWatcher.onDidChange(uri => {
        void vscode.workspace.openTextDocument(uri).then(doc => {
            void parseCSSFile(doc).then(() => {
                // Refresh all visible editors after CSS changes
                refreshVisibleEditors();
            });
        });
    });
    cssWatcher.onDidCreate(uri => {
        void vscode.workspace.openTextDocument(uri).then(doc => {
            void parseCSSFile(doc).then(() => {
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

async function parseCSSFile(document: vscode.TextDocument): Promise<void> {
    const text = document.getText();
    
    // Simple regex-based CSS variable extraction
    // Matches patterns like: --variable-name: value;
    const cssVarRegex = /(--[\w-]+)\s*:\s*([^;]+);/g;
    let match: RegExpExecArray | null;

    while ((match = cssVarRegex.exec(text)) !== null) {
        const varName = match[1];
        const value = match[2].trim();
        
        // Find which selector this variable belongs to
        const position = document.positionAt(match.index);
        const selector = findContainingSelector(text, match.index);
        const context = analyzeContext(selector);
        
        const declaration: CSSVariableDeclaration = {
            name: varName,
            value: value,
            uri: document.uri,
            line: position.line,
            selector: selector,
            context: context
        };

        // Add to registry
        registry.addVariable(varName, declaration);
    }
    
    // Extract CSS class colors
    // Matches patterns like: .className { color: value; }
    const colorPropertyRegex = /\.([\.\w-]+)\s*\{[^}]*?(color|background-color|border-color|background)\s*:\s*([^;]+);/g;
    let colorMatch: RegExpExecArray | null;
    
    while ((colorMatch = colorPropertyRegex.exec(text)) !== null) {
        const className = colorMatch[1];
        const property = colorMatch[2];
        const value = colorMatch[3].trim();
        
        // Try to resolve if it's a color value or CSS variable reference
        let resolvedValue = value;
        const varMatch = value.match(/var\(\s*(--[\w-]+)\s*\)/);
        if (varMatch) {
            const varName = varMatch[1];
            const varDeclarations = registry.getVariable(varName);
            if (varDeclarations && varDeclarations.length > 0) {
                resolvedValue = resolveNestedVariables(varDeclarations[0].value);
            }
        }
        
        // Check if the value is a color
        const parsed = colorParser.parseColor(resolvedValue);
        if (parsed) {
            const position = document.positionAt(colorMatch.index);
            const selector = findContainingSelector(text, colorMatch.index);
            
            const declaration: CSSClassColorDeclaration = {
                className: className,
                property: property,
                value: resolvedValue,
                uri: document.uri,
                line: position.line,
                selector: selector
            };
            
            registry.addClass(className, declaration);
        }
    }
}

function findContainingSelector(text: string, varIndex: number): string {
    // Find the nearest selector before this variable declaration
    // Look backwards for the opening brace, then find the selector
    const beforeVar = text.substring(0, varIndex);
    const lastOpenBrace = beforeVar.lastIndexOf('{');
    
    if (lastOpenBrace === -1) {
        return ':root';
    }

    // Find the selector before the brace
    const beforeBrace = text.substring(0, lastOpenBrace);
    const lines = beforeBrace.split('\n');
    
    // Go backwards to find the selector
    for (let i = lines.length - 1; i >= 0; i--) {
        const line = lines[i].trim();
        if (line && !line.startsWith('/*') && !line.endsWith('*/')) {
            return line.replace(/\s+/g, ' ').trim();
        }
    }
    
    return ':root';
}

function analyzeContext(selector: string): CSSVariableContext {
    const normalizedSelector = selector.toLowerCase().trim();
    
    // Calculate basic specificity (simplified CSS specificity)
    let specificity = 0;
    if (normalizedSelector === ':root' || normalizedSelector === 'html') {
        specificity = 1;
    } else if (normalizedSelector.includes('.')) {
        specificity = 10 + (normalizedSelector.match(/\./g) || []).length * 10;
    } else if (normalizedSelector.includes('#')) {
        specificity = 100;
    }
    
    // Detect context type
    let type: 'root' | 'class' | 'media' | 'other' = 'other';
    if (normalizedSelector === ':root' || normalizedSelector === 'html') {
        type = 'root';
    } else if (normalizedSelector.includes('.') || normalizedSelector.includes('[')) {
        type = 'class';
    } else if (normalizedSelector.includes('@media')) {
        type = 'media';
    }
    
    // Detect theme hints
    let themeHint: 'light' | 'dark' | undefined;
    if (normalizedSelector.includes('.dark') || 
        normalizedSelector.includes('[data-theme="dark"]') ||
        normalizedSelector.includes('[data-mode="dark"]')) {
        themeHint = 'dark';
    } else if (normalizedSelector.includes('.light') || 
               normalizedSelector.includes('[data-theme="light"]')) {
        themeHint = 'light';
    }
    
    // Extract media query if present
    let mediaQuery: string | undefined;
    const mediaMatch = selector.match(/@media\s+([^{]+)/);
    if (mediaMatch) {
        mediaQuery = mediaMatch[1].trim();
    }
    
    return {
        type,
        themeHint,
        mediaQuery,
        specificity
    };
}
async function indexWorkspaceCSSFiles(): Promise<void> {
    console.log(`${LOG_PREFIX} ${t(LocalizedStrings.EXTENSION_INDEXING)}`);
    registry.clear();

    const cssFiles = await vscode.workspace.findFiles(CSS_FILE_PATTERN, EXCLUDE_PATTERN, MAX_CSS_FILES);
    
    for (const fileUri of cssFiles) {
        try {
            const document = await vscode.workspace.openTextDocument(fileUri);
            await parseCSSFile(document);
        } catch (error) {
            console.error(`${LOG_PREFIX} ${t(LocalizedStrings.EXTENSION_ERROR_CSS_INDEXING, fileUri.fsPath, String(error))}`);
        }
    }
}

function resolveNestedVariables(
    value: string, 
    visitedVars: Set<string> = new Set()
): string {
    // Detect and resolve nested var() references recursively
    const varPattern = /var\(\s*(--[\w-]+)\s*\)/g;
    let match: RegExpExecArray | null;
    let resolvedValue = value;
    
    while ((match = varPattern.exec(value)) !== null) {
        const nestedVarName = match[1];
        
        // Circular reference detection
        if (visitedVars.has(nestedVarName)) {
            console.error(`${LOG_PREFIX} ${t(LocalizedStrings.ERROR_CIRCULAR_REFERENCE, nestedVarName)}`);
            return value; // Return original value to avoid infinite loop
        }
        
        // Look up the nested variable
        const nestedDeclarations = registry.getVariable(nestedVarName);
        if (!nestedDeclarations || nestedDeclarations.length === 0) {
            continue; // Can't resolve, keep as-is
        }
        
        // Use the first declaration (prioritize :root)
        const nestedDecl = nestedDeclarations.sort((a: CSSVariableDeclaration, b: CSSVariableDeclaration) => 
            a.context.specificity - b.context.specificity
        )[0];
        
        // Mark this variable as visited
        const newVisited = new Set(visitedVars);
        newVisited.add(nestedVarName);
        
        // Recursively resolve the nested variable's value
        const nestedResolved = resolveNestedVariables(nestedDecl.value, newVisited);
        
        // Replace the var() reference with the resolved value
        resolvedValue = resolvedValue.replace(match[0], nestedResolved);
    }
    
    return resolvedValue;
}

function createColorSwatchDataUri(color: string): string {
    const sanitizedColor = color.replace(/'/g, "\\'").replace(/"/g, '\\"');
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 10 10"><rect x="0.5" y="0.5" width="9" height="9" fill="${sanitizedColor}" stroke="white" stroke-width="1" /></svg>`;
    const encodedSvg = Buffer.from(svg).toString('base64');
    return `data:image/svg+xml;base64,${encodedSvg}`;
}

async function provideColorHover(document: vscode.TextDocument, position: vscode.Position): Promise<vscode.Hover | undefined> {
    try {
        const colorData = await ensureColorData(document);
        for (const data of colorData) {
            if (data.range.contains(position)) {
                const markdown = new vscode.MarkdownString('', true); // Enable trusted mode from constructor
                markdown.supportHtml = true;

                if (data.isCssClass && data.cssClassName) {
                    // Show CSS class color information
                    const declarations = registry.getClass(data.cssClassName);
                    
                    if (declarations && declarations.length > 0) {
                        const swatchColor = colorFormatter.toRgba(data.vscodeColor, false);
                        const swatchUri = createColorSwatchDataUri(swatchColor);
                        markdown.appendMarkdown(`### ${t(LocalizedStrings.TOOLTIP_CSS_CLASS)}\n\n`);
                        markdown.appendMarkdown(`![color swatch](${swatchUri}) \`${data.cssClassName}\`\n\n`);
                        
                        markdown.appendMarkdown(`**${t(LocalizedStrings.TOOLTIP_PROPERTY)}:** \`${declarations[0].property}\`\n\n`);
                        markdown.appendMarkdown(`**${t(LocalizedStrings.TOOLTIP_VALUE)}:** \`${declarations[0].value}\`\n\n`);
                        
                        markdown.appendMarkdown(`---\n\n`);
                        
                        for (const decl of declarations) {
                            markdown.appendMarkdown(`${t(LocalizedStrings.TOOLTIP_DEFINED_IN)} [${vscode.workspace.asRelativePath(decl.uri)}:${decl.line + 1}](${decl.uri.toString()}#L${decl.line + 1})\n\n`);
                        }
                        
                        // Add accessibility information
                        const white = new vscode.Color(1, 1, 1, 1);
                        const black = new vscode.Color(0, 0, 0, 1);
                        
                        const contrastWhite = getContrastRatio(data.vscodeColor, white);
                        const contrastBlack = getContrastRatio(data.vscodeColor, black);
                        
                        markdown.appendMarkdown(`---\n\n`);
                        markdown.appendMarkdown(`**${t(LocalizedStrings.TOOLTIP_ACCESSIBILITY)}:**\n\n`);
                        
                        const whiteLevel = getAccessibilityLevel(contrastWhite);
                        const blackLevel = getAccessibilityLevel(contrastBlack);
                        
                        markdown.appendMarkdown(`${t(LocalizedStrings.TOOLTIP_CONTRAST_ON_WHITE)}: ${contrastWhite.toFixed(2)}:1 (${whiteLevel.level})\n\n`);
                        markdown.appendMarkdown(`${t(LocalizedStrings.TOOLTIP_CONTRAST_ON_BLACK)}: ${contrastBlack.toFixed(2)}:1 (${blackLevel.level})\n\n`);
                    }
                } else if (data.isCssVariable && data.variableName) {
                    // Show CSS variable or Tailwind class information
                    const declarations = registry.getVariable(data.variableName);
                    
                    if (!declarations || declarations.length === 0) {
                        // Handle undefined variable
                        markdown.appendMarkdown(`### ${t(LocalizedStrings.TOOLTIP_VARIABLE_NOT_FOUND)}\n\n`);
                        markdown.appendMarkdown(`\`${data.originalText}\`\n\n`);
                        markdown.appendMarkdown(`**${t(LocalizedStrings.TOOLTIP_VARIABLE)}:** \`${data.variableName}\`\n\n`);
                        markdown.appendMarkdown(`${t(LocalizedStrings.TOOLTIP_VARIABLE_NOT_FOUND_MESSAGE)}\n\n`);
                        markdown.appendMarkdown(`*${t(LocalizedStrings.TOOLTIP_VARIABLE_NOT_FOUND_HINT)}*`);
                    } else {
                        // Check if this is a Tailwind class
                        if (data.isTailwindClass && data.tailwindClass) {
                            const swatchUri = createColorSwatchDataUri(data.normalizedColor);
                            markdown.appendMarkdown(`### ${t(LocalizedStrings.TOOLTIP_TAILWIND_CLASS)}\n\n`);
                            markdown.appendMarkdown(`![color swatch](${swatchUri}) \`${data.tailwindClass}\`\n\n`);
                            markdown.appendMarkdown(`**${t(LocalizedStrings.TOOLTIP_MAPS_TO)}:** \`${data.variableName}\`\n\n`);
                            markdown.appendMarkdown(`---\n\n`);
                        } else {
                            const swatchUri = createColorSwatchDataUri(data.normalizedColor);
                            markdown.appendMarkdown(`### ${t(LocalizedStrings.TOOLTIP_CSS_VARIABLE)}\n\n`);
                            markdown.appendMarkdown(`![color swatch](${swatchUri}) \`${data.originalText}\`\n\n`);
                        }
                        
                        // Sort by specificity (root first, then themed variants)
                        const sorted = [...declarations].sort((a, b) => a.context.specificity - b.context.specificity);
                        
                        // Separate by theme
                        const rootDecl = sorted.find(d => d.context.type === 'root');
                        const darkDecl = sorted.find(d => d.context.themeHint === 'dark');
                        const lightDecl = sorted.find(d => d.context.themeHint === 'light');
                        
                        if (!data.isTailwindClass) {
                            markdown.appendMarkdown(`**${t(LocalizedStrings.TOOLTIP_VARIABLE)}:** \`${data.variableName}\`\n\n`);
                            markdown.appendMarkdown(`---\n\n`);
                        }
                        
                        // Show resolved values for different contexts
                        if (rootDecl) {
                            const resolvedRoot = resolveNestedVariables(rootDecl.value);
                            const rootParsed = colorParser.parseColor(resolvedRoot);
                            if (rootParsed) {
                                const swatchUri = createColorSwatchDataUri(rootParsed.cssString);
                                markdown.appendMarkdown(`![color swatch](${swatchUri}) **${t(LocalizedStrings.TOOLTIP_DEFAULT_THEME)}:** \`${resolvedRoot}\`\n\n`);
                            } else {
                                markdown.appendMarkdown(`**${t(LocalizedStrings.TOOLTIP_DEFAULT_THEME)}:** \`${resolvedRoot}\`\n\n`);
                            }
                            markdown.appendMarkdown(`${t(LocalizedStrings.TOOLTIP_DEFINED_IN)} [${vscode.workspace.asRelativePath(rootDecl.uri)}:${rootDecl.line + 1}](${rootDecl.uri.toString()}#L${rootDecl.line + 1})\n\n`);
                        }
                        
                        // Show light theme variant if available
                        if (lightDecl && lightDecl !== rootDecl) {
                            const resolvedLight = resolveNestedVariables(lightDecl.value);
                            const lightParsed = colorParser.parseColor(resolvedLight);
                            if (lightParsed) {
                                const swatchUri = createColorSwatchDataUri(lightParsed.cssString);
                                markdown.appendMarkdown(`![color swatch](${swatchUri}) **${t(LocalizedStrings.TOOLTIP_LIGHT_THEME)}:** \`${resolvedLight}\`\n\n`);
                            } else {
                                markdown.appendMarkdown(`**${t(LocalizedStrings.TOOLTIP_LIGHT_THEME)}:** \`${resolvedLight}\`\n\n`);
                            }
                            markdown.appendMarkdown(`${t(LocalizedStrings.TOOLTIP_DEFINED_IN)} [${vscode.workspace.asRelativePath(lightDecl.uri)}:${lightDecl.line + 1}](${lightDecl.uri.toString()}#L${lightDecl.line + 1})\n\n`);
                        }
                        
                        // Show dark theme variant if available
                        if (darkDecl) {
                            const resolvedDark = resolveNestedVariables(darkDecl.value);
                            const darkParsed = colorParser.parseColor(resolvedDark);
                            if (darkParsed) {
                                const swatchUri = createColorSwatchDataUri(darkParsed.cssString);
                                markdown.appendMarkdown(`![color swatch](${swatchUri}) **${t(LocalizedStrings.TOOLTIP_DARK_THEME)}:** \`${resolvedDark}\`\n\n`);
                            } else {
                                markdown.appendMarkdown(`**${t(LocalizedStrings.TOOLTIP_DARK_THEME)}:** \`${resolvedDark}\`\n\n`);
                            }
                            markdown.appendMarkdown(`${t(LocalizedStrings.TOOLTIP_DEFINED_IN)} [${vscode.workspace.asRelativePath(darkDecl.uri)}:${darkDecl.line + 1}](${darkDecl.uri.toString()}#L${darkDecl.line + 1})\n\n`);
                        }
                        
                        // Add accessibility information for CSS variables and Tailwind classes
                        const white = new vscode.Color(1, 1, 1, 1);
                        const black = new vscode.Color(0, 0, 0, 1);
                        
                        const contrastWhite = getContrastRatio(data.vscodeColor, white);
                        const contrastBlack = getContrastRatio(data.vscodeColor, black);
                        
                        markdown.appendMarkdown(`---\n\n`);
                        markdown.appendMarkdown(`**${t(LocalizedStrings.TOOLTIP_ACCESSIBILITY)}:**\n\n`);
                        
                        const whiteLevel = getAccessibilityLevel(contrastWhite);
                        const blackLevel = getAccessibilityLevel(contrastBlack);
                        
                        markdown.appendMarkdown(`${t(LocalizedStrings.TOOLTIP_CONTRAST_ON_WHITE)}: ${contrastWhite.toFixed(2)}:1 (${whiteLevel.level})\n\n`);
                        markdown.appendMarkdown(`${t(LocalizedStrings.TOOLTIP_CONTRAST_ON_BLACK)}: ${contrastBlack.toFixed(2)}:1 (${blackLevel.level})\n\n`);
                    }
                } else {
                    // Show regular color information with format details
                    const swatchUri = createColorSwatchDataUri(data.normalizedColor);
                    markdown.appendMarkdown(`### ${t(LocalizedStrings.TOOLTIP_COLOR_PREVIEW)}\n\n`);
                    markdown.appendMarkdown(`![color swatch](${swatchUri}) \`${data.originalText}\`\n\n`);
                    
                    // Detect format type
                    let formatType = t(LocalizedStrings.TOOLTIP_FORMAT_UNKNOWN);
                    if (data.originalText.startsWith('#')) {
                        formatType = t(LocalizedStrings.TOOLTIP_FORMAT_HEX);
                    } else if (data.originalText.startsWith('rgb')) {
                        formatType = t(LocalizedStrings.TOOLTIP_FORMAT_RGBA);
                    } else if (data.originalText.startsWith('hsl')) {
                        formatType = t(LocalizedStrings.TOOLTIP_FORMAT_HSLA);
                    } else if (/^\d+(\.\d+)?\s+\d+(\.\d+)?%\s+\d+(\.\d+)?%/.test(data.originalText)) {
                        formatType = t(LocalizedStrings.TOOLTIP_FORMAT_TAILWIND_HSL);
                    }
                    
                    markdown.appendMarkdown(`**${t(LocalizedStrings.TOOLTIP_FORMAT)}:** ${formatType}\n\n`);
                    
                    // Show normalized value if different from original
                    if (data.normalizedColor !== data.originalText) {
                        markdown.appendMarkdown(`**${t(LocalizedStrings.TOOLTIP_NORMALIZED)}:** \`${data.normalizedColor}\`\n\n`);
                    }
                    
                    // Show RGB values
                    const r = Math.round(data.vscodeColor.red * 255);
                    const g = Math.round(data.vscodeColor.green * 255);
                    const b = Math.round(data.vscodeColor.blue * 255);
                    const a = data.vscodeColor.alpha;
                    
                    markdown.appendMarkdown(`**${t(LocalizedStrings.TOOLTIP_RGB)}:** ${r}, ${g}, ${b}`);
                    if (a < 1) {
                        markdown.appendMarkdown(` (α: ${a.toFixed(2)})`);
                    }
                markdown.appendMarkdown(`\n\n`);
                
                // Add accessibility check against common backgrounds
                const white = new vscode.Color(1, 1, 1, 1);
                const black = new vscode.Color(0, 0, 0, 1);                    const contrastWhite = getContrastRatio(data.vscodeColor, white);
                    const contrastBlack = getContrastRatio(data.vscodeColor, black);
                    
                    markdown.appendMarkdown(`**${t(LocalizedStrings.TOOLTIP_ACCESSIBILITY)}:**\n\n`);
                    
                    const whiteLevel = getAccessibilityLevel(contrastWhite);
                    const blackLevel = getAccessibilityLevel(contrastBlack);
                    
                    markdown.appendMarkdown(`${t(LocalizedStrings.TOOLTIP_CONTRAST_ON_WHITE)}: ${contrastWhite.toFixed(2)}:1 (${whiteLevel.level})\n\n`);
                    markdown.appendMarkdown(`${t(LocalizedStrings.TOOLTIP_CONTRAST_ON_BLACK)}: ${contrastBlack.toFixed(2)}:1 (${blackLevel.level})\n\n`);
                    
                    markdown.appendMarkdown(`---\n\n`);
                }

                return new vscode.Hover(markdown, data.range);
            }
        }
    } catch (error) {
        console.error(`${LOG_PREFIX} failed to provide hover`, error);
    }

    return undefined;
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

async function provideDocumentColors(document: vscode.TextDocument): Promise<vscode.ColorInformation[]> {
    if (stateManager.isProbingNativeColors) {
        return [];
    }

    try {
        const colors = await ensureColorData(document);
        // Exclude CSS variables and CSS classes from the color picker - they're shown in hover tooltips only
        return colors
            .filter(data => !data.isCssVariable && !data.isCssClass)
            .map(data => new vscode.ColorInformation(data.range, data.vscodeColor));
    } catch (error) {
        console.error(`${LOG_PREFIX} failed to provide document colors`, error);
        return [];
    }
}

function provideColorPresentations(color: vscode.Color, context: { document: vscode.TextDocument; range: vscode.Range }): vscode.ColorPresentation[] {
    const originalText = context.document.getText(context.range);
    const parsed = colorParser.parseColor(originalText);

    if (!parsed) {
        return [];
    }

    const formattedValues = parsed.formatPriority
        .map((format: ColorFormat) => colorFormatter.formatByFormat(color, format))
        .filter((value: string | undefined): value is string => Boolean(value));

    const uniqueValues = Array.from(new Set(formattedValues));

    if (uniqueValues.length === 0) {
        uniqueValues.push(colorFormatter.toRgba(color, true));
    }

    return uniqueValues.map(value => {
        const presentation = new vscode.ColorPresentation(value);
        presentation.textEdit = vscode.TextEdit.replace(context.range, value);
        return presentation;
    });
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
        provideHover(document, position) {
            return provideColorHover(document, position);
        }
    });

    const colorProvider = vscode.languages.registerColorProvider(selector, {
        provideDocumentColors(document) {
            return provideDocumentColors(document);
        },
        provideColorPresentations(color, context) {
            return provideColorPresentations(color, context);
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

// Color accessibility utilities
function getRelativeLuminance(color: vscode.Color): number {
    // Convert RGB to relative luminance using WCAG formula
    const rsRGB = color.red;
    const gsRGB = color.green;
    const bsRGB = color.blue;
    
    const r = rsRGB <= 0.03928 ? rsRGB / 12.92 : Math.pow((rsRGB + 0.055) / 1.055, 2.4);
    const g = gsRGB <= 0.03928 ? gsRGB / 12.92 : Math.pow((gsRGB + 0.055) / 1.055, 2.4);
    const b = bsRGB <= 0.03928 ? bsRGB / 12.92 : Math.pow((bsRGB + 0.055) / 1.055, 2.4);
    
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function getContrastRatio(color1: vscode.Color, color2: vscode.Color): number {
    const lum1 = getRelativeLuminance(color1);
    const lum2 = getRelativeLuminance(color2);
    const lighter = Math.max(lum1, lum2);
    const darker = Math.min(lum1, lum2);
    return (lighter + 0.05) / (darker + 0.05);
}

function getAccessibilityLevel(ratio: number): { level: string; passes: string[] } {
    const passes: string[] = [];
    if (ratio >= 7) {
        passes.push('AAA (normal)', 'AAA (large)', 'AA (normal)', 'AA (large)');
        return { level: 'AAA', passes };
    } else if (ratio >= 4.5) {
        passes.push('AA (normal)', 'AA (large)', 'AAA (large)');
        return { level: 'AA', passes };
    } else if (ratio >= 3) {
        passes.push('AA (large)');
        return { level: 'AA Large', passes };
    }
    return { level: 'Fail', passes: [] };
}

// Extract unique colors from workspace
function extractWorkspaceColorPalette(): Map<string, vscode.Color> {
    const palette = new Map<string, vscode.Color>();
    
    // Extract from CSS variables
    for (const varName of registry.getAllVariableNames()) {
        const declarations = registry.getVariable(varName);
        if (!declarations) { continue; }
        
        for (const decl of declarations) {
            const resolved = resolveNestedVariables(decl.value);
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
    provideDocumentColors,
    computeColorData,
    ensureColorData,
    getNativeColorRangeKeys,
    registerLanguageProviders,
    shouldDecorate,
    registry,
    cache,
    stateManager
};



