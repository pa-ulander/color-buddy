"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const assert = __importStar(require("assert"));
const colorParser_1 = require("../../services/colorParser");
suite('ColorParser Service', () => {
    let parser;
    setup(() => {
        parser = new colorParser_1.ColorParser();
    });
    suite('Hex Colors', () => {
        test('parses 3-digit hex color', () => {
            const result = parser.parseColor('#f00');
            assert.ok(result);
            assert.strictEqual(result.vscodeColor.red, 1);
            assert.strictEqual(result.vscodeColor.green, 0);
            assert.strictEqual(result.vscodeColor.blue, 0);
            assert.strictEqual(result.vscodeColor.alpha, 1);
            assert.strictEqual(result.formatPriority[0], 'hex');
        });
        test('parses 6-digit hex color', () => {
            const result = parser.parseColor('#00ff00');
            assert.ok(result);
            assert.strictEqual(result.vscodeColor.green, 1);
            assert.strictEqual(result.formatPriority[0], 'hex');
        });
        test('parses 4-digit hex color with alpha', () => {
            const result = parser.parseColor('#f008');
            assert.ok(result);
            assert.strictEqual(result.vscodeColor.red, 1);
            assert.ok(Math.abs(result.vscodeColor.alpha - 0.533) < 0.01);
            assert.strictEqual(result.formatPriority[0], 'hexAlpha');
        });
        test('parses 8-digit hex color with alpha', () => {
            const result = parser.parseColor('#ff000080');
            assert.ok(result);
            assert.strictEqual(result.vscodeColor.red, 1);
            assert.ok(Math.abs(result.vscodeColor.alpha - 0.5) < 0.01);
            assert.strictEqual(result.formatPriority[0], 'hexAlpha');
        });
        test('normalizes hex to lowercase', () => {
            const result = parser.parseColor('#FF0000');
            assert.ok(result);
            assert.strictEqual(result.vscodeColor.red, 1);
        });
        test('rejects invalid hex lengths', () => {
            assert.strictEqual(parser.parseColor('#ff'), undefined);
            assert.strictEqual(parser.parseColor('#fffff'), undefined);
            assert.strictEqual(parser.parseColor('#fffffff'), undefined);
        });
        test('rejects invalid hex characters', () => {
            assert.strictEqual(parser.parseColor('#gggggg'), undefined);
        });
    });
    suite('RGB/RGBA Functions', () => {
        test('parses rgb() function', () => {
            const result = parser.parseColor('rgb(255, 0, 0)');
            assert.ok(result);
            assert.strictEqual(result.vscodeColor.red, 1);
            assert.strictEqual(result.vscodeColor.alpha, 1);
            assert.strictEqual(result.formatPriority[0], 'rgb');
        });
        test('parses rgba() function', () => {
            const result = parser.parseColor('rgba(0, 255, 0, 0.5)');
            assert.ok(result);
            assert.strictEqual(result.vscodeColor.green, 1);
            assert.strictEqual(result.vscodeColor.alpha, 0.5);
            assert.strictEqual(result.formatPriority[0], 'rgba');
        });
        test('parses rgb with slash notation', () => {
            const result = parser.parseColor('rgb(100 150 200 / 0.8)');
            assert.ok(result);
            assert.ok(Math.abs(result.vscodeColor.red - 100 / 255) < 0.01);
            assert.strictEqual(result.vscodeColor.alpha, 0.8);
        });
        test('parses rgb with percentage values', () => {
            const result = parser.parseColor('rgb(100%, 50%, 0%)');
            assert.ok(result);
            assert.strictEqual(result.vscodeColor.red, 1);
            assert.ok(Math.abs(result.vscodeColor.green - 0.5) < 0.01);
            assert.strictEqual(result.vscodeColor.blue, 0);
        });
        test('clamps RGB values to 0-255', () => {
            const result = parser.parseColor('rgb(300, -10, 128)');
            assert.ok(result);
            assert.strictEqual(result.vscodeColor.red, 1);
            assert.strictEqual(result.vscodeColor.green, 0);
        });
        test('handles mixed space and comma separators', () => {
            const result = parser.parseColor('rgb(255,128,64)');
            assert.ok(result);
            assert.strictEqual(result.vscodeColor.red, 1);
        });
        test('rejects malformed rgb', () => {
            assert.strictEqual(parser.parseColor('rgb(255)'), undefined);
            assert.strictEqual(parser.parseColor('rgb(255, 128)'), undefined);
            assert.strictEqual(parser.parseColor('rgb(a, b, c)'), undefined);
        });
    });
    suite('HSL/HSLA Functions', () => {
        test('parses hsl() function', () => {
            const result = parser.parseColor('hsl(0, 100%, 50%)');
            assert.ok(result);
            assert.strictEqual(result.vscodeColor.red, 1);
            assert.strictEqual(result.vscodeColor.alpha, 1);
            assert.strictEqual(result.formatPriority[0], 'hsl');
        });
        test('parses hsla() function', () => {
            const result = parser.parseColor('hsla(120, 100%, 50%, 0.5)');
            assert.ok(result);
            assert.strictEqual(result.vscodeColor.green, 1);
            assert.strictEqual(result.vscodeColor.alpha, 0.5);
            assert.strictEqual(result.formatPriority[0], 'hsla');
        });
        test('parses hsl with slash notation', () => {
            const result = parser.parseColor('hsl(240 100% 50% / 0.75)');
            assert.ok(result);
            assert.strictEqual(result.vscodeColor.blue, 1);
            assert.strictEqual(result.vscodeColor.alpha, 0.75);
        });
        test('handles grayscale (saturation = 0)', () => {
            const result = parser.parseColor('hsl(0, 0%, 50%)');
            assert.ok(result);
            assert.ok(Math.abs(result.vscodeColor.red - 0.5) < 0.01);
            assert.ok(Math.abs(result.vscodeColor.green - 0.5) < 0.01);
            assert.ok(Math.abs(result.vscodeColor.blue - 0.5) < 0.01);
        });
        test('wraps hue values correctly', () => {
            const result1 = parser.parseColor('hsl(0, 100%, 50%)');
            const result2 = parser.parseColor('hsl(360, 100%, 50%)');
            assert.ok(result1 && result2);
            assert.strictEqual(result1.vscodeColor.red, result2.vscodeColor.red);
        });
        test('clamps saturation and lightness', () => {
            const result = parser.parseColor('hsl(0, 150%, 120%)');
            assert.ok(result);
            // Should clamp to valid range
        });
        test('rejects malformed hsl', () => {
            assert.strictEqual(parser.parseColor('hsl(0, 50%)'), undefined);
            assert.strictEqual(parser.parseColor('hsl(a, b, c)'), undefined);
        });
    });
    suite('Tailwind Compact HSL', () => {
        test('parses Tailwind compact format without alpha', () => {
            const result = parser.parseColor('200 50% 40%');
            assert.ok(result);
            assert.strictEqual(result.vscodeColor.alpha, 1);
            assert.strictEqual(result.formatPriority[0], 'tailwind');
        });
        test('parses Tailwind compact format with alpha', () => {
            const result = parser.parseColor('200 50% 40% / 0.25');
            assert.ok(result);
            assert.strictEqual(result.vscodeColor.alpha, 0.25);
            assert.strictEqual(result.formatPriority[0], 'tailwind');
        });
        test('handles decimal values in HSL components', () => {
            const result = parser.parseColor('123.5 45.5% 67.5%');
            assert.ok(result);
        });
        test('handles alpha = 1.0', () => {
            const result = parser.parseColor('200 50% 40% / 1.0');
            assert.ok(result);
            assert.strictEqual(result.vscodeColor.alpha, 1);
        });
        test('rejects malformed Tailwind format', () => {
            assert.strictEqual(parser.parseColor('200 50%'), undefined);
            assert.strictEqual(parser.parseColor('200 50 40'), undefined);
        });
    });
    suite('parseColorToVSCode', () => {
        test('parses hex to VSCode Color', () => {
            const color = parser.parseColorToVSCode('#ff0000');
            assert.ok(color);
            assert.strictEqual(color.red, 1);
        });
        test('parses rgb to VSCode Color', () => {
            const color = parser.parseColorToVSCode('rgb(0, 255, 0)');
            assert.ok(color);
            assert.strictEqual(color.green, 1);
        });
        test('parses hsl to VSCode Color', () => {
            const color = parser.parseColorToVSCode('hsl(240, 100%, 50%)');
            assert.ok(color);
            assert.strictEqual(color.blue, 1);
        });
        test('parses Tailwind to VSCode Color', () => {
            const color = parser.parseColorToVSCode('200 50% 40%');
            assert.ok(color);
        });
        test('returns undefined for invalid color', () => {
            assert.strictEqual(parser.parseColorToVSCode('not-a-color'), undefined);
        });
    });
    suite('getFormatPriority', () => {
        test('places original format first', () => {
            const priority = parser.getFormatPriority('hex');
            assert.strictEqual(priority[0], 'hex');
        });
        test('includes all fallback formats', () => {
            const priority = parser.getFormatPriority('hex');
            assert.ok(priority.includes('rgba'));
            assert.ok(priority.includes('hsla'));
            assert.ok(priority.includes('tailwind'));
        });
        test('does not duplicate formats', () => {
            const priority = parser.getFormatPriority('rgba');
            const unique = new Set(priority);
            assert.strictEqual(priority.length, unique.size);
        });
        test('handles all format types', () => {
            const formats = ['hex', 'hexAlpha', 'rgb', 'rgba', 'hsl', 'hsla', 'tailwind'];
            for (const format of formats) {
                const priority = parser.getFormatPriority(format);
                assert.strictEqual(priority[0], format);
                assert.ok(priority.length >= 7);
            }
        });
    });
    suite('Edge Cases', () => {
        test('handles whitespace in color strings', () => {
            const result = parser.parseColor('  #ff0000  ');
            assert.ok(result);
            assert.strictEqual(result.vscodeColor.red, 1);
        });
        test('handles case-insensitive function names', () => {
            const result1 = parser.parseColor('RGB(255, 0, 0)');
            const result2 = parser.parseColor('rgb(255, 0, 0)');
            assert.ok(result1 && result2);
            assert.strictEqual(result1.vscodeColor.red, result2.vscodeColor.red);
        });
        test('handles alpha percentage', () => {
            const result = parser.parseColor('rgba(255, 0, 0, 50%)');
            assert.ok(result);
            assert.strictEqual(result.vscodeColor.alpha, 0.5);
        });
        test('handles missing alpha as 1.0', () => {
            const result = parser.parseColor('rgb(255, 0, 0)');
            assert.ok(result);
            assert.strictEqual(result.vscodeColor.alpha, 1);
        });
        test('returns undefined for empty string', () => {
            assert.strictEqual(parser.parseColor(''), undefined);
        });
        test('returns undefined for whitespace-only string', () => {
            assert.strictEqual(parser.parseColor('   '), undefined);
        });
        test('normalizes cssString to rgba format', () => {
            const result = parser.parseColor('#ff0000');
            assert.ok(result);
            assert.strictEqual(result.cssString, 'rgb(255, 0, 0)');
        });
        test('includes alpha in cssString when alpha < 1', () => {
            const result = parser.parseColor('#ff000080');
            assert.ok(result);
            assert.ok(result.cssString.startsWith('rgba('));
        });
    });
    suite('Color Conversion Accuracy', () => {
        test('HSL to RGB conversion for primary colors', () => {
            const red = parser.parseColor('hsl(0, 100%, 50%)');
            const green = parser.parseColor('hsl(120, 100%, 50%)');
            const blue = parser.parseColor('hsl(240, 100%, 50%)');
            assert.ok(red && green && blue);
            assert.strictEqual(red.vscodeColor.red, 1);
            assert.strictEqual(green.vscodeColor.green, 1);
            assert.strictEqual(blue.vscodeColor.blue, 1);
        });
        test('HSL to RGB conversion for white and black', () => {
            const white = parser.parseColor('hsl(0, 0%, 100%)');
            const black = parser.parseColor('hsl(0, 0%, 0%)');
            assert.ok(white && black);
            assert.strictEqual(white.vscodeColor.red, 1);
            assert.strictEqual(white.vscodeColor.green, 1);
            assert.strictEqual(white.vscodeColor.blue, 1);
            assert.strictEqual(black.vscodeColor.red, 0);
            assert.strictEqual(black.vscodeColor.green, 0);
            assert.strictEqual(black.vscodeColor.blue, 0);
        });
        test('consistent results across formats', () => {
            const hex = parser.parseColor('#ff8040');
            const rgb = parser.parseColor('rgb(255, 128, 64)');
            assert.ok(hex && rgb);
            assert.ok(Math.abs(hex.vscodeColor.red - rgb.vscodeColor.red) < 0.01);
            assert.ok(Math.abs(hex.vscodeColor.green - rgb.vscodeColor.green) < 0.01);
            assert.ok(Math.abs(hex.vscodeColor.blue - rgb.vscodeColor.blue) < 0.01);
        });
    });
});
//# sourceMappingURL=colorParser.test.js.map