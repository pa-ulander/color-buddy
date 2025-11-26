import * as vscode from 'vscode';
import { LOG_PREFIX } from './constants';

/**
 * Performance logging utility for ColorBuddy extension.
 * Controlled by the `colorbuddy.enablePerformanceLogging` setting.
 */
export class PerformanceLogger {
	private enabled = false;
	private timers = new Map<string, number>();
	private metrics = new Map<string, { count: number; total: number; min: number; max: number }>();
	private eventLog: Array<{ timestamp: number; message: string; value?: unknown }> = [];
	private readonly MAX_LOG_ENTRIES = 1000;

	constructor() {
		this.updateEnabled();
	}

	/**
	 * Update enabled state from configuration
	 */
	updateEnabled(): void {
		const config = vscode.workspace.getConfiguration('colorbuddy');
		this.enabled = config.get<boolean>('enablePerformanceLogging', false);
	}

	/**
	 * Start a timer for an operation
	 */
	start(label: string): void {
		if (!this.enabled) {
			return;
		}
		this.timers.set(label, performance.now());
	}

	/**
	 * End a timer and log the duration
	 */
	end(label: string): void {
		if (!this.enabled) {
			return;
		}

		const startTime = this.timers.get(label);
		if (startTime === undefined) {
			return;
		}

		const duration = performance.now() - startTime;
		this.timers.delete(label);

		// Update metrics
		const existing = this.metrics.get(label);
		if (existing) {
			existing.count++;
			existing.total += duration;
			existing.min = Math.min(existing.min, duration);
			existing.max = Math.max(existing.max, duration);
		} else {
			this.metrics.set(label, { count: 1, total: duration, min: duration, max: duration });
		}

		console.log(`${LOG_PREFIX} [PERF] ${label}: ${duration.toFixed(2)}ms`);
	}

	/**
	 * Log a message with a value
	 */
	log(message: string, value?: unknown): void {
		if (!this.enabled) {
			return;
		}
		// Add to event log buffer
		this.eventLog.push({ timestamp: Date.now(), message, value });
		if (this.eventLog.length > this.MAX_LOG_ENTRIES) {
			this.eventLog.shift();
		}
		// Console output
		if (value !== undefined) {
			console.log(`${LOG_PREFIX} [PERF] ${message}:`, value);
		} else {
			console.log(`${LOG_PREFIX} [PERF] ${message}`);
		}
	}

	/**
	 * Log current metrics summary
	 */
	logSummary(): void {
		if (!this.enabled || this.metrics.size === 0) {
			return;
		}

		console.log(`${LOG_PREFIX} [PERF] ========== Performance Summary ==========`);
		for (const [label, stats] of this.metrics.entries()) {
			const avg = stats.total / stats.count;
			console.log(
				`${LOG_PREFIX} [PERF] ${label}: ` +
				`count=${stats.count}, avg=${avg.toFixed(2)}ms, ` +
				`min=${stats.min.toFixed(2)}ms, max=${stats.max.toFixed(2)}ms, ` +
				`total=${stats.total.toFixed(2)}ms`
			);
		}
		console.log(`${LOG_PREFIX} [PERF] ==========================================`);
	}

	/**
	 * Clear all metrics
	 */
	clearMetrics(): void {
		this.metrics.clear();
		this.timers.clear();
	}

	/**
	 * Reset timers, metrics, and event log entries.
	 */
	reset(): void {
		this.timers.clear();
		this.metrics.clear();
		this.eventLog = [];
	}

	/**
	 * Check if performance logging is enabled
	 */
	isEnabled(): boolean {
		return this.enabled;
	}

	/**
	 * Export all logs and metrics as formatted text
	 */
	exportLogs(): string {
		const lines: string[] = [];
		const startTime = this.eventLog.length > 0 ? this.eventLog[0].timestamp : Date.now();

		lines.push('ColorBuddy Performance Logs');
		lines.push('='.repeat(80));
		lines.push(`Generated: ${new Date().toISOString()}`);
		lines.push(`Total Events: ${this.eventLog.length}`);
		lines.push('');

		// Event log
		lines.push('Event Log:');
		lines.push('-'.repeat(80));
		for (const entry of this.eventLog) {
			const elapsed = ((entry.timestamp - startTime) / 1000).toFixed(3);
			const timestamp = new Date(entry.timestamp).toISOString().split('T')[1].slice(0, -1);
			if (entry.value !== undefined) {
				const valueStr = typeof entry.value === 'object' ? JSON.stringify(entry.value) : String(entry.value);
				lines.push(`[+${elapsed}s] [${timestamp}] ${entry.message}: ${valueStr}`);
			} else {
				lines.push(`[+${elapsed}s] [${timestamp}] ${entry.message}`);
			}
		}

		lines.push('');
		lines.push('Performance Metrics Summary:');
		lines.push('-'.repeat(80));
		if (this.metrics.size === 0) {
			lines.push('No metrics collected');
		} else {
			for (const [label, stats] of this.metrics.entries()) {
				const avg = stats.total / stats.count;
				lines.push(
					`${label}:`.padEnd(35) +
					`count=${stats.count}`.padEnd(12) +
					`avg=${avg.toFixed(2)}ms`.padEnd(15) +
					`min=${stats.min.toFixed(2)}ms`.padEnd(15) +
					`max=${stats.max.toFixed(2)}ms`.padEnd(15)
				);
			}
		}

		lines.push('');
		lines.push('='.repeat(80));
		return lines.join('\n');
	}
}

// Global singleton instance
export const perfLogger = new PerformanceLogger();
