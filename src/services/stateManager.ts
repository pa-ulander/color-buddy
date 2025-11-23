/**
 * State Manager Service
 * 
 * Consolidates extension state including decorations, provider subscriptions,
 * and runtime flags.
 */

import * as vscode from 'vscode';

/**
 * Manages extension state and lifecycle
 */
export class StateManager {
    private decorations: Map<string, vscode.TextEditorDecorationType>;
    private providerSubscriptions: vscode.Disposable[];
    private probingDocuments: Set<string>;
    private cachedLanguages: string[] | undefined;
    private visibleEditors: Set<string>;
    private pendingRefreshes: Map<string, number>;

    constructor() {
        this.decorations = new Map();
        this.providerSubscriptions = [];
        this.probingDocuments = new Set();
        this.cachedLanguages = undefined;
        this.visibleEditors = new Set();
        this.pendingRefreshes = new Map();
    }

    /**
     * Get or create a decoration type for an editor
     */
    getDecoration(editorKey: string): vscode.TextEditorDecorationType | undefined {
        return this.decorations.get(editorKey);
    }

    /**
     * Set decoration for an editor
     */
    setDecoration(editorKey: string, decoration: vscode.TextEditorDecorationType): void {
        // Dispose old decoration if exists
        const existing = this.decorations.get(editorKey);
        if (existing) {
            existing.dispose();
        }
        this.decorations.set(editorKey, decoration);
    }

    /**
     * Remove and dispose decoration for an editor
     */
    removeDecoration(editorKey: string): void {
        const decoration = this.decorations.get(editorKey);
        if (decoration) {
            decoration.dispose();
            this.decorations.delete(editorKey);
        }
    }

    /**
     * Clear all decorations
     */
    clearAllDecorations(): void {
        for (const decoration of this.decorations.values()) {
            decoration.dispose();
        }
        this.decorations.clear();
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
    }

    /**
     * Get the number of active decorations
     */
    get decorationCount(): number {
        return this.decorations.size;
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
     * Check if a refresh is pending for an editor (within last 100ms)
     */
    isRefreshPending(editorKey: string): boolean {
        const lastRefresh = this.pendingRefreshes.get(editorKey);
        if (!lastRefresh) {
            return false;
        }
        return (Date.now() - lastRefresh) < 100;
    }

    /**
     * Mark a refresh as pending for an editor
     */
    markRefreshPending(editorKey: string): void {
        this.pendingRefreshes.set(editorKey, Date.now());
    }

    /**
     * Clear old pending refreshes (older than 1 second)
     */
    clearOldPendingRefreshes(): void {
        const now = Date.now();
        for (const [key, timestamp] of this.pendingRefreshes.entries()) {
            if (now - timestamp > 1000) {
                this.pendingRefreshes.delete(key);
            }
        }
    }
}
