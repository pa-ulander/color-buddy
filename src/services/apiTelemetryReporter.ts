import * as http from 'http';
import * as https from 'https';

export interface TelemetryReporterAuth {
	apiKey?: string;
	apiKeyHeader?: string;
	basicAuth?: {
		username: string;
		password: string;
	};
	timeoutMs?: number;
}

export interface TelemetryBatchPayload {
	batch: unknown[];
	timestamp: string;
}

export interface TelemetryReporterResponse {
	success: boolean;
	statusCode: number;
	retryAfterMs?: number;
	requestId?: string;
	body?: string;
}

export class ApiTelemetryReporter {
	private readonly url: URL;
	private readonly timeoutMs: number;

	constructor(endpoint: string, private readonly auth: TelemetryReporterAuth = {}) {
		this.url = new URL(endpoint);
		this.timeoutMs = auth.timeoutMs ?? 5000;
	}

	async sendBatch(payload: TelemetryBatchPayload): Promise<TelemetryReporterResponse> {
		const body = JSON.stringify(payload);
		const isHttps = this.url.protocol === 'https:';
		const headers: Record<string, string> = {
			'Content-Type': 'application/json',
			'Content-Length': Buffer.byteLength(body, 'utf8').toString(),
			'User-Agent': 'colorbuddy-telemetry'
		};

		if (this.auth.apiKey) {
			headers[this.auth.apiKeyHeader ?? 'x-api-key'] = this.auth.apiKey;
		} else if (this.auth.basicAuth) {
			headers.Authorization = `Basic ${Buffer.from(`${this.auth.basicAuth.username}:${this.auth.basicAuth.password}`, 'utf8').toString('base64')}`;
		}

		const options: https.RequestOptions | http.RequestOptions = {
			protocol: this.url.protocol,
			hostname: this.url.hostname,
			port: this.url.port || (isHttps ? '443' : '80'),
			path: this.url.pathname + this.url.search,
			method: 'POST',
			headers,
			timeout: this.timeoutMs
		};

		const client = isHttps ? https : http;

		return new Promise<TelemetryReporterResponse>((resolve, reject) => {
			const req = client.request(options, res => {
				const chunks: Buffer[] = [];
				res.on('data', chunk => chunks.push(typeof chunk === 'string' ? Buffer.from(chunk, 'utf8') : chunk));
				res.on('end', () => {
					const responseBody = chunks.length > 0 ? Buffer.concat(chunks).toString('utf8') : undefined;
					const statusCode = res.statusCode ?? 0;
					const retryAfterHeader = res.headers['retry-after'];
					const retryAfterSeconds = Array.isArray(retryAfterHeader) ? retryAfterHeader[0] : retryAfterHeader;
					const retryAfterMs = retryAfterSeconds ? Number(retryAfterSeconds) * 1000 : undefined;
					const requestIdHeader = res.headers['x-request-id'];
					const requestId = Array.isArray(requestIdHeader) ? requestIdHeader[0] : requestIdHeader;

					const success = statusCode >= 200 && statusCode < 300;
					resolve({
						success,
						statusCode,
						retryAfterMs,
						requestId,
						body: responseBody
					});
				});
			});

			req.on('error', reject);
			req.on('timeout', () => {
				req.destroy(new Error('Telemetry request timed out'));
			});

			req.write(body);
			req.end();
		});
	}
}
