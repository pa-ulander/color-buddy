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

    /**
     * Round a number to 2 decimal places.
     */
    private round(value: number): number {
        return Math.round(value * 100) / 100;
    }
}
