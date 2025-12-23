import type { ColorData, ConvertColorCommandPayload, ConvertColorCommandSource } from '../types';

export function buildConvertColorCommandPayload(
	data: ColorData,
	source: ConvertColorCommandSource
): ConvertColorCommandPayload | undefined {
	if (!data.documentUri) {
		return undefined;
	}

	// Option 2: Allow references (CSS variables, Tailwind classes, CSS classes)
	// The handler will determine whether to show literal conversion or definition selection
	return {
		uri: data.documentUri.toString(),
		range: {
			start: { line: data.range.start.line, character: data.range.start.character },
			end: { line: data.range.end.line, character: data.range.end.character }
		},
		normalizedColor: data.normalizedColor,
		originalText: data.originalText,
		format: data.format,
		source
	};
}
