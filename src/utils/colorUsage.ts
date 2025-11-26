import type { ColorData } from '../types';

/**
 * Compute a stable identifier for usage counting based on the color data kind.
 */
export function getColorUsageIdentifier(data: ColorData): string {
	if (data.isCssVariable && data.variableName) {
		return `var:${data.variableName}`;
	}
	if (data.isTailwindClass && data.tailwindClass) {
		return `tailwind:${data.tailwindClass}`;
	}
	if (data.isCssClass && data.cssClassName) {
		return `class:${data.cssClassName}`;
	}
	return `color:${data.normalizedColor}`;
}

/**
 * Count how many entries share the same usage identifier as the target entry.
 */
export function getColorUsageCount(colorData: ColorData[], target: ColorData): number {
	const identifier = getColorUsageIdentifier(target);
	return colorData.filter(data => getColorUsageIdentifier(data) === identifier).length;
}
