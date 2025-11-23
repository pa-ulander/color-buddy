"use strict";
/**
 * Document Cache Service
 *
 * Manages caching of color data per document version and deduplicates
 * concurrent computations for the same document.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.Cache = void 0;
/**
 * Cache for document color data with version tracking
 */
class Cache {
    cache;
    pending;
    constructor() {
        this.cache = new Map();
        this.pending = new Map();
    }
    /**
     * Get cached color data for a document if version matches
     */
    get(uri, version) {
        const cached = this.cache.get(uri);
        if (cached && cached.version === version) {
            return cached.data;
        }
        return undefined;
    }
    /**
     * Set color data cache for a document
     */
    set(uri, version, data) {
        this.cache.set(uri, {
            version,
            data
        });
    }
    /**
     * Delete cached data for a document
     */
    delete(uri) {
        this.cache.delete(uri);
        this.pending.delete(uri);
    }
    /**
     * Clear all cached data
     */
    clear() {
        this.cache.clear();
        this.pending.clear();
    }
    /**
     * Get pending computation or create new one
     * Deduplicates concurrent requests for the same document
     */
    getPendingOrCompute(key, computation) {
        const existing = this.pending.get(key);
        if (existing) {
            return existing;
        }
        const promise = computation().finally(() => {
            this.pending.delete(key);
        });
        this.pending.set(key, promise);
        return promise;
    }
    /**
     * Check if there's a pending computation for a key
     */
    hasPending(key) {
        return this.pending.has(key);
    }
    /**
     * Get the number of cached documents
     */
    get size() {
        return this.cache.size;
    }
    /**
     * Get the number of pending computations
     */
    get pendingCount() {
        return this.pending.size;
    }
}
exports.Cache = Cache;
//# sourceMappingURL=cache.js.map