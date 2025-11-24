import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { createControllerHarness } from '../helpers/controllerHarness';
import { buildLargeCssDocument } from './utils';
import { perfLogger } from '../../utils/performanceLogger';

suite('Performance Logging', () => {
	test('captures scheduler metrics across refresh cycles', async function () {
		this.timeout(30000);

		const config = vscode.workspace.getConfiguration('colorbuddy');
		const originalValue = config.get<boolean>('enablePerformanceLogging');
		await config.update('enablePerformanceLogging', true, vscode.ConfigurationTarget.Global);
		perfLogger.updateEnabled();
		perfLogger.clearMetrics();

		const { controller, restore } = await createControllerHarness();
		const controllerApi = controller as unknown as { refreshEditor(editor: vscode.TextEditor): Promise<void> };
		try {
			const largeDocument = await vscode.workspace.openTextDocument({
				language: 'css',
				content: buildLargeCssDocument(32, 48)
			});
			const largeEditor = await vscode.window.showTextDocument(largeDocument, {
				preview: false
			});

			await controllerApi.refreshEditor(largeEditor);
			await controllerApi.refreshEditor(largeEditor);
			await controllerApi.refreshEditor(largeEditor);
			await controllerApi.refreshEditor(largeEditor);

			const secondaryDocument = await vscode.workspace.openTextDocument({
				language: 'css',
				content: ':root { --secondary: 200 70% 50%; }\n.panel { color: var(--secondary); }'
			});
			const secondaryEditor = await vscode.window.showTextDocument(secondaryDocument, {
				preview: false,
				preserveFocus: true,
				viewColumn: vscode.ViewColumn.Beside
			});
			await controllerApi.refreshEditor(secondaryEditor);
			await controllerApi.refreshEditor(largeEditor);

			const logContent = perfLogger.exportLogs();
			const logDir = path.join(__dirname, '..', '..', '..', 'logs', 'metrics');
			await fs.promises.mkdir(logDir, { recursive: true });
			const timestamp = new Date().toISOString().replace(/:/g, '-').split('.')[0];
			const logPath = path.join(logDir, `perf-logger-trace-${timestamp}.md`);
			await fs.promises.writeFile(logPath, logContent, 'utf8');
			console.log(`[PerfLoggerTrace] wrote ${logPath}`);

			assert.ok(logContent.includes('refreshEditor.execute'), 'Expected refreshEditor timer metrics in perf logs');
			assert.ok(logContent.includes('Cache hit for document'), 'Expected cache events in perf logs');
		} finally {
			await config.update('enablePerformanceLogging', originalValue, vscode.ConfigurationTarget.Global);
			perfLogger.updateEnabled();
			perfLogger.clearMetrics();
			await vscode.commands.executeCommand('workbench.action.closeAllEditors');
			restore();
		}
	});
});
