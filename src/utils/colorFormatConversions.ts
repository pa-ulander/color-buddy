import * as vscode from 'vscode';
import type { ColorFormat, CopyColorCommandPayload } from '../types';
import type { ColorParser } from '../services/colorParser';
import type { ColorFormatter } from '../services/colorFormatter';
import { t, LocalizedStrings } from '../l10n/localization';

export interface FormatConversion {
    format: ColorFormat;
    value: string;
}

type ConversionSurface = Extract<CopyColorCommandPayload['source'], 'hover' | 'statusBar'>;

/**
 * Collect formatted color representations using the parser's format priority.
 */
export function collectFormatConversions(
    colorParser: ColorParser,
    colorFormatter: ColorFormatter,
    color: vscode.Color,
    primaryFormat?: ColorFormat
): FormatConversion[] {
    const initialFormat: ColorFormat = primaryFormat ?? (color.alpha < 1 ? 'rgba' : 'rgb');
    const priorities = colorParser.getFormatPriority(initialFormat);
    const seen = new Set<string>();
    const results: FormatConversion[] = [];

    for (const format of priorities) {
        const formatted = colorFormatter.formatByFormat(color, format);
        if (!formatted) {
            continue;
        }
        const key = formatted.toLowerCase();
        if (seen.has(key)) {
            continue;
        }
        seen.add(key);
        results.push({ format, value: formatted });
    }

    if (results.length === 0) {
        results.push({ format: 'rgba', value: colorFormatter.toRgba(color, true) });
    }

    return results;
}

/**
 * Get a localized label for a color format identifier.
 */
export function getFormatLabel(format: ColorFormat): string {
    switch (format) {
        case 'hex':
            return t(LocalizedStrings.TOOLTIP_FORMAT_HEX);
        case 'hexAlpha':
            return t(LocalizedStrings.TOOLTIP_FORMAT_HEX_ALPHA);
        case 'rgb':
            return t(LocalizedStrings.TOOLTIP_FORMAT_RGB_LABEL);
        case 'rgba':
            return t(LocalizedStrings.TOOLTIP_FORMAT_RGBA_LABEL);
        case 'hsl':
            return t(LocalizedStrings.TOOLTIP_FORMAT_HSL_LABEL);
        case 'hsla':
            return t(LocalizedStrings.TOOLTIP_FORMAT_HSLA_LABEL);
        case 'tailwind':
            return t(LocalizedStrings.TOOLTIP_FORMAT_TAILWIND_LABEL);
        default:
            return format;
    }
}

interface AppendFormatConversionOptions {
    surface?: ConversionSurface;
    includeHeader?: boolean;
}

export function appendFormatConversionList(
    markdown: vscode.MarkdownString,
    conversions: FormatConversion[],
    options?: AppendFormatConversionOptions
): void {
    if (conversions.length === 0) {
        return;
    }

    const surface: ConversionSurface = options?.surface ?? 'hover';
    const includeHeader = options?.includeHeader ?? true;

    if (includeHeader) {
        markdown.appendMarkdown(`**${t(LocalizedStrings.TOOLTIP_FORMATS_AVAILABLE)}:**\n\n`);
    }

    for (const conversion of conversions) {
        const label = getFormatLabel(conversion.format);
        const payload: CopyColorCommandPayload = {
            value: conversion.value,
            format: conversion.format,
            source: surface
        };
        const encodedPayload = encodeURIComponent(JSON.stringify(payload));
        markdown.appendMarkdown(
            `- ${label}: [\`${conversion.value}\`](command:colorbuddy.copyColorAs?${encodedPayload}) — ${t(LocalizedStrings.TOOLTIP_CLICK_TO_COPY)}\n`
        );
    }

    markdown.appendMarkdown('\n');
}
