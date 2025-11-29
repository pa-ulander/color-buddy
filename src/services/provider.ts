import * as vscode from 'vscode';
import { ColorParser } from './colorParser';
import { ColorFormatter } from './colorFormatter';
import { CSSParser } from './cssParser';
import { Registry } from './registry';
import { Telemetry, buildContrastTelemetry, ColorInsightColorKind } from './telemetry';
import { t, LocalizedStrings } from '../l10n/localization';
import type { ColorFormat, AccessibilityReport, ColorData, AccessibilityCheck } from '../types';
import { collectFormatConversions, appendFormatConversionList } from '../utils/colorFormatConversions';
import { appendQuickActions } from '../utils/quickActions';
import { getColorUsageCount } from '../utils/colorUsage';
import { getColorInsights } from '../utils/colorInsights';
import { appendWcagStatusSection } from '../utils/accessibilityFormatting';

/**
 * Provider service for VS Code language providers (hover, color provider).
 * Handles tooltip generation, color presentation, and accessibility information.
 */
export class Provider {
    constructor(
        private readonly registry: Registry,
        private readonly colorParser: ColorParser,
        private readonly colorFormatter: ColorFormatter,
        private readonly cssParser: CSSParser,
        private readonly telemetry?: Telemetry
    ) {}

    /**
     * Create a color swatch data URI for use in markdown tooltips
     */
    private createColorSwatchDataUri(color: string): string {
        const sanitizedColor = color.replace(/'/g, "\\'").replace(/"/g, '\\"');
        const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 10 10"><rect x="0.5" y="0.5" width="9" height="9" fill="${sanitizedColor}" stroke="white" stroke-width="1" /></svg>`;
        const encodedSvg = Buffer.from(svg).toString('base64');
        return `data:image/svg+xml;base64,${encodedSvg}`;
    }

    /**
     * Calculate relative luminance using WCAG formula
     */
    private getRelativeLuminance(color: vscode.Color): number {
        const rsRGB = color.red;
        const gsRGB = color.green;
        const bsRGB = color.blue;
        
        const r = rsRGB <= 0.03928 ? rsRGB / 12.92 : Math.pow((rsRGB + 0.055) / 1.055, 2.4);
        const g = gsRGB <= 0.03928 ? gsRGB / 12.92 : Math.pow((gsRGB + 0.055) / 1.055, 2.4);
        const b = bsRGB <= 0.03928 ? bsRGB / 12.92 : Math.pow((bsRGB + 0.055) / 1.055, 2.4);
        
        return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    }

    /**
     * Calculate contrast ratio between two colors
     */
    private getContrastRatio(color1: vscode.Color, color2: vscode.Color): number {
        const lum1 = this.getRelativeLuminance(color1);
        const lum2 = this.getRelativeLuminance(color2);
        const lighter = Math.max(lum1, lum2);
        const darker = Math.min(lum1, lum2);
        return (lighter + 0.05) / (darker + 0.05);
    }

    /**
     * Get WCAG accessibility level for a contrast ratio
     */
    private getAccessibilitySummary(ratio: number): { level: string; checks: AccessibilityCheck[] } {
        const checks: AccessibilityCheck[] = [
            {
                label: t(LocalizedStrings.TOOLTIP_ACCESSIBILITY_AA_NORMAL),
                outcome: ratio >= 4.5 ? 'pass' : 'fail'
            },
            {
                label: t(LocalizedStrings.TOOLTIP_ACCESSIBILITY_AA_LARGE),
                outcome: ratio >= 3 ? 'pass' : 'fail'
            },
            {
                label: t(LocalizedStrings.TOOLTIP_ACCESSIBILITY_AAA_NORMAL),
                outcome: ratio >= 7 ? 'pass' : 'fail'
            }
        ];

        let level = 'Fail';
        if (ratio >= 7) {
            level = 'AAA';
        } else if (ratio >= 4.5) {
            level = 'AA';
        } else if (ratio >= 3) {
            level = 'AA Large';
        }

        return { level, checks };
    }

    public getAccessibilityReport(color: vscode.Color): AccessibilityReport {
        const white = new vscode.Color(1, 1, 1, 1);
        const black = new vscode.Color(0, 0, 0, 1);

        const contrastWhite = this.getContrastRatio(color, white);
        const contrastBlack = this.getContrastRatio(color, black);

        const whiteSummary = this.getAccessibilitySummary(contrastWhite);
        const blackSummary = this.getAccessibilitySummary(contrastBlack);

        return {
            samples: [
                {
                    label: t(LocalizedStrings.TOOLTIP_CONTRAST_ON_WHITE),
                    backgroundDescription: '#FFFFFF',
                    backgroundColor: white,
                    contrastRatio: contrastWhite,
                    level: whiteSummary.level,
                    checks: whiteSummary.checks
                },
                {
                    label: t(LocalizedStrings.TOOLTIP_CONTRAST_ON_BLACK),
                    backgroundDescription: '#000000',
                    backgroundColor: black,
                    contrastRatio: contrastBlack,
                    level: blackSummary.level,
                    checks: blackSummary.checks
                }
            ]
        };
    }

    /**
     * Append a divider at the end of tooltip content
     */
    private appendTooltipFooter(markdown: vscode.MarkdownString): void {
        appendQuickActions(markdown, { surface: 'hover' });
        markdown.appendMarkdown('---\n\n');
    }

    /**
     * Append alternate format conversions for the active color when available.
     */
    private appendFormatConversions(markdown: vscode.MarkdownString, color: vscode.Color, primaryFormat?: ColorFormat): void {
        const conversions = collectFormatConversions(this.colorParser, this.colorFormatter, color, primaryFormat);
        appendFormatConversionList(markdown, conversions, { surface: 'hover' });
    }

    private appendColorInsights(markdown: vscode.MarkdownString, color: vscode.Color): void {
        const insights = getColorInsights(color);
        markdown.appendMarkdown(`**${t(LocalizedStrings.TOOLTIP_COLOR_NAME)}:** ${insights.name} (\`${insights.hex}\`)\n\n`);
        markdown.appendMarkdown(`**${t(LocalizedStrings.TOOLTIP_BRIGHTNESS)}:** ${insights.brightness}%\n\n`);
    }

    private appendMetricsSection(markdown: vscode.MarkdownString, data: ColorData, usageCount: number, report: AccessibilityReport): void {
        markdown.appendMarkdown(`---\n\n`);
        markdown.appendMarkdown(`**${t(LocalizedStrings.STATUS_BAR_USAGE_COUNT)}:** ${usageCount}\n\n`);
        appendWcagStatusSection(markdown, data.normalizedColor, report);
    }

    private recordHoverTelemetry(data: ColorData, usageCount: number, report: AccessibilityReport): void {
        if (!this.telemetry) {
            return;
        }

        this.telemetry.trackColorInsight({
            surface: 'hover',
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
     * Create hover tooltip for CSS class colors
     */
    private createCssClassHover(data: ColorData, markdown: vscode.MarkdownString, colorData: ColorData[]): void {
        if (!data.cssClassName) {
            return;
        }
        const declarations = this.registry.getClass(data.cssClassName);
        
        if (!declarations || declarations.length === 0) {
            return;
        }

        const swatchColor = this.colorFormatter.toRgba(data.vscodeColor, false);
        const swatchUri = this.createColorSwatchDataUri(swatchColor);
        markdown.appendMarkdown(`### ${t(LocalizedStrings.TOOLTIP_CSS_CLASS)}\n\n`);
        markdown.appendMarkdown(`![color swatch](${swatchUri}) \`${data.cssClassName}\`\n\n`);
        
        markdown.appendMarkdown(`**${t(LocalizedStrings.TOOLTIP_PROPERTY)}:** \`${declarations[0].property}\`\n\n`);
        markdown.appendMarkdown(`**${t(LocalizedStrings.TOOLTIP_VALUE)}:** \`${declarations[0].value}\`\n\n`);

        this.appendColorInsights(markdown, data.vscodeColor);

        markdown.appendMarkdown(`---\n\n`);
        
        for (const decl of declarations) {
            markdown.appendMarkdown(`${t(LocalizedStrings.TOOLTIP_DEFINED_IN)} [${vscode.workspace.asRelativePath(decl.uri)}:${decl.line + 1}](${decl.uri.toString()}#L${decl.line + 1})\n\n`);
        }

        const usageCount = getColorUsageCount(colorData, data);
        const report = this.getAccessibilityReport(data.vscodeColor);
        this.recordHoverTelemetry(data, usageCount, report);
        this.appendMetricsSection(markdown, data, usageCount, report);
        this.appendFormatConversions(markdown, data.vscodeColor, data.format);
        this.appendTooltipFooter(markdown);
    }

    /**
     * Create hover tooltip for CSS variables and Tailwind classes
     */
    private createCssVariableHover(data: ColorData, markdown: vscode.MarkdownString, colorData: ColorData[]): void {
        if (!data.variableName) {
            return;
        }
        const declarations = this.registry.getVariable(data.variableName);
        
        if (!declarations || declarations.length === 0) {
            // Handle undefined variable
            markdown.appendMarkdown(`### ${t(LocalizedStrings.TOOLTIP_VARIABLE_NOT_FOUND)}\n\n`);
            markdown.appendMarkdown(`\`${data.originalText}\`\n\n`);
            markdown.appendMarkdown(`**${t(LocalizedStrings.TOOLTIP_VARIABLE)}:** \`${data.variableName}\`\n\n`);
            markdown.appendMarkdown(`${t(LocalizedStrings.TOOLTIP_VARIABLE_NOT_FOUND_MESSAGE)}\n\n`);
            markdown.appendMarkdown(`*${t(LocalizedStrings.TOOLTIP_VARIABLE_NOT_FOUND_HINT)}*\n\n`);
            this.appendTooltipFooter(markdown);
            return;
        }

        // Check if this is a Tailwind class
        if (data.isTailwindClass && data.tailwindClass) {
            const swatchUri = this.createColorSwatchDataUri(data.normalizedColor);
            markdown.appendMarkdown(`### ${t(LocalizedStrings.TOOLTIP_TAILWIND_CLASS)}\n\n`);
            markdown.appendMarkdown(`![color swatch](${swatchUri}) \`${data.tailwindClass}\`\n\n`);
            markdown.appendMarkdown(`**${t(LocalizedStrings.TOOLTIP_MAPS_TO)}:** \`${data.variableName}\`\n\n`);

            this.appendColorInsights(markdown, data.vscodeColor);

            markdown.appendMarkdown(`---\n\n`);
        } else {
            const swatchUri = this.createColorSwatchDataUri(data.normalizedColor);
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
            this.appendColorInsights(markdown, data.vscodeColor);
            markdown.appendMarkdown(`---\n\n`);
        }
        
        // Show resolved values for different contexts
        if (rootDecl) {
            const resolvedRoot = rootDecl.resolvedValue ?? this.cssParser.resolveNestedVariables(rootDecl.value);
            const rootParsed = this.colorParser.parseColor(resolvedRoot);
            if (rootParsed) {
                const swatchUri = this.createColorSwatchDataUri(rootParsed.cssString);
                markdown.appendMarkdown(`![color swatch](${swatchUri}) **${t(LocalizedStrings.TOOLTIP_DEFAULT_THEME)}:** \`${resolvedRoot}\`\n\n`);
            } else {
                markdown.appendMarkdown(`**${t(LocalizedStrings.TOOLTIP_DEFAULT_THEME)}:** \`${resolvedRoot}\`\n\n`);
            }
            markdown.appendMarkdown(`${t(LocalizedStrings.TOOLTIP_DEFINED_IN)} [${vscode.workspace.asRelativePath(rootDecl.uri)}:${rootDecl.line + 1}](${rootDecl.uri.toString()}#L${rootDecl.line + 1})\n\n`);
        }
        
        // Show light theme variant if available
        if (lightDecl && lightDecl !== rootDecl) {
            const resolvedLight = lightDecl.resolvedValue ?? this.cssParser.resolveNestedVariables(lightDecl.value);
            const lightParsed = this.colorParser.parseColor(resolvedLight);
            if (lightParsed) {
                const swatchUri = this.createColorSwatchDataUri(lightParsed.cssString);
                markdown.appendMarkdown(`![color swatch](${swatchUri}) **${t(LocalizedStrings.TOOLTIP_LIGHT_THEME)}:** \`${resolvedLight}\`\n\n`);
            } else {
                markdown.appendMarkdown(`**${t(LocalizedStrings.TOOLTIP_LIGHT_THEME)}:** \`${resolvedLight}\`\n\n`);
            }
            markdown.appendMarkdown(`${t(LocalizedStrings.TOOLTIP_DEFINED_IN)} [${vscode.workspace.asRelativePath(lightDecl.uri)}:${lightDecl.line + 1}](${lightDecl.uri.toString()}#L${lightDecl.line + 1})\n\n`);
        }
        
        // Show dark theme variant if available
        if (darkDecl) {
            const resolvedDark = darkDecl.resolvedValue ?? this.cssParser.resolveNestedVariables(darkDecl.value);
            const darkParsed = this.colorParser.parseColor(resolvedDark);
            if (darkParsed) {
                const swatchUri = this.createColorSwatchDataUri(darkParsed.cssString);
                markdown.appendMarkdown(`![color swatch](${swatchUri}) **${t(LocalizedStrings.TOOLTIP_DARK_THEME)}:** \`${resolvedDark}\`\n\n`);
            } else {
                markdown.appendMarkdown(`**${t(LocalizedStrings.TOOLTIP_DARK_THEME)}:** \`${resolvedDark}\`\n\n`);
            }
            markdown.appendMarkdown(`${t(LocalizedStrings.TOOLTIP_DEFINED_IN)} [${vscode.workspace.asRelativePath(darkDecl.uri)}:${darkDecl.line + 1}](${darkDecl.uri.toString()}#L${darkDecl.line + 1})\n\n`);
        }

        const usageCount = getColorUsageCount(colorData, data);
        const report = this.getAccessibilityReport(data.vscodeColor);
        this.recordHoverTelemetry(data, usageCount, report);
        this.appendMetricsSection(markdown, data, usageCount, report);
        this.appendFormatConversions(markdown, data.vscodeColor, data.format);
        this.appendTooltipFooter(markdown);
    }

    /**
     * Create hover tooltip for regular color literals
     */
    private createColorLiteralHover(data: ColorData, markdown: vscode.MarkdownString, colorData: ColorData[]): void {
        const swatchUri = this.createColorSwatchDataUri(data.normalizedColor);
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

        this.appendColorInsights(markdown, data.vscodeColor);

        const usageCount = getColorUsageCount(colorData, data);
        const report = this.getAccessibilityReport(data.vscodeColor);
        this.recordHoverTelemetry(data, usageCount, report);
        this.appendMetricsSection(markdown, data, usageCount, report);
        this.appendFormatConversions(markdown, data.vscodeColor, data.format);
        this.appendTooltipFooter(markdown);
    }

    /**
     * Provide hover information for colors
     */
    async provideHover(colorData: ColorData[], position: vscode.Position): Promise<vscode.Hover | undefined> {
        try {
            for (const data of colorData) {
                if (data.range.contains(position)) {
                    const markdown = new vscode.MarkdownString('', true);
                    markdown.supportHtml = true;
                    markdown.isTrusted = true;

                    if (data.isCssClass && data.cssClassName) {
                        this.createCssClassHover(data, markdown, colorData);
                    } else if (data.isCssVariable && data.variableName) {
                        this.createCssVariableHover(data, markdown, colorData);
                    } else {
                        this.createColorLiteralHover(data, markdown, colorData);
                    }

                    return new vscode.Hover(markdown, data.range);
                }
            }
        } catch (error) {
            console.error('[ColorBuddy] Provider: failed to provide hover', error);
        }

        return undefined;
    }

    /**
     * Provide document colors for VS Code color picker
     */
    provideDocumentColors(colorData: ColorData[], options?: { allowedFormats?: Set<ColorFormat> }): vscode.ColorInformation[] {
        try {
            const allowedFormats = options?.allowedFormats;

            // Exclude CSS variables and CSS classes from the color picker - they're shown in hover tooltips only
            return colorData
                .filter(data => !data.isCssVariable && !data.isCssClass)
                .filter(data => {
                    if (!allowedFormats) {
                        return true;
                    }
                    return data.format && allowedFormats.has(data.format);
                })
                .map(data => new vscode.ColorInformation(data.range, data.vscodeColor));
        } catch (error) {
            console.error('[ColorBuddy] Provider: failed to provide document colors', error);
            return [];
        }
    }

    /**
     * Provide color presentations (format alternatives)
     */
    provideColorPresentations(color: vscode.Color, originalText: string): vscode.ColorPresentation[] {
        const parsed = this.colorParser.parseColor(originalText);

        if (!parsed) {
            return [];
        }

        const formattedValues = parsed.formatPriority
            .map((format: any) => this.colorFormatter.formatByFormat(color, format))
            .filter((value: string | undefined): value is string => Boolean(value));

        const uniqueValues = Array.from(new Set(formattedValues));

        if (uniqueValues.length === 0) {
            uniqueValues.push(this.colorFormatter.toRgba(color, true));
        }

        return uniqueValues.map(value => {
            const presentation = new vscode.ColorPresentation(value);
            return presentation;
        });
    }
}
