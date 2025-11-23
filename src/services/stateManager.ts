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
    private _isProbingNativeColors: boolean;

    constructor() {
        this.decorations = new Map();
        this.providerSubscriptions = [];
        this._isProbingNativeColors = false;
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
        return this._isProbingNativeColors;
    }

    /**
     * Set native color probing flag
     */
    set isProbingNativeColors(value: boolean) {
        this._isProbingNativeColors = value;
    }

    /**
     * Dispose all state
     */
    dispose(): void {
        this.clearAllDecorations();
        this.clearProviderSubscriptions();
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
}
