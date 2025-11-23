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
	}

	/**
	 * Check if performance logging is enabled
	 */
	isEnabled(): boolean {
		return this.enabled;
	}
}

// Global singleton instance
export const perfLogger = new PerformanceLogger();
