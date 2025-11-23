/**
 * Unit tests for StateManager service
 */

import * as assert from 'assert';
import * as vscode from 'vscode';
import { StateManager } from '../../services/stateManager';

suite('StateManager Service', () => {
    let stateManager: StateManager;

    setup(() => {
        stateManager = new StateManager();
    });

    teardown(() => {
        stateManager.dispose();
    });

    suite('Decorations', () => {
        test('getDecoration returns undefined for non-existent key', () => {
            const result = stateManager.getDecoration('editor-key');
            assert.strictEqual(result, undefined);
        });

        test('setDecoration stores decoration', () => {
            const decoration = vscode.window.createTextEditorDecorationType({});
            stateManager.setDecoration('editor-1', decoration);

            const result = stateManager.getDecoration('editor-1');
            assert.strictEqual(result, decoration);
        });

        test('setDecoration disposes old decoration when setting new one', () => {
            const decoration1 = vscode.window.createTextEditorDecorationType({});
            const decoration2 = vscode.window.createTextEditorDecorationType({});

            stateManager.setDecoration('editor-1', decoration1);
            stateManager.setDecoration('editor-1', decoration2);

            const result = stateManager.getDecoration('editor-1');
            assert.strictEqual(result, decoration2);
        });

        test('removeDecoration disposes and removes decoration', () => {
            const decoration = vscode.window.createTextEditorDecorationType({});
            stateManager.setDecoration('editor-1', decoration);

            assert.strictEqual(stateManager.decorationCount, 1);

            stateManager.removeDecoration('editor-1');

            assert.strictEqual(stateManager.decorationCount, 0);
            assert.strictEqual(stateManager.getDecoration('editor-1'), undefined);
        });

        test('removeDecoration handles non-existent key gracefully', () => {
            stateManager.removeDecoration('non-existent');
            // Should not throw
            assert.strictEqual(stateManager.decorationCount, 0);
        });

        test('clearAllDecorations disposes all decorations', () => {
            const decoration1 = vscode.window.createTextEditorDecorationType({});
            const decoration2 = vscode.window.createTextEditorDecorationType({});

            stateManager.setDecoration('editor-1', decoration1);
            stateManager.setDecoration('editor-2', decoration2);

            assert.strictEqual(stateManager.decorationCount, 2);

            stateManager.clearAllDecorations();

            assert.strictEqual(stateManager.decorationCount, 0);
            assert.strictEqual(stateManager.getDecoration('editor-1'), undefined);
            assert.strictEqual(stateManager.getDecoration('editor-2'), undefined);
        });

        test('decorationCount returns correct count', () => {
            assert.strictEqual(stateManager.decorationCount, 0);

            stateManager.setDecoration('editor-1', vscode.window.createTextEditorDecorationType({}));
            assert.strictEqual(stateManager.decorationCount, 1);

            stateManager.setDecoration('editor-2', vscode.window.createTextEditorDecorationType({}));
            assert.strictEqual(stateManager.decorationCount, 2);

            stateManager.removeDecoration('editor-1');
            assert.strictEqual(stateManager.decorationCount, 1);
        });
    });

    suite('Provider Subscriptions', () => {
        test('addProviderSubscription stores subscription', () => {
            const subscription = new vscode.Disposable(() => {});
            stateManager.addProviderSubscription(subscription);

            const subscriptions = stateManager.getProviderSubscriptions();
            assert.strictEqual(subscriptions.length, 1);
            assert.strictEqual(subscriptions[0], subscription);
        });

        test('addProviderSubscription appends to list', () => {
            const sub1 = new vscode.Disposable(() => {});
            const sub2 = new vscode.Disposable(() => {});

            stateManager.addProviderSubscription(sub1);
            stateManager.addProviderSubscription(sub2);

            assert.strictEqual(stateManager.subscriptionCount, 2);
        });

        test('clearProviderSubscriptions disposes all subscriptions', () => {
            let disposed1 = false;
            let disposed2 = false;

            const sub1 = new vscode.Disposable(() => { disposed1 = true; });
            const sub2 = new vscode.Disposable(() => { disposed2 = true; });

            stateManager.addProviderSubscription(sub1);
            stateManager.addProviderSubscription(sub2);

            stateManager.clearProviderSubscriptions();

            assert.strictEqual(disposed1, true);
            assert.strictEqual(disposed2, true);
            assert.strictEqual(stateManager.subscriptionCount, 0);
        });

        test('subscriptionCount returns correct count', () => {
            assert.strictEqual(stateManager.subscriptionCount, 0);

            stateManager.addProviderSubscription(new vscode.Disposable(() => {}));
            assert.strictEqual(stateManager.subscriptionCount, 1);

            stateManager.addProviderSubscription(new vscode.Disposable(() => {}));
            assert.strictEqual(stateManager.subscriptionCount, 2);
        });
    });

    suite('Probing Flag', () => {
        test('isProbingNativeColors defaults to false', () => {
            assert.strictEqual(stateManager.isProbingNativeColors, false);
        });

        test('isProbingNativeColors can be set to true', () => {
            stateManager.isProbingNativeColors = true;
            assert.strictEqual(stateManager.isProbingNativeColors, true);
        });

        test('isProbingNativeColors can be set to false', () => {
            stateManager.isProbingNativeColors = true;
            stateManager.isProbingNativeColors = false;
            assert.strictEqual(stateManager.isProbingNativeColors, false);
        });
    });

    suite('Dispose', () => {
        test('dispose clears all decorations', () => {
            stateManager.setDecoration('editor-1', vscode.window.createTextEditorDecorationType({}));
            stateManager.setDecoration('editor-2', vscode.window.createTextEditorDecorationType({}));

            stateManager.dispose();

            assert.strictEqual(stateManager.decorationCount, 0);
        });

        test('dispose clears all subscriptions', () => {
            let disposed = false;
            stateManager.addProviderSubscription(new vscode.Disposable(() => { disposed = true; }));

            stateManager.dispose();

            assert.strictEqual(disposed, true);
            assert.strictEqual(stateManager.subscriptionCount, 0);
        });

        test('dispose can be called multiple times safely', () => {
            stateManager.setDecoration('editor-1', vscode.window.createTextEditorDecorationType({}));

            stateManager.dispose();
            stateManager.dispose();

            assert.strictEqual(stateManager.decorationCount, 0);
        });
    });

    suite('Integration', () => {
        test('manages multiple resources simultaneously', () => {
            const decoration1 = vscode.window.createTextEditorDecorationType({});
            const decoration2 = vscode.window.createTextEditorDecorationType({});
            const sub1 = new vscode.Disposable(() => {});

            stateManager.setDecoration('editor-1', decoration1);
            stateManager.setDecoration('editor-2', decoration2);
            stateManager.addProviderSubscription(sub1);
            stateManager.isProbingNativeColors = true;

            assert.strictEqual(stateManager.decorationCount, 2);
            assert.strictEqual(stateManager.subscriptionCount, 1);
            assert.strictEqual(stateManager.isProbingNativeColors, true);

            stateManager.dispose();

            assert.strictEqual(stateManager.decorationCount, 0);
            assert.strictEqual(stateManager.subscriptionCount, 0);
        });
    });
});
