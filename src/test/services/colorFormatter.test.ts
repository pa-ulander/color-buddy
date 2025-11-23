import * as assert from 'assert';
import * as vscode from 'vscode';
import { ColorFormatter } from '../../services/colorFormatter';
import type { ColorFormat } from '../../types';

suite('ColorFormatter Service', () => {
    let formatter: ColorFormatter;

    setup(() => {
        formatter = new ColorFormatter();
    });

    suite('formatByFormat', () => {
        test('should format color as hex when alpha is 1', () => {
            const color = new vscode.Color(1, 0, 0, 1); // Red
            const result = formatter.formatByFormat(color, 'hex');
            assert.strictEqual(result, '#ff0000');
        });

        test('should return undefined for hex format when alpha < 1', () => {
            const color = new vscode.Color(1, 0, 0, 0.5);
            const result = formatter.formatByFormat(color, 'hex');
            assert.strictEqual(result, undefined);
        });

        test('should format color as hexAlpha regardless of alpha', () => {
            const color = new vscode.Color(1, 0, 0, 0.5);
            const result = formatter.formatByFormat(color, 'hexAlpha');
            assert.strictEqual(result, '#ff000080');
        });

        test('should format color as rgb when alpha is 1', () => {
            const color = new vscode.Color(1, 0, 0, 1);
            const result = formatter.formatByFormat(color, 'rgb');
            assert.strictEqual(result, 'rgb(255, 0, 0)');
        });

        test('should return undefined for rgb format when alpha < 1', () => {
            const color = new vscode.Color(1, 0, 0, 0.5);
            const result = formatter.formatByFormat(color, 'rgb');
            assert.strictEqual(result, undefined);
        });

        test('should format color as rgba regardless of alpha', () => {
            const color = new vscode.Color(1, 0, 0, 0.5);
            const result = formatter.formatByFormat(color, 'rgba');
            assert.strictEqual(result, 'rgba(255, 0, 0, 0.5)');
        });

        test('should format color as hsl when alpha is 1', () => {
            const color = new vscode.Color(1, 0, 0, 1);
            const result = formatter.formatByFormat(color, 'hsl');
            assert.strictEqual(result, 'hsl(0 100% 50%)');
        });

        test('should return undefined for hsl format when alpha < 1', () => {
            const color = new vscode.Color(1, 0, 0, 0.5);
            const result = formatter.formatByFormat(color, 'hsl');
            assert.strictEqual(result, undefined);
        });

        test('should format color as hsla regardless of alpha', () => {
            const color = new vscode.Color(1, 0, 0, 0.5);
            const result = formatter.formatByFormat(color, 'hsla');
            assert.strictEqual(result, 'hsla(0 100% 50% / 0.50)');
        });

        test('should format color as Tailwind compact HSL', () => {
            const color = new vscode.Color(1, 0, 0, 1);
            const result = formatter.formatByFormat(color, 'tailwind');
            assert.strictEqual(result, '0 100% 50%');
        });

        test('should return undefined for unknown format', () => {
            const color = new vscode.Color(1, 0, 0, 1);
            const result = formatter.formatByFormat(color, 'unknown' as ColorFormat);
            assert.strictEqual(result, undefined);
        });
    });

    suite('toRgba', () => {
        test('should format opaque color as rgb by default', () => {
            const color = new vscode.Color(1, 0, 0, 1);
            const result = formatter.toRgba(color);
            assert.strictEqual(result, 'rgb(255, 0, 0)');
        });

        test('should format transparent color as rgba by default', () => {
            const color = new vscode.Color(1, 0, 0, 0.5);
            const result = formatter.toRgba(color);
            assert.strictEqual(result, 'rgba(255, 0, 0, 0.5)');
        });

        test('should force rgba format when forceAlpha is true', () => {
            const color = new vscode.Color(1, 0, 0, 1);
            const result = formatter.toRgba(color, true);
            assert.strictEqual(result, 'rgba(255, 0, 0, 1)');
        });

        test('should handle fractional RGB values correctly', () => {
            const color = new vscode.Color(0.5, 0.25, 0.75, 1);
            const result = formatter.toRgba(color);
            assert.strictEqual(result, 'rgb(128, 64, 191)');
        });

        test('should round alpha to 2 decimal places', () => {
            const color = new vscode.Color(1, 0, 0, 0.123456);
            const result = formatter.toRgba(color);
            assert.strictEqual(result, 'rgba(255, 0, 0, 0.12)');
        });
    });

    suite('toHex', () => {
        test('should format color as 6-digit hex by default', () => {
            const color = new vscode.Color(1, 0, 0, 1);
            const result = formatter.toHex(color);
            assert.strictEqual(result, '#ff0000');
        });

        test('should format color as 8-digit hex when includeAlpha is true', () => {
            const color = new vscode.Color(1, 0, 0, 0.5);
            const result = formatter.toHex(color, true);
            assert.strictEqual(result, '#ff000080');
        });

        test('should pad single-digit hex components with zero', () => {
            const color = new vscode.Color(0.01, 0.01, 0.01, 1);
            const result = formatter.toHex(color);
            assert.strictEqual(result, '#030303');
        });

        test('should handle fully transparent color', () => {
            const color = new vscode.Color(1, 0, 0, 0);
            const result = formatter.toHex(color, true);
            assert.strictEqual(result, '#ff000000');
        });

        test('should handle pure white', () => {
            const color = new vscode.Color(1, 1, 1, 1);
            const result = formatter.toHex(color);
            assert.strictEqual(result, '#ffffff');
        });

        test('should handle pure black', () => {
            const color = new vscode.Color(0, 0, 0, 1);
            const result = formatter.toHex(color);
            assert.strictEqual(result, '#000000');
        });
    });

    suite('toHsl', () => {
        test('should format opaque red as hsl by default', () => {
            const color = new vscode.Color(1, 0, 0, 1);
            const result = formatter.toHsl(color);
            assert.strictEqual(result, 'hsl(0 100% 50%)');
        });

        test('should format transparent color as hsla by default', () => {
            const color = new vscode.Color(1, 0, 0, 0.5);
            const result = formatter.toHsl(color);
            assert.strictEqual(result, 'hsla(0 100% 50% / 0.50)');
        });

        test('should force hsla format when forceAlpha is true', () => {
            const color = new vscode.Color(1, 0, 0, 1);
            const result = formatter.toHsl(color, true);
            assert.strictEqual(result, 'hsla(0 100% 50% / 1.00)');
        });

        test('should format green correctly', () => {
            const color = new vscode.Color(0, 1, 0, 1);
            const result = formatter.toHsl(color);
            assert.strictEqual(result, 'hsl(120 100% 50%)');
        });

        test('should format blue correctly', () => {
            const color = new vscode.Color(0, 0, 1, 1);
            const result = formatter.toHsl(color);
            assert.strictEqual(result, 'hsl(240 100% 50%)');
        });

        test('should handle gray (zero saturation)', () => {
            const color = new vscode.Color(0.5, 0.5, 0.5, 1);
            const result = formatter.toHsl(color);
            assert.strictEqual(result, 'hsl(0 0% 50%)');
        });
    });

    suite('toTailwind', () => {
        test('should format opaque color without alpha', () => {
            const color = new vscode.Color(1, 0, 0, 1);
            const result = formatter.toTailwind(color);
            assert.strictEqual(result, '0 100% 50%');
        });

        test('should include alpha separator for transparent colors', () => {
            const color = new vscode.Color(1, 0, 0, 0.5);
            const result = formatter.toTailwind(color);
            assert.strictEqual(result, '0 100% 50% / 0.50');
        });

        test('should format green as Tailwind compact HSL', () => {
            const color = new vscode.Color(0, 1, 0, 1);
            const result = formatter.toTailwind(color);
            assert.strictEqual(result, '120 100% 50%');
        });

        test('should format blue as Tailwind compact HSL', () => {
            const color = new vscode.Color(0, 0, 1, 1);
            const result = formatter.toTailwind(color);
            assert.strictEqual(result, '240 100% 50%');
        });

        test('should round HSL values to 2 decimal places', () => {
            const color = new vscode.Color(0.333, 0.667, 0.5, 1);
            const result = formatter.toTailwind(color);
            // Should produce predictable rounded values
            assert.ok(result.match(/^\d+(\.\d{1,2})? \d+(\.\d{1,2})?% \d+(\.\d{1,2})?%$/));
        });
    });

    suite('rgbToHsl', () => {
        test('should convert red to HSL', () => {
            const result = formatter.rgbToHsl(255, 0, 0);
            assert.strictEqual(result.h, 0);
            assert.strictEqual(result.s, 100);
            assert.strictEqual(result.l, 50);
        });

        test('should convert green to HSL', () => {
            const result = formatter.rgbToHsl(0, 255, 0);
            assert.strictEqual(result.h, 120);
            assert.strictEqual(result.s, 100);
            assert.strictEqual(result.l, 50);
        });

        test('should convert blue to HSL', () => {
            const result = formatter.rgbToHsl(0, 0, 255);
            assert.strictEqual(result.h, 240);
            assert.strictEqual(result.s, 100);
            assert.strictEqual(result.l, 50);
        });

        test('should convert white to HSL', () => {
            const result = formatter.rgbToHsl(255, 255, 255);
            assert.strictEqual(result.h, 0);
            assert.strictEqual(result.s, 0);
            assert.strictEqual(result.l, 100);
        });

        test('should convert black to HSL', () => {
            const result = formatter.rgbToHsl(0, 0, 0);
            assert.strictEqual(result.h, 0);
            assert.strictEqual(result.s, 0);
            assert.strictEqual(result.l, 0);
        });

        test('should convert gray to HSL with zero saturation', () => {
            const result = formatter.rgbToHsl(128, 128, 128);
            assert.strictEqual(result.h, 0);
            assert.strictEqual(result.s, 0);
            assert.strictEqual(Math.round(result.l), 50);
        });

        test('should handle cyan correctly', () => {
            const result = formatter.rgbToHsl(0, 255, 255);
            assert.strictEqual(result.h, 180);
            assert.strictEqual(result.s, 100);
            assert.strictEqual(result.l, 50);
        });

        test('should handle magenta correctly', () => {
            const result = formatter.rgbToHsl(255, 0, 255);
            assert.strictEqual(result.h, 300);
            assert.strictEqual(result.s, 100);
            assert.strictEqual(result.l, 50);
        });

        test('should handle yellow correctly', () => {
            const result = formatter.rgbToHsl(255, 255, 0);
            assert.strictEqual(result.h, 60);
            assert.strictEqual(result.s, 100);
            assert.strictEqual(result.l, 50);
        });
    });

    suite('Edge Cases', () => {
        test('should handle very small RGB values', () => {
            const color = new vscode.Color(0.001, 0.001, 0.001, 1);
            const hex = formatter.toHex(color);
            const rgb = formatter.toRgba(color);
            assert.ok(hex.startsWith('#'));
            assert.ok(rgb.startsWith('rgb('));
        });

        test('should handle very small alpha values', () => {
            const color = new vscode.Color(1, 0, 0, 0.001);
            const result = formatter.toRgba(color);
            assert.strictEqual(result, 'rgba(255, 0, 0, 0)');
        });

        test('should handle alpha value 0.999', () => {
            const color = new vscode.Color(1, 0, 0, 0.999);
            const result = formatter.toRgba(color);
            // Alpha rounds to 1.00, so it becomes fully opaque and uses rgb format
            assert.strictEqual(result, 'rgb(255, 0, 0)');
        });

        test('should preserve precision in HSL conversion', () => {
            const rgb = formatter.rgbToHsl(123, 45, 67);
            assert.ok(rgb.h >= 0 && rgb.h <= 360);
            assert.ok(rgb.s >= 0 && rgb.s <= 100);
            assert.ok(rgb.l >= 0 && rgb.l <= 100);
        });

        test('should handle all formats for same color consistently', () => {
            const color = new vscode.Color(0.5, 0.5, 0.5, 1);
            const hex = formatter.toHex(color);
            const rgb = formatter.toRgba(color);
            const hsl = formatter.toHsl(color);
            const tailwind = formatter.toTailwind(color);
            
            assert.ok(hex.length > 0);
            assert.ok(rgb.length > 0);
            assert.ok(hsl.length > 0);
            assert.ok(tailwind.length > 0);
        });
    });
});
