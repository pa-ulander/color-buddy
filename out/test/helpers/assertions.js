"use strict";
/**
 * Custom assertions for ColorBuddy tests
 */
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
exports.assertColorsEqual = assertColorsEqual;
exports.assertColorRGB = assertColorRGB;
exports.assertRangeEqual = assertRangeEqual;
exports.assertColorData = assertColorData;
exports.assertParsedColor = assertParsedColor;
exports.assertLength = assertLength;
exports.assertIncludes = assertIncludes;
exports.assertMatches = assertMatches;
exports.assertInRange = assertInRange;
exports.assertDefined = assertDefined;
exports.assertUndefined = assertUndefined;
exports.assertArraysEqualUnordered = assertArraysEqualUnordered;
exports.assertMapHasKey = assertMapHasKey;
exports.assertMapSize = assertMapSize;
const assert = __importStar(require("assert"));
const vscode = __importStar(require("vscode"));
/**
 * Assert that two colors are equal
 */
function assertColorsEqual(actual, expected, message) {
    const tolerance = 0.01; // Allow small floating point differences
    assert.ok(Math.abs(actual.red - expected.red) < tolerance &&
        Math.abs(actual.green - expected.green) < tolerance &&
        Math.abs(actual.blue - expected.blue) < tolerance &&
        Math.abs(actual.alpha - expected.alpha) < tolerance, message || `Colors not equal: actual RGB(${actual.red}, ${actual.green}, ${actual.blue}, ${actual.alpha}) vs expected RGB(${expected.red}, ${expected.green}, ${expected.blue}, ${expected.alpha})`);
}
/**
 * Assert that a color matches RGB values (0-255 range)
 */
function assertColorRGB(color, r, g, b, a = 1, message) {
    const expected = new vscode.Color(r / 255, g / 255, b / 255, a);
    assertColorsEqual(color, expected, message);
}
/**
 * Assert that a range matches expected positions
 */
function assertRangeEqual(actual, expected, message) {
    assert.ok(actual.start.line === expected.start.line &&
        actual.start.character === expected.start.character &&
        actual.end.line === expected.end.line &&
        actual.end.character === expected.end.character, message || `Ranges not equal: actual ${rangeToString(actual)} vs expected ${rangeToString(expected)}`);
}
/**
 * Assert that ColorData matches expected values
 */
function assertColorData(actual, expected, message) {
    if (expected.range) {
        assertRangeEqual(actual.range, expected.range, message);
    }
    if (expected.originalText !== undefined) {
        assert.strictEqual(actual.originalText, expected.originalText, message || 'originalText mismatch');
    }
    if (expected.normalizedColor !== undefined) {
        assert.strictEqual(actual.normalizedColor, expected.normalizedColor, message || 'normalizedColor mismatch');
    }
    if (expected.vscodeColor) {
        assertColorsEqual(actual.vscodeColor, expected.vscodeColor, message);
    }
    if (expected.isCssVariable !== undefined) {
        assert.strictEqual(actual.isCssVariable, expected.isCssVariable, message || 'isCssVariable mismatch');
    }
    if (expected.isTailwindClass !== undefined) {
        assert.strictEqual(actual.isTailwindClass, expected.isTailwindClass, message || 'isTailwindClass mismatch');
    }
    if (expected.isCssClass !== undefined) {
        assert.strictEqual(actual.isCssClass, expected.isCssClass, message || 'isCssClass mismatch');
    }
    if (expected.variableName !== undefined) {
        assert.strictEqual(actual.variableName, expected.variableName, message || 'variableName mismatch');
    }
    if (expected.cssClassName !== undefined) {
        assert.strictEqual(actual.cssClassName, expected.cssClassName, message || 'cssClassName mismatch');
    }
    if (expected.tailwindClass !== undefined) {
        assert.strictEqual(actual.tailwindClass, expected.tailwindClass, message || 'tailwindClass mismatch');
    }
}
/**
 * Assert that a ParsedColor matches expected values
 */
function assertParsedColor(actual, expected, message) {
    assert.ok(actual, message || 'ParsedColor is undefined');
    if (!actual) {
        return;
    }
    if (expected.vscodeColor) {
        assertColorsEqual(actual.vscodeColor, expected.vscodeColor, message);
    }
    if (expected.cssString !== undefined) {
        assert.strictEqual(actual.cssString, expected.cssString, message || 'cssString mismatch');
    }
    if (expected.formatPriority) {
        assert.deepStrictEqual(actual.formatPriority, expected.formatPriority, message || 'formatPriority mismatch');
    }
}
/**
 * Assert that an array contains a specific number of elements
 */
function assertLength(array, expectedLength, message) {
    assert.strictEqual(array.length, expectedLength, message || `Expected array length ${expectedLength}, got ${array.length}`);
}
/**
 * Assert that an array includes an element matching a predicate
 */
function assertIncludes(array, predicate, message) {
    assert.ok(array.some(predicate), message || 'Array does not include expected element');
}
/**
 * Assert that a string matches a regex pattern
 */
function assertMatches(actual, pattern, message) {
    assert.ok(pattern.test(actual), message || `String "${actual}" does not match pattern ${pattern}`);
}
/**
 * Assert that a value is within a range
 */
function assertInRange(actual, min, max, message) {
    assert.ok(actual >= min && actual <= max, message || `Value ${actual} is not in range [${min}, ${max}]`);
}
/**
 * Assert that a value is defined (not null or undefined)
 */
function assertDefined(value, message) {
    assert.ok(value !== null && value !== undefined, message || 'Value is null or undefined');
}
/**
 * Assert that a value is undefined
 */
function assertUndefined(value, message) {
    assert.strictEqual(value, undefined, message || 'Value is not undefined');
}
/**
 * Helper to convert range to string for error messages
 */
function rangeToString(range) {
    return `[${range.start.line}:${range.start.character}-${range.end.line}:${range.end.character}]`;
}
/**
 * Assert that two arrays have the same elements (order-independent)
 */
function assertArraysEqualUnordered(actual, expected, message) {
    assert.strictEqual(actual.length, expected.length, message || 'Array lengths differ');
    const actualSorted = [...actual].sort();
    const expectedSorted = [...expected].sort();
    assert.deepStrictEqual(actualSorted, expectedSorted, message || 'Arrays have different elements');
}
/**
 * Assert that a map contains a specific key
 */
function assertMapHasKey(map, key, message) {
    assert.ok(map.has(key), message || `Map does not contain key: ${key}`);
}
/**
 * Assert that a map has a specific size
 */
function assertMapSize(map, expectedSize, message) {
    assert.strictEqual(map.size, expectedSize, message || `Expected map size ${expectedSize}, got ${map.size}`);
}
//# sourceMappingURL=assertions.js.map