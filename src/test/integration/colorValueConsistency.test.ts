import * as assert from 'assert';
import { ColorParser } from '../../services/colorParser';

suite('Color Value Consistency Tests', () => {
	let colorParser: ColorParser;

	setup(() => {
		colorParser = new ColorParser();
	});

	test('cssString preserves hex format', () => {
		const parsed = colorParser.parseColor('#3b82f6');
		assert.ok(parsed, 'Should parse hex color');
		
		// BUG: cssString is normalized to rgb() instead of preserving #hex
		console.log('Parsed #3b82f6 →', parsed.cssString);
		assert.strictEqual(parsed.cssString.toLowerCase(), '#3b82f6', 
			`cssString should preserve hex format, got: ${parsed.cssString}`);
	});

	test('cssString preserves HSL format', () => {
		const parsed = colorParser.parseColor('hsl(217, 82%, 38%)');
		assert.ok(parsed, 'Should parse HSL color');
		
		// BUG: cssString is normalized to rgb() instead of preserving hsl()
		console.log('Parsed hsl(217, 82%, 38%) →', parsed.cssString);
		const normalized = parsed.cssString.toLowerCase().replace(/\s/g, '');
		assert.ok(normalized.startsWith('hsl('), 
			`cssString should preserve HSL format, got: ${parsed.cssString}`);
	});

	test('cssString preserves RGB format', () => {
		const parsed = colorParser.parseColor('rgb(59, 130, 246)');
		assert.ok(parsed, 'Should parse RGB color');
		
		console.log('Parsed rgb(59, 130, 246) →', parsed.cssString);
		const normalized = parsed.cssString.toLowerCase().replace(/\s/g, '');
		assert.ok(normalized.startsWith('rgb('), 
			`cssString should preserve RGB format, got: ${parsed.cssString}`);
	});
});
