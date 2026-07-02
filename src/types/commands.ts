import type { ColorFormat } from './color';

export type CopyColorCommandSource = 'hover' | 'statusBar' | 'command';
export type ConvertColorCommandSource = CopyColorCommandSource | 'panel';

export interface SerializedPosition {
	line: number;
	character: number;
}

export interface SerializedRange {
	start: SerializedPosition;
	end: SerializedPosition;
}

export interface CopyColorCommandPayload {
	value?: string;
	format?: ColorFormat;
	source?: CopyColorCommandSource;
	showNotification?: boolean;
}

export interface ConvertColorCommandPayload {
	uri: string;
	range: SerializedRange;
	normalizedColor: string;
	originalText?: string;
	format?: ColorFormat;
	source?: ConvertColorCommandSource;
}

export interface TestAccessibilityCommandMetadata {
	usageCount?: number;
	variableName?: string;
	tailwindClass?: string;
	cssClassName?: string;
}

export interface TestAccessibilityCommandPayload {
	value: string;
	format?: ColorFormat;
	source?: CopyColorCommandSource;
	label?: string;
	metadata?: TestAccessibilityCommandMetadata;
	panel?: 'summary' | 'contrast' | 'contexts' | 'formats';
}

export interface FindUsagesCommandPayload {
	value: string;
	format?: ColorFormat;
	source?: CopyColorCommandSource;
	label?: string;
	metadata?: TestAccessibilityCommandMetadata;
}
