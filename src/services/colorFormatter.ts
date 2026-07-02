import * as vscode from 'vscode';
import type { ColorFormat } from '../types';

/**
 * Service for formatting VS Code colors into various string representations.
 * Handles conversion to hex, rgb(a), hsl(a), and Tailwind compact HSL formats.
 */
export class ColorFormatter {
    /**
     * Format a color according to the specified format.
     * Returns undefined if the format cannot represent the color (e.g., hex without alpha for transparent colors).
     */
    formatByFormat(color: vscode.Color, format: ColorFormat): string | undefined {
        switch (format) {
            case 'hex':
                return color.alpha === 1 ? this.toHex(color, false) : undefined;
            case 'hexAlpha':
                return this.toHex(color, true);
            case 'rgb':
                return color.alpha === 1 ? this.toRgba(color, false) : undefined;
            case 'rgba':
                return this.toRgba(color, true);
            case 'hsl':
                return color.alpha === 1 ? this.toHsl(color, false) : undefined;
            case 'hsla':
                return this.toHsl(color, true);
            case 'tailwind':
                return this.toTailwind(color);
            case 'oklab':
                return this.toOklab(color);
            case 'oklch':
                return this.toOklch(color);
            default:
                return undefined;
        }
    }

    /**
     * Convert color to RGB/RGBA string format.
     * @param color - The color to format
     * @param forceAlpha - Whether to always include alpha channel
     */
    toRgba(color: vscode.Color, forceAlpha = false): string {
        const r = Math.round(color.red * 255);
        const g = Math.round(color.green * 255);
        const b = Math.round(color.blue * 255);
        const a = Number(color.alpha.toFixed(2));
        
        if (!forceAlpha && a === 1) {
            return `rgb(${r}, ${g}, ${b})`;
        }
        
        return `rgba(${r}, ${g}, ${b}, ${a})`;
    }

    /**
     * Convert color to hexadecimal string format.
     * @param color - The color to format
     * @param includeAlpha - Whether to include alpha channel
     */
    toHex(color: vscode.Color, includeAlpha = false): string {
        const r = Math.round(color.red * 255).toString(16).padStart(2, '0');
        const g = Math.round(color.green * 255).toString(16).padStart(2, '0');
        const b = Math.round(color.blue * 255).toString(16).padStart(2, '0');
        const base = `#${r}${g}${b}`;
        
        if (!includeAlpha) {
            return base;
        }
        
        const alpha = Math.round(color.alpha * 255).toString(16).padStart(2, '0');
        return `${base}${alpha}`;
    }

    /**
     * Convert color to HSL/HSLA string format.
     * @param color - The color to format
     * @param forceAlpha - Whether to always include alpha channel
     */
    toHsl(color: vscode.Color, forceAlpha = false): string {
        const { h, s, l } = this.rgbToHsl(color.red * 255, color.green * 255, color.blue * 255);
        const base = `${this.round(h)} ${this.round(s)}% ${this.round(l)}%`;
        
        if (!forceAlpha && color.alpha === 1) {
            return `hsl(${base})`;
        }
        
        return `hsla(${base} / ${color.alpha.toFixed(2)})`;
    }

    /**
     * Convert color to Tailwind compact HSL format.
     * Format: "h s% l%" or "h s% l% / alpha"
     */
    toTailwind(color: vscode.Color): string {
        const { h, s, l } = this.rgbToHsl(color.red * 255, color.green * 255, color.blue * 255);
        const base = `${this.round(h)} ${this.round(s)}% ${this.round(l)}%`;
        
        return color.alpha === 1 ? base : `${base} / ${color.alpha.toFixed(2)}`;
    }

    /**
     * Convert color to OKLab string format.
     */
    toOklab(color: vscode.Color, forceAlpha = false): string {
        const { l, a, b } = this.rgbToOklab(color.red, color.green, color.blue);
        const base = `${this.roundTo(l, 5)} ${this.roundTo(a, 5)} ${this.roundTo(b, 5)}`;

        if (!forceAlpha && color.alpha === 1) {
            return `oklab(${base})`;
        }

        return `oklab(${base} / ${color.alpha.toFixed(2)})`;
    }

    /**
     * Convert color to OKLCH string format.
     */
    toOklch(color: vscode.Color, forceAlpha = false): string {
        const { l, c, h } = this.rgbToOklch(color.red, color.green, color.blue);
        const base = `${this.roundTo(l, 5)} ${this.roundTo(c, 5)} ${this.roundTo(h, 5)}`;

        if (!forceAlpha && color.alpha === 1) {
            return `oklch(${base})`;
        }

        return `oklch(${base} / ${color.alpha.toFixed(2)})`;
    }

    /**
     * Convert RGB values to HSL color space.
     * @param r - Red component (0-255)
     * @param g - Green component (0-255)
     * @param b - Blue component (0-255)
     * @returns HSL values where h is 0-360, s and l are 0-100
     */
    rgbToHsl(r: number, g: number, b: number): { h: number; s: number; l: number } {
        r /= 255;
        g /= 255;
        b /= 255;

        const max = Math.max(r, g, b);
        const min = Math.min(r, g, b);
        let h = 0, s = 0;
        const l = (max + min) / 2;

        if (max !== min) {
            const d = max - min;
            s = l > 0.5 ? d / (2 - max - min) : d / (max + min);

            switch (max) {
                case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
                case g: h = ((b - r) / d + 2) / 6; break;
                case b: h = ((r - g) / d + 4) / 6; break;
            }
        }

        return { h: h * 360, s: s * 100, l: l * 100 };
    }

    rgbToOklab(r: number, g: number, b: number): { l: number; a: number; b: number } {
        const rLinear = this.srgbToLinear(this.clamp(r, 0, 1));
        const gLinear = this.srgbToLinear(this.clamp(g, 0, 1));
        const bLinear = this.srgbToLinear(this.clamp(b, 0, 1));

        const l = Math.cbrt(0.4122214708 * rLinear + 0.5363325363 * gLinear + 0.0514459929 * bLinear);
        const m = Math.cbrt(0.2119034982 * rLinear + 0.6806995451 * gLinear + 0.1073969566 * bLinear);
        const s = Math.cbrt(0.0883024619 * rLinear + 0.2817188376 * gLinear + 0.6299787005 * bLinear);

        return {
            l: 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
            a: 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
            b: 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s
        };
    }

    rgbToOklch(r: number, g: number, b: number): { l: number; c: number; h: number } {
        const oklab = this.rgbToOklab(r, g, b);
        const c = Math.sqrt(oklab.a * oklab.a + oklab.b * oklab.b);
        let h = (Math.atan2(oklab.b, oklab.a) * 180) / Math.PI;
        if (h < 0) {
            h += 360;
        }

        return { l: oklab.l, c, h };
    }

    /**
     * Round a number to 2 decimal places.
     */
    private round(value: number): number {
        return Math.round(value * 100) / 100;
    }

    private roundTo(value: number, decimals: number): number {
        const factor = Math.pow(10, decimals);
        return Math.round(value * factor) / factor;
    }

    private srgbToLinear(channel: number): number {
        if (channel <= 0.04045) {
            return channel / 12.92;
        }
        return Math.pow((channel + 0.055) / 1.055, 2.4);
    }

    private clamp(value: number, min: number, max: number): number {
        return Math.min(Math.max(value, min), max);
    }
}
