/**
 * State Manager Service
 * 
 * Consolidates extension state including decorations, provider subscriptions,
 * and runtime flags.
 */

import * as vscode from 'vscode';

const DEFAULT_REFRESH_DELAY_MS = 32;
const HEAVY_REFRESH_THRESHOLD_MS = 250;
const HEAVY_REFRESH_DELAY_MS = 120;
const REFRESH_AVERAGE_ALPHA = 0.3;

type RefreshTimer = ReturnType<typeof setTimeout>;

interface RefreshCompletion {
    promise: Promise<void>;
    resolve: () => void;
    reject: (error: unknown) => void;
}

interface RefreshEntry {
    timer: RefreshTimer;
    run: () => Promise<void>;
    version: number;
    completion: RefreshCompletion;
}

interface QueuedRefresh {
    run: () => Promise<void>;
    version: number;
    completion: RefreshCompletion;
}

/**
 * Manages extension state and lifecycle
 */
export class StateManager {
    private decorations: Map<string, vscode.TextEditorDecorationType[]>;
    private providerSubscriptions: vscode.Disposable[];
    private probingDocuments: Set<string>;
    private cachedLanguages: string[] | undefined;
    private visibleEditors: Set<string>;
    private refreshEntries: Map<string, RefreshEntry>;
    private executingRefreshes: Set<string>;
    private queuedAfterRun: Map<string, QueuedRefresh>;
    private refreshAverages: Map<string, number>;
    private decorationSnapshots: Map<string, Map<number, string>>;

    constructor() {
        this.decorations = new Map();
        this.providerSubscriptions = [];
        this.probingDocuments = new Set();
        this.cachedLanguages = undefined;
        this.visibleEditors = new Set();
        this.refreshEntries = new Map();
        this.executingRefreshes = new Set();
        this.queuedAfterRun = new Map();
        this.refreshAverages = new Map();
        this.decorationSnapshots = new Map();
    }

    /**
     * Get or create a decoration type for an editor
     */
    getDecoration(editorKey: string): vscode.TextEditorDecorationType[] | undefined {
        return this.decorations.get(editorKey);
    }

    /**
     * Set decoration for an editor
     */
    setDecoration(editorKey: string, decorations: vscode.TextEditorDecorationType[]): void {
        const existing = this.decorations.get(editorKey);
        if (existing) {
            for (const decoration of existing) {
                decoration.dispose();
            }
        }
        this.decorations.set(editorKey, decorations);
    }

    /**
     * Ensure a reusable decoration pool exists for an editor.
     * Expands the pool using the provided factory when additional entries are required.
     */
    ensureDecorationPool(
        editorKey: string,
        desiredSize: number,
        factory: () => vscode.TextEditorDecorationType
    ): vscode.TextEditorDecorationType[] {
        let pool = this.decorations.get(editorKey);
        if (!pool) {
            pool = [];
            this.decorations.set(editorKey, pool);
        }

        while (pool.length < desiredSize) {
            pool.push(factory());
        }

        return pool;
    }

    setDecorationChunkSignature(editorKey: string, chunkIndex: number, signature: string): void {
        let snapshots = this.decorationSnapshots.get(editorKey);
        if (!snapshots) {
            snapshots = new Map();
            this.decorationSnapshots.set(editorKey, snapshots);
        }
        snapshots.set(chunkIndex, signature);
    }

    getDecorationChunkSignature(editorKey: string, chunkIndex: number): string | undefined {
        return this.decorationSnapshots.get(editorKey)?.get(chunkIndex);
    }

    pruneDecorationSnapshots(editorKey: string, keepCount: number): void {
        const snapshots = this.decorationSnapshots.get(editorKey);
        if (!snapshots) {
            return;
        }

        for (const [index] of snapshots) {
            if (index >= keepCount) {
                snapshots.delete(index);
            }
        }
    }

    clearDecorationSnapshots(editorKey: string): void {
        this.decorationSnapshots.delete(editorKey);
    }

    /**
     * Remove and dispose decoration for an editor
     */
    removeDecoration(editorKey: string): void {
        const decorations = this.decorations.get(editorKey);
        if (decorations) {
            for (const decoration of decorations) {
                decoration.dispose();
            }
            this.decorations.delete(editorKey);
        }
        this.decorationSnapshots.delete(editorKey);
    }

    /**
     * Clear all decorations
     */
    clearAllDecorations(): void {
        for (const decorations of this.decorations.values()) {
            for (const decoration of decorations) {
                decoration.dispose();
            }
        }
        this.decorations.clear();
        this.decorationSnapshots.clear();
    }

    /**
     * Add a provider subscription
     */
    addProviderSubscription(subscription: vscode.Disposable): void {
        this.providerSubscriptions.push(subscription);
    }

    /**
     * Clear all provider subscriptions
     */
    clearProviderSubscriptions(): void {
        for (const subscription of this.providerSubscriptions) {
            subscription.dispose();
        }
        this.providerSubscriptions = [];
    }

    /**
     * Get all provider subscriptions
     */
    getProviderSubscriptions(): vscode.Disposable[] {
        return this.providerSubscriptions;
    }

    /**
     * Get native color probing flag
     */
    get isProbingNativeColors(): boolean {
        return this.probingDocuments.size > 0;
    }

    /**
     * Track a document that is being probed for native colors.
     */
    startNativeColorProbe(uri: vscode.Uri): void {
        this.probingDocuments.add(uri.toString());
    }

    /**
     * Stop tracking a document probe.
     */
    finishNativeColorProbe(uri: vscode.Uri): void {
        this.probingDocuments.delete(uri.toString());
    }

    /**
     * Determine if a document is currently being probed.
     */
    isDocumentProbing(uri: vscode.Uri): boolean {
        return this.probingDocuments.has(uri.toString());
    }

    /**
     * Cache the configured language list.
     */
    setCachedLanguages(languages: string[] | undefined): void {
        this.cachedLanguages = languages;
    }

    getCachedLanguages(): string[] | undefined {
        return this.cachedLanguages;
    }

    clearLanguageCache(): void {
        this.cachedLanguages = undefined;
    }

    /**
     * Dispose all state
     */
    dispose(): void {
        this.clearAllDecorations();
        this.clearProviderSubscriptions();
        this.probingDocuments.clear();
        this.cachedLanguages = undefined;
        for (const entry of this.refreshEntries.values()) {
            clearTimeout(entry.timer);
        }
        this.refreshEntries.clear();
        this.executingRefreshes.clear();
        this.queuedAfterRun.clear();
        this.refreshAverages.clear();
        this.decorationSnapshots.clear();
    }

    /**
     * Get the number of active decorations
     */
    get decorationCount(): number {
        let count = 0;
        for (const decorations of this.decorations.values()) {
            count += decorations.length;
        }
        return count;
    }

    /**
     * Get the number of provider subscriptions
     */
    get subscriptionCount(): number {
        return this.providerSubscriptions.length;
    }

    /**
     * Mark an editor as visible
     */
    markEditorVisible(editorKey: string): void {
        this.visibleEditors.add(editorKey);
    }

    /**
     * Mark an editor as hidden
     */
    markEditorHidden(editorKey: string): void {
        this.visibleEditors.delete(editorKey);
    }

    /**
     * Check if an editor is currently visible
     */
    isEditorVisible(editorKey: string): boolean {
        return this.visibleEditors.has(editorKey);
    }

    /**
     * Get all visible editor keys
     */
    getVisibleEditors(): string[] {
        return Array.from(this.visibleEditors);
    }

    /**
     * Schedule a refresh for the provided editor, coalescing rapid-fire requests.
     */
    scheduleRefresh(
        editorKey: string,
        version: number,
        run: () => Promise<void>,
        options?: { immediate?: boolean }
    ): Promise<void> {
        const completion = this.createCompletion();

        if (this.executingRefreshes.has(editorKey)) {
            const queued = this.queuedAfterRun.get(editorKey);
            if (!queued || version >= queued.version) {
                this.queuedAfterRun.set(editorKey, { run, version, completion });
                if (queued) {
                    queued.completion.resolve();
                }
                return completion.promise;
            }
            return queued.completion.promise;
        }

        const delay = options?.immediate ? 0 : this.calculateDelay(editorKey);
        const existing = this.refreshEntries.get(editorKey);

        if (existing) {
            if (version < existing.version) {
                return existing.completion.promise;
            }
            clearTimeout(existing.timer);
            existing.completion.resolve();
            const timer = setTimeout(() => this.executeScheduledRefresh(editorKey), delay);
            this.refreshEntries.set(editorKey, { timer, run, version, completion });
            return completion.promise;
        }

        const timer = setTimeout(() => this.executeScheduledRefresh(editorKey), delay);
        this.refreshEntries.set(editorKey, { timer, run, version, completion });
        return completion.promise;
    }

    /**
     * Cancel any scheduled refresh for the provided editor.
     */
    cancelScheduledRefresh(editorKey: string): void {
        const entry = this.refreshEntries.get(editorKey);
        if (entry) {
            clearTimeout(entry.timer);
            this.refreshEntries.delete(editorKey);
            entry.completion.resolve();
        }
        const queued = this.queuedAfterRun.get(editorKey);
        if (queued) {
            queued.completion.resolve();
        }
        this.queuedAfterRun.delete(editorKey);
    }

    /**
     * Record a refresh duration and track a rolling exponential moving average.
     */
    recordRefreshDuration(editorKey: string, durationMs: number): void {
        const current = this.refreshAverages.get(editorKey);
        if (current === undefined) {
            this.refreshAverages.set(editorKey, durationMs);
            return;
        }

        const next = (current * (1 - REFRESH_AVERAGE_ALPHA)) + (durationMs * REFRESH_AVERAGE_ALPHA);
        this.refreshAverages.set(editorKey, next);
    }

    /**
     * Retrieve the current rolling average duration for an editor, if available.
     */
    getAverageRefreshDuration(editorKey: string): number | undefined {
        return this.refreshAverages.get(editorKey);
    }

    private createCompletion(): RefreshCompletion {
        let resolve: () => void;
        let reject: (error: unknown) => void;
        const promise = new Promise<void>((res, rej) => {
            resolve = res;
            reject = rej;
        });
        return {
            promise,
            resolve: resolve!,
            reject: reject!
        };
    }

    private calculateDelay(editorKey: string): number {
        const avg = this.refreshAverages.get(editorKey);
        if (avg !== undefined && avg > HEAVY_REFRESH_THRESHOLD_MS) {
            return HEAVY_REFRESH_DELAY_MS;
        }
        return DEFAULT_REFRESH_DELAY_MS;
    }

    private async executeScheduledRefresh(editorKey: string): Promise<void> {
        const entry = this.refreshEntries.get(editorKey);
        if (!entry) {
            return;
        }

        this.refreshEntries.delete(editorKey);
        this.executingRefreshes.add(editorKey);

        try {
            await entry.run();
            entry.completion.resolve();
        } finally {
            this.executingRefreshes.delete(editorKey);
            const queued = this.queuedAfterRun.get(editorKey);
            if (queued) {
                this.queuedAfterRun.delete(editorKey);
                this.scheduleRefresh(editorKey, queued.version, queued.run);
            }
        }
    }
}
