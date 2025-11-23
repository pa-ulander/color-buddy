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
exports.ColorParser = void 0;
const vscode = __importStar(require("vscode"));
/**
 * Service for parsing color strings into structured color data.
 * Handles multiple color formats: hex, rgb(a), hsl(a), and Tailwind compact HSL.
 */
class ColorParser {
    /**
     * Parse a color string into a ParsedColor object.
     * @param raw - The raw color string to parse
     * @returns ParsedColor object or undefined if parsing fails
     */
    parseColor(raw) {
        const text = raw.trim();
        // Try hex color
        const hexMatch = text.match(/^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i);
        if (hexMatch) {
            return this.parseHexColor(text);
        }
        // Try RGB/RGBA function
        if (/^(?:rgb|rgba)\(/i.test(text)) {
            return this.parseRgbFunction(text);
        }
        // Try HSL/HSLA function
        if (/^(?:hsl|hsla)\(/i.test(text)) {
            return this.parseHslFunction(text);
        }
        // Try Tailwind compact HSL format
        const tailwindMatch = text.match(/^([0-9]+(?:\.[0-9]+)?)\s+([0-9]+(?:\.[0-9]+)?)%\s+([0-9]+(?:\.[0-9]+)?)%(?:\s*\/\s*(0?\.\d+|1(?:\.0+)?))?$/i);
        if (tailwindMatch) {
            return this.parseTailwindCompactHsl(tailwindMatch);
        }
        return undefined;
    }
    /**
     * Parse a color string to VS Code Color object.
     * @param colorValue - The color string to parse
     * @returns VS Code Color object or undefined if parsing fails
     */
    parseColorToVSCode(colorValue) {
        const text = colorValue.trim();
        // Hex color
        if (text.startsWith('#')) {
            return this.parseHexToVSCode(text);
        }
        // RGB function
        if (/^rgb/i.test(text)) {
            const parsed = this.parseRgbFunction(text);
            return parsed?.vscodeColor;
        }
        // HSL function
        if (/^hsl/i.test(text)) {
            const parsed = this.parseHslFunction(text);
            return parsed?.vscodeColor;
        }
        // Tailwind compact HSL
        const tailwindMatch = text.match(/^([0-9]+(?:\.[0-9]+)?)\s+([0-9]+(?:\.[0-9]+)?)%\s+([0-9]+(?:\.[0-9]+)?)%(?:\s*\/\s*(0?\.\d+|1(?:\.0+)?))?$/i);
        if (tailwindMatch) {
            const parsed = this.parseTailwindCompactHsl(tailwindMatch);
            return parsed?.vscodeColor;
        }
        return undefined;
    }
    /**
     * Get format priority list for a given original format.
     * This determines the order of formats to try when converting colors.
     */
    getFormatPriority(original) {
        const priority = [original];
        const fallbacks = ['rgba', 'hsla', 'hexAlpha', 'rgb', 'hsl', 'hex', 'tailwind'];
        for (const format of fallbacks) {
            if (!priority.includes(format)) {
                priority.push(format);
            }
        }
        return priority;
    }
    // Private parsing methods
    parseHexColor(text) {
        const normalized = this.normalizeHex(text);
        if (!normalized) {
            return undefined;
        }
        const color = this.parseHexToVSCode(normalized);
        if (!color) {
            return undefined;
        }
        const sanitized = text.startsWith('#') ? text.slice(1) : text;
        const hasAlpha = sanitized.length === 4 || sanitized.length === 8;
        const originalFormat = hasAlpha ? 'hexAlpha' : 'hex';
        return {
            vscodeColor: color,
            cssString: this.rgbaString(color, false),
            formatPriority: this.getFormatPriority(originalFormat)
        };
    }
    parseRgbFunction(raw) {
        const match = raw.match(/^rgba?\((.*)\)$/i);
        if (!match) {
            return undefined;
        }
        const parts = match[1]
            .replace(/\//g, ' ')
            .replace(/,/g, ' ')
            .split(/\s+/)
            .map(part => part.trim())
            .filter(part => part.length > 0);
        if (parts.length < 3) {
            return undefined;
        }
        const [rPart, gPart, bPart, aPart] = parts;
        const r = this.normalizeRgbComponent(rPart);
        const g = this.normalizeRgbComponent(gPart);
        const b = this.normalizeRgbComponent(bPart);
        if (r === undefined || g === undefined || b === undefined) {
            return undefined;
        }
        const a = this.normalizeAlpha(aPart);
        const color = new vscode.Color(r / 255, g / 255, b / 255, a);
        const hasAlphaOriginal = /rgba/i.test(raw) || aPart !== undefined || raw.includes('/');
        const originalFormat = hasAlphaOriginal ? 'rgba' : 'rgb';
        return {
            vscodeColor: color,
            cssString: this.rgbaString(color, false),
            formatPriority: this.getFormatPriority(originalFormat)
        };
    }
    parseHslFunction(raw) {
        const match = raw.match(/^hsla?\((.*)\)$/i);
        if (!match) {
            return undefined;
        }
        const segments = match[1]
            .replace(/\//g, ' ')
            .replace(/,/g, ' ')
            .split(/\s+/)
            .map(segment => segment.trim())
            .filter(Boolean);
        if (segments.length < 3) {
            return undefined;
        }
        const [hPart, sPart, lPart, aPart] = segments;
        const h = parseFloat(hPart);
        const s = parseFloat(sPart.replace('%', ''));
        const l = parseFloat(lPart.replace('%', ''));
        // Reject if any value is NaN
        if (Number.isNaN(h) || Number.isNaN(s) || Number.isNaN(l)) {
            return undefined;
        }
        const hClamped = this.clamp(h, 0, 360);
        const sClamped = this.clamp(s, 0, 100);
        const lClamped = this.clamp(l, 0, 100);
        const a = this.normalizeAlpha(aPart);
        const rgb = this.hslToRgb(hClamped, sClamped, lClamped);
        const color = new vscode.Color(rgb.r / 255, rgb.g / 255, rgb.b / 255, a);
        const hasAlphaOriginal = /hsla/i.test(raw) || aPart !== undefined || raw.includes('/');
        const originalFormat = hasAlphaOriginal ? 'hsla' : 'hsl';
        return {
            vscodeColor: color,
            cssString: this.rgbaString(color, false),
            formatPriority: this.getFormatPriority(originalFormat)
        };
    }
    parseTailwindCompactHsl(match) {
        const h = this.clamp(Number(match[1]), 0, 360);
        const s = this.clamp(Number(match[2]), 0, 100);
        const l = this.clamp(Number(match[3]), 0, 100);
        const alpha = this.normalizeAlpha(match[4]);
        const rgb = this.hslToRgb(h, s, l);
        const color = new vscode.Color(rgb.r / 255, rgb.g / 255, rgb.b / 255, alpha);
        return {
            vscodeColor: color,
            cssString: this.rgbaString(color, false),
            formatPriority: this.getFormatPriority('tailwind')
        };
    }
    parseHexToVSCode(value) {
        const text = value.startsWith('#') ? value.slice(1) : value;
        const length = text.length;
        if (length !== 3 && length !== 4 && length !== 6 && length !== 8) {
            return undefined;
        }
        let normalized = text;
        if (length === 3 || length === 4) {
            normalized = text.split('').map(ch => ch + ch).join('');
        }
        const r = parseInt(normalized.slice(0, 2), 16);
        const g = parseInt(normalized.slice(2, 4), 16);
        const b = parseInt(normalized.slice(4, 6), 16);
        const a = length === 4 || length === 8
            ? parseInt(normalized.slice(6, 8), 16) / 255
            : 1.0;
        if (Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b) || Number.isNaN(a)) {
            return undefined;
        }
        return new vscode.Color(r / 255, g / 255, b / 255, a);
    }
    normalizeHex(value) {
        const text = value.startsWith('#') ? value.slice(1) : value;
        const length = text.length;
        if (length !== 3 && length !== 4 && length !== 6 && length !== 8) {
            return undefined;
        }
        if (length === 3 || length === 4) {
            const expanded = text.split('').map(ch => ch + ch).join('');
            return `#${expanded}`;
        }
        return `#${text.toLowerCase()}`;
    }
    normalizeRgbComponent(value) {
        if (value.endsWith('%')) {
            const percent = this.clamp(parseFloat(value), 0, 100);
            return Math.round((percent / 100) * 255);
        }
        const numeric = Number(value);
        if (Number.isNaN(numeric)) {
            return undefined;
        }
        return this.clamp(Math.round(numeric), 0, 255);
    }
    normalizeAlpha(value) {
        if (!value || value.trim() === '') {
            return 1.0;
        }
        const text = value.trim();
        if (text.endsWith('%')) {
            const percent = this.clamp(parseFloat(text), 0, 100);
            return percent / 100;
        }
        const numeric = parseFloat(text);
        if (Number.isNaN(numeric)) {
            return 1.0;
        }
        return this.clamp(numeric, 0, 1);
    }
    hslToRgb(h, s, l) {
        const hNorm = h / 360;
        const sNorm = s / 100;
        const lNorm = l / 100;
        if (sNorm === 0) {
            const gray = Math.round(lNorm * 255);
            return { r: gray, g: gray, b: gray };
        }
        const hue2rgb = (p, q, t) => {
            let tNorm = t;
            if (tNorm < 0) {
                tNorm += 1;
            }
            if (tNorm > 1) {
                tNorm -= 1;
            }
            if (tNorm < 1 / 6) {
                return p + (q - p) * 6 * tNorm;
            }
            if (tNorm < 1 / 2) {
                return q;
            }
            if (tNorm < 2 / 3) {
                return p + (q - p) * (2 / 3 - tNorm) * 6;
            }
            return p;
        };
        const q = lNorm < 0.5 ? lNorm * (1 + sNorm) : lNorm + sNorm - lNorm * sNorm;
        const p = 2 * lNorm - q;
        const r = Math.round(hue2rgb(p, q, hNorm + 1 / 3) * 255);
        const g = Math.round(hue2rgb(p, q, hNorm) * 255);
        const b = Math.round(hue2rgb(p, q, hNorm - 1 / 3) * 255);
        return { r, g, b };
    }
    rgbaString(color, forceAlpha) {
        const r = Math.round(color.red * 255);
        const g = Math.round(color.green * 255);
        const b = Math.round(color.blue * 255);
        const a = Math.round(color.alpha * 100) / 100;
        if (forceAlpha || a < 1) {
            return `rgba(${r}, ${g}, ${b}, ${a})`;
        }
        return `rgb(${r}, ${g}, ${b})`;
    }
    clamp(value, min, max) {
        return Math.min(Math.max(value, min), max);
    }
}
exports.ColorParser = ColorParser;
//# sourceMappingURL=colorParser.js.map