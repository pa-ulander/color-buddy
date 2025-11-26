import type { ColorFormat } from './color';

export type CopyColorCommandSource = 'hover' | 'statusBar' | 'command';

export interface CopyColorCommandPayload {
	value?: string;
	format?: ColorFormat;
	source?: CopyColorCommandSource;
	showNotification?: boolean;
}
