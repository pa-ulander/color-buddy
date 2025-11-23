"use strict";
/**
 * State Manager Service
 *
 * Consolidates extension state including decorations, provider subscriptions,
 * and runtime flags.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.StateManager = void 0;
/**
 * Manages extension state and lifecycle
 */
class StateManager {
    decorations;
    providerSubscriptions;
    _isProbingNativeColors;
    constructor() {
        this.decorations = new Map();
        this.providerSubscriptions = [];
        this._isProbingNativeColors = false;
    }
    /**
     * Get or create a decoration type for an editor
     */
    getDecoration(editorKey) {
        return this.decorations.get(editorKey);
    }
    /**
     * Set decoration for an editor
     */
    setDecoration(editorKey, decoration) {
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
    removeDecoration(editorKey) {
        const decoration = this.decorations.get(editorKey);
        if (decoration) {
            decoration.dispose();
            this.decorations.delete(editorKey);
        }
    }
    /**
     * Clear all decorations
     */
    clearAllDecorations() {
        for (const decoration of this.decorations.values()) {
            decoration.dispose();
        }
        this.decorations.clear();
    }
    /**
     * Add a provider subscription
     */
    addProviderSubscription(subscription) {
        this.providerSubscriptions.push(subscription);
    }
    /**
     * Clear all provider subscriptions
     */
    clearProviderSubscriptions() {
        for (const subscription of this.providerSubscriptions) {
            subscription.dispose();
        }
        this.providerSubscriptions = [];
    }
    /**
     * Get all provider subscriptions
     */
    getProviderSubscriptions() {
        return this.providerSubscriptions;
    }
    /**
     * Get native color probing flag
     */
    get isProbingNativeColors() {
        return this._isProbingNativeColors;
    }
    /**
     * Set native color probing flag
     */
    set isProbingNativeColors(value) {
        this._isProbingNativeColors = value;
    }
    /**
     * Dispose all state
     */
    dispose() {
        this.clearAllDecorations();
        this.clearProviderSubscriptions();
    }
    /**
     * Get the number of active decorations
     */
    get decorationCount() {
        return this.decorations.size;
    }
    /**
     * Get the number of provider subscriptions
     */
    get subscriptionCount() {
        return this.providerSubscriptions.length;
    }
}
exports.StateManager = StateManager;
//# sourceMappingURL=stateManager.js.map