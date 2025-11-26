import * as vscode from 'vscode';
import { CONFIG_NAMESPACE, ConfigKeys } from '../types/config';
import { LOG_PREFIX } from '../utils/constants';
import { initializeEnvironment, getTelemetrySecrets, TelemetrySecrets } from '../utils/env';
import { ApiTelemetryReporter, TelemetryReporterAuth } from './apiTelemetryReporter';
import type { QuickActionSurface } from '../utils/quickActions';
import type { AccessibilityReport } from '../types';

export interface QuickActionTelemetryEvent {
	target: string;
	source: QuickActionSurface;
}

export type ColorInsightSurface = 'statusBar' | 'hover';

export type ColorInsightColorKind = 'literal' | 'cssVariable' | 'cssClass' | 'tailwindClass';

export interface ColorContrastTelemetry {
	background: string;
	ratio: number;
	level: string;
}

export interface ColorInsightTelemetryEvent {
	surface: ColorInsightSurface;
	colorKind: ColorInsightColorKind;
	usageCount: number;
	contrast: ColorContrastTelemetry[];
	timestamp?: string;
}

interface TelemetryOptions {
	onQuickActionRecorded?: (event: QuickActionTelemetryEvent) => void;
	onColorInsightRecorded?: (event: ColorInsightTelemetryEvent) => void;
}

/**
 * Minimal telemetry service that records opt-in events for quick actions.
 * Currently forwards events to an injected callback (tests) or logs to the console.
 */
export class Telemetry implements vscode.Disposable {
	private enabled: boolean;
	private readonly disposables: vscode.Disposable[] = [];
	private readonly onQuickActionRecorded?: (event: QuickActionTelemetryEvent) => void;
	private readonly onColorInsightRecorded?: (event: ColorInsightTelemetryEvent) => void;
 	private endpoint?: string;
 	private batchSize = 20;
	private readonly queue: ColorInsightTelemetryEvent[] = [];
	private flushTimer: NodeJS.Timeout | null = null;
	private apiKey?: string;
	private apiKeyHeader = 'x-api-key';
	private basicAuth?: { username: string; password: string };
	private missingEndpointWarned = false;
	private reporter?: ApiTelemetryReporter;


	constructor(options?: TelemetryOptions) {
		this.onQuickActionRecorded = options?.onQuickActionRecorded;
		this.onColorInsightRecorded = options?.onColorInsightRecorded;
		this.enabled = this.readEnabled();
		this.refreshConfig();

		this.disposables.push(
			vscode.workspace.onDidChangeConfiguration(event => {
				if (event.affectsConfiguration(CONFIG_NAMESPACE)) {
					this.enabled = this.readEnabled();
					this.refreshConfig();
				}
			})
		);
	}

	private readEnabled(): boolean {
		const config = vscode.workspace.getConfiguration(CONFIG_NAMESPACE);
		return config.get<boolean>(ConfigKeys.TELEMETRY_ENABLED, false) ?? false;
	}

private refreshConfig(): void {
	const config = vscode.workspace.getConfiguration(CONFIG_NAMESPACE);
	this.batchSize = config.get<number>(ConfigKeys.TELEMETRY_BATCH_SIZE) ?? 20;

	initializeEnvironment();
	this.applySecrets(getTelemetrySecrets());

	if (!this.enabled) {
		if (this.flushTimer) {
			clearTimeout(this.flushTimer);
			this.flushTimer = null;
		}
		this.queue.length = 0;
	}
}

private applySecrets(secrets: TelemetrySecrets): void {
	this.endpoint = secrets.endpoint;
	this.apiKey = secrets.apiKey;
	this.apiKeyHeader = secrets.apiKeyHeader ?? 'x-api-key';
	if (secrets.username && secrets.password) {
		this.basicAuth = { username: secrets.username, password: secrets.password };
	} else {
		this.basicAuth = undefined;
	}

	if (this.endpoint) {
		const auth: TelemetryReporterAuth = {
			apiKey: this.apiKey,
			apiKeyHeader: this.apiKeyHeader,
			basicAuth: this.basicAuth,
			timeoutMs: 5000
		};
		this.reporter = new ApiTelemetryReporter(this.endpoint, auth);
	} else {
		this.reporter = undefined;
	}

	if (!this.endpoint && this.enabled && !this.missingEndpointWarned) {
		console.warn(`${LOG_PREFIX} telemetry enabled but COLORBUDDY_TELEMETRY_ENDPOINT is not set. Events remain queued until configured.`);
		this.missingEndpointWarned = true;
	}

	if (this.endpoint) {
		this.missingEndpointWarned = false;
	}
}

	public trackQuickAction(event: QuickActionTelemetryEvent): void {
		if (!this.enabled) {
			return;
		}

		if (this.onQuickActionRecorded) {
			this.onQuickActionRecorded(event);
			return;
		}

		console.log(`${LOG_PREFIX} telemetry quick action`, event);
	}

	public trackColorInsight(event: ColorInsightTelemetryEvent): void {
		if (!this.enabled) {
			return;
		}

		if (this.onColorInsightRecorded) {
			this.onColorInsightRecorded(event);
			return;
		}

		const enriched: ColorInsightTelemetryEvent = {
			...event,
			timestamp: event.timestamp ?? new Date().toISOString()
		};
		this.queue.push(enriched);
		if (this.queue.length >= this.batchSize) {
			if (this.flushTimer) {
				clearTimeout(this.flushTimer);
				this.flushTimer = null;
			}
			void this.flushQueue();
			return;
		}

		if (!this.flushTimer) {
			this.flushTimer = setTimeout(() => {
				this.flushTimer = null;
				void this.flushQueue();
			}, 5000);
		}
	}

	private async flushQueue(): Promise<void> {
		if (this.queue.length === 0 || !this.enabled) {
			return;
		}

		if (!this.reporter) {
			if (!this.missingEndpointWarned) {
				console.warn(`${LOG_PREFIX} telemetry queue ready but no endpoint configured.`);
				this.missingEndpointWarned = true;
			}
			return;
		}

		const batch = this.queue.splice(0, this.batchSize);
		const payload = {
			batch,
			timestamp: new Date().toISOString()
		};

		try {
			const response = await this.reporter.sendBatch(payload);
			if (!response.success) {
				this.queue.unshift(...batch);
				const retryDelay = response.retryAfterMs ?? 10000;
				console.warn(`${LOG_PREFIX} telemetry flush received ${response.statusCode}; retrying in ${retryDelay}ms`);
				if (!this.flushTimer) {
					this.flushTimer = setTimeout(() => {
						this.flushTimer = null;
						void this.flushQueue();
					}, retryDelay);
				}
				return;
			}
			console.debug(`${LOG_PREFIX} telemetry flushed ${batch.length} events (status ${response.statusCode}${response.requestId ? `, requestId ${response.requestId}` : ''})`);
		} catch (error) {
			console.error(`${LOG_PREFIX} telemetry flush failed`, error);
			this.queue.unshift(...batch);
			if (!this.flushTimer) {
				this.flushTimer = setTimeout(() => {
					this.flushTimer = null;
					void this.flushQueue();
				}, 10000);
			}
		}
	}

	dispose(): void {
		if (this.flushTimer) {
			clearTimeout(this.flushTimer);
			this.flushTimer = null;
		}
		if (this.queue.length > 0) {
			void this.flushQueue();
		}
		if (this.disposables.length > 0) {
			vscode.Disposable.from(...this.disposables).dispose();
		}
	}
}

export function buildContrastTelemetry(report: AccessibilityReport): ColorContrastTelemetry[] {
	return report.samples.map(sample => ({
		background: sample.backgroundDescription,
		ratio: sample.contrastRatio,
		level: sample.level
	}));
}
