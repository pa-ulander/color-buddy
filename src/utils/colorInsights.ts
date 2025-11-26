import * as vscode from 'vscode';
import { CSS_NAMED_COLORS } from './cssColorNames';

interface PreparedColor {
	readonly name: string;
	readonly hex: string;
	readonly rgb: [number, number, number];
}

const PREPARED_COLORS: PreparedColor[] = CSS_NAMED_COLORS.map(entry => ({
	name: entry.name,
	hex: entry.hex.toUpperCase(),
	rgb: hexToRgb(entry.hex)
}));

export interface ColorInsights {
	readonly name: string;
	readonly hex: string;
	readonly brightness: number;
}

export function getColorInsights(color: vscode.Color): ColorInsights {
	const rgb = toRgb(color);
	let closest = PREPARED_COLORS[0];
	let bestDistance = Number.POSITIVE_INFINITY;

	for (const entry of PREPARED_COLORS) {
		const distance = distanceSquared(rgb, entry.rgb);
		if (distance < bestDistance) {
			bestDistance = distance;
			closest = entry;
		}
	}

	const brightness = Math.round(getRelativeLuminance(color) * 100);

	return {
		name: formatColorName(closest.name),
		hex: closest.hex,
		brightness
	};
}

function hexToRgb(hex: string): [number, number, number] {
	const normalized = hex.replace(/^#/, '');
	const r = parseInt(normalized.slice(0, 2), 16);
	const g = parseInt(normalized.slice(2, 4), 16);
	const b = parseInt(normalized.slice(4, 6), 16);
	return [r, g, b];
}

function toRgb(color: vscode.Color): [number, number, number] {
	const r = Math.round(color.red * 255);
	const g = Math.round(color.green * 255);
	const b = Math.round(color.blue * 255);
	return [r, g, b];
}

function distanceSquared(a: [number, number, number], b: [number, number, number]): number {
	const dr = a[0] - b[0];
	const dg = a[1] - b[1];
	const db = a[2] - b[2];
	return dr * dr + dg * dg + db * db;
}

function getRelativeLuminance(color: vscode.Color): number {
	const rsRGB = color.red;
	const gsRGB = color.green;
	const bsRGB = color.blue;

	const r = rsRGB <= 0.03928 ? rsRGB / 12.92 : Math.pow((rsRGB + 0.055) / 1.055, 2.4);
	const g = gsRGB <= 0.03928 ? gsRGB / 12.92 : Math.pow((gsRGB + 0.055) / 1.055, 2.4);
	const b = bsRGB <= 0.03928 ? bsRGB / 12.92 : Math.pow((bsRGB + 0.055) / 1.055, 2.4);

	return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function formatColorName(name: string): string {
	const segments = name.split(/[-_]/).filter(Boolean);
	const words = (segments.length > 0 ? segments : [name]).map(segment =>
		segment.charAt(0).toUpperCase() + segment.slice(1)
	);
	return words.join(' ');
}
