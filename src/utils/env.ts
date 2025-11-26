import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { config as loadDotenv } from 'dotenv';
import { LOG_PREFIX } from './constants';

export interface TelemetrySecrets {
    endpoint?: string;
    apiKey?: string;
    apiKeyHeader?: string;
    username?: string;
    password?: string;
}

const loadedEnvPaths = new Set<string>();
let defaultsLoaded = false;

function tryLoadEnv(filePath: string): void {
    if (loadedEnvPaths.has(filePath)) {
        return;
    }

    try {
        if (fs.existsSync(filePath)) {
            loadDotenv({ path: filePath, override: false });
            loadedEnvPaths.add(filePath);
        }
    } catch (error) {
        console.warn(`${LOG_PREFIX} env loader failed to load "${filePath}"`, error);
    }
}

export function initializeEnvironment(context?: vscode.ExtensionContext): void {
    if (!defaultsLoaded) {
        loadDotenv();
        defaultsLoaded = true;
    }

    const candidatePaths = new Set<string>();

    if (context?.extensionPath) {
        candidatePaths.add(path.join(context.extensionPath, '.env'));
    }

    const folders = vscode.workspace.workspaceFolders;
    if (folders) {
        for (const folder of folders) {
            candidatePaths.add(path.join(folder.uri.fsPath, '.env'));
        }
    }

    for (const filePath of candidatePaths) {
        tryLoadEnv(filePath);
    }
}

function normalize(value?: string | null): string | undefined {
    if (!value) {
        return undefined;
    }
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
}

export function getTelemetrySecrets(): TelemetrySecrets {
    return {
        endpoint: normalize(process.env.COLORBUDDY_TELEMETRY_ENDPOINT),
        apiKey: normalize(process.env.COLORBUDDY_TELEMETRY_API_KEY),
        apiKeyHeader: normalize(process.env.COLORBUDDY_TELEMETRY_API_KEY_HEADER),
        username: normalize(process.env.COLORBUDDY_TELEMETRY_USERNAME),
        password: normalize(process.env.COLORBUDDY_TELEMETRY_PASSWORD)
    };
}
