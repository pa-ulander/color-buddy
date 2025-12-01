import type { ColorData, TestAccessibilityCommandPayload } from '../types';

export function buildAccessibilityMetadata(
	data: ColorData,
	usageCount?: number
): TestAccessibilityCommandPayload['metadata'] | undefined {
	const metadata: TestAccessibilityCommandPayload['metadata'] = {};
	if (typeof usageCount === 'number') {
		metadata.usageCount = usageCount;
	}
	if (data.isCssVariable && data.variableName) {
		metadata.variableName = data.variableName;
	}
	if (data.isTailwindClass && data.tailwindClass) {
		metadata.tailwindClass = data.tailwindClass;
	}
	if (data.isCssClass && data.cssClassName) {
		metadata.cssClassName = data.cssClassName;
	}
	return Object.keys(metadata).length > 0 ? metadata : undefined;
}
