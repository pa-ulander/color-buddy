/**
 * Custom assertions for ColorBuddy tests
 */

import * as assert from 'assert';
import * as vscode from 'vscode';
import type { ColorData, ParsedColor } from '../../types';

/**
 * Assert that two colors are equal
 */
export function assertColorsEqual(actual: vscode.Color, expected: vscode.Color, message?: string): void {
    const tolerance = 0.01; // Allow small floating point differences
    
    assert.ok(
        Math.abs(actual.red - expected.red) < tolerance &&
        Math.abs(actual.green - expected.green) < tolerance &&
        Math.abs(actual.blue - expected.blue) < tolerance &&
        Math.abs(actual.alpha - expected.alpha) < tolerance,
        message || `Colors not equal: actual RGB(${actual.red}, ${actual.green}, ${actual.blue}, ${actual.alpha}) vs expected RGB(${expected.red}, ${expected.green}, ${expected.blue}, ${expected.alpha})`
    );
}

/**
 * Assert that a color matches RGB values (0-255 range)
 */
export function assertColorRGB(color: vscode.Color, r: number, g: number, b: number, a = 1, message?: string): void {
    const expected = new vscode.Color(r / 255, g / 255, b / 255, a);
    assertColorsEqual(color, expected, message);
}

/**
 * Assert that a range matches expected positions
 */
export function assertRangeEqual(actual: vscode.Range, expected: vscode.Range, message?: string): void {
    assert.ok(
        actual.start.line === expected.start.line &&
        actual.start.character === expected.start.character &&
        actual.end.line === expected.end.line &&
        actual.end.character === expected.end.character,
        message || `Ranges not equal: actual ${rangeToString(actual)} vs expected ${rangeToString(expected)}`
    );
}

/**
 * Assert that ColorData matches expected values
 */
export function assertColorData(actual: ColorData, expected: Partial<ColorData>, message?: string): void {
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
export function assertParsedColor(actual: ParsedColor | undefined, expected: Partial<ParsedColor>, message?: string): void {
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
export function assertLength<T>(array: T[], expectedLength: number, message?: string): void {
    assert.strictEqual(
        array.length,
        expectedLength,
        message || `Expected array length ${expectedLength}, got ${array.length}`
    );
}

/**
 * Assert that an array includes an element matching a predicate
 */
export function assertIncludes<T>(array: T[], predicate: (item: T) => boolean, message?: string): void {
    assert.ok(
        array.some(predicate),
        message || 'Array does not include expected element'
    );
}

/**
 * Assert that a string matches a regex pattern
 */
export function assertMatches(actual: string, pattern: RegExp, message?: string): void {
    assert.ok(
        pattern.test(actual),
        message || `String "${actual}" does not match pattern ${pattern}`
    );
}

/**
 * Assert that a value is within a range
 */
export function assertInRange(actual: number, min: number, max: number, message?: string): void {
    assert.ok(
        actual >= min && actual <= max,
        message || `Value ${actual} is not in range [${min}, ${max}]`
    );
}

/**
 * Assert that a value is defined (not null or undefined)
 */
export function assertDefined<T>(value: T | null | undefined, message?: string): asserts value is T {
    assert.ok(value !== null && value !== undefined, message || 'Value is null or undefined');
}

/**
 * Assert that a value is undefined
 */
export function assertUndefined(value: unknown, message?: string): void {
    assert.strictEqual(value, undefined, message || 'Value is not undefined');
}

/**
 * Helper to convert range to string for error messages
 */
function rangeToString(range: vscode.Range): string {
    return `[${range.start.line}:${range.start.character}-${range.end.line}:${range.end.character}]`;
}

/**
 * Assert that two arrays have the same elements (order-independent)
 */
export function assertArraysEqualUnordered<T>(actual: T[], expected: T[], message?: string): void {
    assert.strictEqual(actual.length, expected.length, message || 'Array lengths differ');
    
    const actualSorted = [...actual].sort();
    const expectedSorted = [...expected].sort();
    
    assert.deepStrictEqual(actualSorted, expectedSorted, message || 'Arrays have different elements');
}

/**
 * Assert that a map contains a specific key
 */
export function assertMapHasKey<K, V>(map: Map<K, V>, key: K, message?: string): void {
    assert.ok(map.has(key), message || `Map does not contain key: ${key}`);
}

/**
 * Assert that a map has a specific size
 */
export function assertMapSize<K, V>(map: Map<K, V>, expectedSize: number, message?: string): void {
    assert.strictEqual(
        map.size,
        expectedSize,
        message || `Expected map size ${expectedSize}, got ${map.size}`
    );
}
