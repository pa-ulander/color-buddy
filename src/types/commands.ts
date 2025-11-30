import type { ColorFormat } from './color';

export type CopyColorCommandSource = 'hover' | 'statusBar' | 'command';
export type ConvertColorCommandSource = CopyColorCommandSource;

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
