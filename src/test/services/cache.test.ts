/**
 * Unit tests for Cache service
 */

import * as assert from 'assert';
import { Cache } from '../../services/cache';
import { createMockColorData } from '../helpers';

suite('Cache Service', () => {
    let cache: Cache;

    setup(() => {
        cache = new Cache();
    });

    suite('Basic Caching', () => {
        test('get returns undefined for non-cached URI', () => {
            const result = cache.get('file:///test.ts', 1);
            assert.strictEqual(result, undefined);
        });

        test('set and get cache color data', () => {
            const uri = 'file:///test.ts';
            const data = [createMockColorData()];

            cache.set(uri, 1, data);
            const result = cache.get(uri, 1);

            assert.strictEqual(result, data);
        });

        test('get returns undefined when version does not match', () => {
            const uri = 'file:///test.ts';
            const data = [createMockColorData()];

            cache.set(uri, 1, data);
            const result = cache.get(uri, 2);

            assert.strictEqual(result, undefined);
        });

        test('set updates existing cache entry', () => {
            const uri = 'file:///test.ts';
            const data1 = [createMockColorData({ originalText: '#ff0000' })];
            const data2 = [createMockColorData({ originalText: '#00ff00' })];

            cache.set(uri, 1, data1);
            cache.set(uri, 2, data2);

            const result = cache.get(uri, 2);
            assert.strictEqual(result, data2);
            assert.strictEqual(result?.[0].originalText, '#00ff00');
        });

        test('size returns correct number of cached documents', () => {
            assert.strictEqual(cache.size, 0);

            cache.set('file:///test1.ts', 1, []);
            assert.strictEqual(cache.size, 1);

            cache.set('file:///test2.ts', 1, []);
            assert.strictEqual(cache.size, 2);

            cache.set('file:///test1.ts', 2, []);
            assert.strictEqual(cache.size, 2);
        });
    });

    suite('Delete and Clear', () => {
        test('delete removes cached entry', () => {
            const uri = 'file:///test.ts';
            const data = [createMockColorData()];

            cache.set(uri, 1, data);
            assert.strictEqual(cache.size, 1);

            cache.delete(uri);
            assert.strictEqual(cache.size, 0);
            assert.strictEqual(cache.get(uri, 1), undefined);
        });

        test('clear removes all cached entries', () => {
            cache.set('file:///test1.ts', 1, [createMockColorData()]);
            cache.set('file:///test2.ts', 1, [createMockColorData()]);
            assert.strictEqual(cache.size, 2);

            cache.clear();

            assert.strictEqual(cache.size, 0);
            assert.strictEqual(cache.get('file:///test1.ts', 1), undefined);
            assert.strictEqual(cache.get('file:///test2.ts', 1), undefined);
        });
    });

    suite('Pending Computations', () => {
        test('getPendingOrCompute returns result of computation', async () => {
            const key = 'test-key';
            const data = [createMockColorData()];
            const computation = async () => data;

            const result = await cache.getPendingOrCompute(key, computation);

            assert.strictEqual(result, data);
        });

        test('getPendingOrCompute deduplicates concurrent requests', async () => {
            const key = 'test-key';
            let computeCount = 0;
            const data = [createMockColorData()];

            const computation = async () => {
                computeCount++;
                await new Promise(resolve => setTimeout(resolve, 10));
                return data;
            };

            // Start two concurrent requests
            const promise1 = cache.getPendingOrCompute(key, computation);
            const promise2 = cache.getPendingOrCompute(key, computation);

            const [result1, result2] = await Promise.all([promise1, promise2]);

            assert.strictEqual(result1, result2);
            assert.strictEqual(computeCount, 1); // Should only compute once
        });

        test('getPendingOrCompute cleans up after completion', async () => {
            const key = 'test-key';
            const data = [createMockColorData()];
            const computation = async () => data;

            assert.strictEqual(cache.hasPending(key), false);
            assert.strictEqual(cache.pendingCount, 0);

            const promise = cache.getPendingOrCompute(key, computation);
            assert.strictEqual(cache.hasPending(key), true);
            assert.strictEqual(cache.pendingCount, 1);

            await promise;

            assert.strictEqual(cache.hasPending(key), false);
            assert.strictEqual(cache.pendingCount, 0);
        });

        test('getPendingOrCompute cleans up on error', async () => {
            const key = 'test-key';
            const computation = async () => {
                throw new Error('Test error');
            };

            try {
                await cache.getPendingOrCompute(key, computation);
                assert.fail('Should have thrown error');
            } catch (error) {
                // Expected
            }

            assert.strictEqual(cache.hasPending(key), false);
            assert.strictEqual(cache.pendingCount, 0);
        });

        test('delete removes pending computation', () => {
            const uri = 'file:///test.ts';
            const computation = async () => {
                await new Promise(resolve => setTimeout(resolve, 100));
                return [];
            };

            void cache.getPendingOrCompute(uri, computation);
            assert.strictEqual(cache.hasPending(uri), true);

            cache.delete(uri);
            assert.strictEqual(cache.hasPending(uri), false);
        });

        test('clear removes all pending computations', () => {
            const computation = async () => {
                await new Promise(resolve => setTimeout(resolve, 100));
                return [];
            };

            void cache.getPendingOrCompute('key1', computation);
            void cache.getPendingOrCompute('key2', computation);
            assert.strictEqual(cache.pendingCount, 2);

            cache.clear();

            assert.strictEqual(cache.pendingCount, 0);
            assert.strictEqual(cache.hasPending('key1'), false);
            assert.strictEqual(cache.hasPending('key2'), false);
        });
    });

    suite('Edge Cases', () => {
        test('handles empty data array', () => {
            const uri = 'file:///test.ts';
            cache.set(uri, 1, []);

            const result = cache.get(uri, 1);
            assert.ok(Array.isArray(result));
            assert.strictEqual(result?.length, 0);
        });

        test('handles large version numbers', () => {
            const uri = 'file:///test.ts';
            const data = [createMockColorData()];

            cache.set(uri, Number.MAX_SAFE_INTEGER, data);
            const result = cache.get(uri, Number.MAX_SAFE_INTEGER);

            assert.strictEqual(result, data);
        });

        test('handles URIs with special characters', () => {
            const uri = 'file:///path/with spaces/and-dashes_and.underscores.ts';
            const data = [createMockColorData()];

            cache.set(uri, 1, data);
            const result = cache.get(uri, 1);

            assert.strictEqual(result, data);
        });
    });
});
