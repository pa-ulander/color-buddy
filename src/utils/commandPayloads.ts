import type { ColorData, ConvertColorCommandPayload, ConvertColorCommandSource } from '../types';

export function buildConvertColorCommandPayload(
	data: ColorData,
	source: ConvertColorCommandSource
): ConvertColorCommandPayload | undefined {
	if (!data.documentUri) {
		return undefined;
	}

	// Don't allow conversion of CSS variables, Tailwind classes, or CSS classes
	// These are references, not literal colors, so they can't be directly converted
	if (data.isCssVariable || data.isTailwindClass || data.isCssClass) {
		return undefined;
	}

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
