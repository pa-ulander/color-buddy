/**
 * Document Cache Service
 * 
 * Manages caching of color data per document version and deduplicates
 * concurrent computations for the same document.
 */

import type { ColorData, DocumentColorCache } from '../types';

/**
 * Cache for document color data with version tracking
 */
export class Cache {
    private cache: Map<string, DocumentColorCache>;
    private pending: Map<string, Promise<ColorData[]>>;

    constructor() {
        this.cache = new Map();
        this.pending = new Map();
    }

    /**
     * Get cached color data for a document if version matches
     */
    get(uri: string, version: number): ColorData[] | undefined {
        const cached = this.cache.get(uri);
        if (cached && cached.version === version) {
            return cached.data;
        }
        return undefined;
    }

    /**
     * Set color data cache for a document
     */
    set(uri: string, version: number, data: ColorData[]): void {
        this.cache.set(uri, {
            version,
            data
        });
    }

    /**
     * Delete cached data for a document
     */
    delete(uri: string): void {
        this.cache.delete(uri);
        this.pending.delete(uri);
    }

    /**
     * Clear all cached data
     */
    clear(): void {
        this.cache.clear();
        this.pending.clear();
    }

    /**
     * Get pending computation or create new one
     * Deduplicates concurrent requests for the same document
     */
    getPendingOrCompute(
        key: string,
        computation: () => Promise<ColorData[]>
    ): Promise<ColorData[]> {
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
    hasPending(key: string): boolean {
        return this.pending.has(key);
    }

    /**
     * Get the number of cached documents
     */
    get size(): number {
        return this.cache.size;
    }

    /**
     * Get the number of pending computations
     */
    get pendingCount(): number {
        return this.pending.size;
    }
}
