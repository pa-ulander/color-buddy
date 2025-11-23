# ColorBuddy Test Structure

This directory contains all tests for the ColorBuddy extension.

## Directory Organization

```
src/test/
├── helpers/              # Test utilities and helpers
│   ├── index.ts         # Re-exports all helpers
│   ├── mocks.ts         # Mock factories for creating test data
│   └── assertions.ts    # Custom assertion helpers
├── parsers/             # Tests for color parsing logic (future)
├── providers/           # Tests for VS Code providers (future)
├── collectors/          # Tests for color collection logic (future)
├── utils/              # Tests for utility functions (future)
└── extension.test.ts   # Integration tests
```

## Test Helpers

### Mocks (`helpers/mocks.ts`)

Factory functions for creating test data:

- `createMockDocument(content, languageId, uri?)` - Create mock TextDocument
- `createMockColorData(overrides?)` - Create ColorData objects
- `createMockCSSVariableDeclaration(name, value, overrides?)` - Create CSS variable declarations
- `createMockCSSClassDeclaration(className, property, value, overrides?)` - Create CSS class declarations
- `createMockParsedColor(overrides?)` - Create ParsedColor objects
- `createColor(r, g, b, a?)` - Create vscode.Color from RGB values (0-255)
- `createMockCSSContent(variables?, classes?)` - Generate CSS file content
- `waitFor(condition, timeout?, interval?)` - Wait for async conditions
- `range(startLine, startChar, endLine, endChar)` - Create vscode.Range
- `position(line, character)` - Create vscode.Position

### Assertions (`helpers/assertions.ts`)

Custom assertion functions for better test clarity:

- `assertColorsEqual(actual, expected, message?)` - Compare two vscode.Color objects
- `assertColorRGB(color, r, g, b, a?, message?)` - Assert color matches RGB values
- `assertRangeEqual(actual, expected, message?)` - Compare two vscode.Range objects
- `assertColorData(actual, expected, message?)` - Compare ColorData objects
- `assertParsedColor(actual, expected, message?)` - Compare ParsedColor objects
- `assertLength(array, expectedLength, message?)` - Assert array length
- `assertIncludes(array, predicate, message?)` - Assert array includes element matching predicate
- `assertMatches(actual, pattern, message?)` - Assert string matches regex
- `assertInRange(actual, min, max, message?)` - Assert number is within range
- `assertDefined(value, message?)` - Assert value is not null/undefined
- `assertUndefined(value, message?)` - Assert value is undefined
- `assertArraysEqualUnordered(actual, expected, message?)` - Compare arrays ignoring order
- `assertMapHasKey(map, key, message?)` - Assert map contains key
- `assertMapSize(map, expectedSize, message?)` - Assert map size

## Usage Examples

### Using Mock Factories

```typescript
import { createMockDocument, createMockColorData, createColor } from './helpers';

// Create a mock document
const doc = createMockDocument(':root { --primary: #ff0000; }', 'css');

// Create mock color data
const colorData = createMockColorData({
  originalText: '#ff0000',
  vscodeColor: createColor(255, 0, 0)
});
```

### Using Custom Assertions

```typescript
import { assertColorsEqual, assertColorRGB, assertLength } from './helpers';

// Assert colors are equal (with tolerance for floating point)
assertColorsEqual(actualColor, expectedColor);

// Assert color matches RGB values
assertColorRGB(color, 255, 0, 0, 1);

// Assert array length
assertLength(colors, 3);
```

## Writing New Tests

### Unit Tests

Create test files in the appropriate subdirectory:

- `parsers/` - For `parseColor`, `parseColorToVSCode`, etc.
- `providers/` - For hover providers, color providers, etc.
- `collectors/` - For `collectColorData`, `collectCSSVariable`, etc.
- `utils/` - For utility functions like `formatColorByFormat`, `getContrastRatio`, etc.

### Integration Tests

Add to `extension.test.ts` for tests that require multiple components working together.

### Test Structure Template

```typescript
import * as assert from 'assert';
import { createMockDocument, assertColorsEqual } from '../helpers';

suite('Feature Name', () => {
  test('should do something specific', () => {
    // Arrange
    const input = createMockDocument('test content', 'css');
    
    // Act
    const result = functionUnderTest(input);
    
    // Assert
    assert.strictEqual(result.length, 1);
    assertColorsEqual(result[0].color, expectedColor);
  });
});
```

## Best Practices

1. **Use helpers** - Prefer `createMockDocument()` over manual mock creation
2. **Use custom assertions** - Prefer `assertColorsEqual()` over manual tolerance checks
3. **Clear names** - Test names should describe what they verify
4. **One assertion per test** - Keep tests focused and easy to debug
5. **Arrange-Act-Assert** - Follow the AAA pattern for test structure
6. **Clean up** - Clear caches and restore stubs in `finally` blocks
7. **Isolate tests** - Each test should be independent and not rely on test order

## Running Tests

```bash
# Run all tests
npm test

# Watch mode (compile and run tests on changes)
npm run watch-tests

# Compile tests only
npm run compile-tests
```

## Future Improvements

- [ ] Add snapshot testing for tooltip content
- [ ] Add performance benchmarks
- [ ] Add coverage reporting
- [ ] Create fixture files for complex test scenarios
- [ ] Add visual regression tests for decorations
