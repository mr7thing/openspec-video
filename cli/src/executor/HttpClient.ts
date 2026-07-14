// ============================================================================
// OpsV Unified HTTP Client
// Handles auth, retry, timeout, logging, and error conversion.
//
// Set OPSV_DEBUG_HTTP=1 to log every request URL/method/headers/body and
// every response status/latency/body. Failures always log full details.
// ============================================================================

import axios, { AxiosRequestConfig, AxiosResponse } from 'axios';
import { logger } from '../utils/logger';
import { ExecutionError, InfrastructureError, OpsVErrorCode } from '../errors/OpsVError';
import { sleep } from './polling';

export interface HttpClientOptions {
  apiKey?: string;
  authHeader?: string;
  timeout?: number;
  maxRetries?: number;
  retryDelayCap?: number;
}

const DEBUG_HTTP = process.env.OPSV_DEBUG_HTTP === '1' || process.env.OPSV_DEBUG_HTTP === 'true';

function validateUrlScheme(url: string): void {
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    throw new InfrastructureError(
      OpsVErrorCode.INFRA_NETWORK_ERROR,
      `URL must use http/https scheme: ${url}`
    );
  }
}

function truncate(value: unknown, max = 1500): string {
  let s: string;
  try {
    s = typeof value === 'string' ? value : JSON.stringify(value);
  } catch {
    s = String(value);
  }
  if (!s) return '';
  return s.length > max ? `${s.slice(0, max)}…(+${s.length - max} bytes)` : s;
}

function redactHeaders(headers: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(headers)) {
    if (k.toLowerCase() === 'authorization') {
      const t = v.split(' ');
      out[k] = t.length > 1 ? `${t[0]} ***` : '***';
    } else {
      out[k] = v;
    }
  }
  return out;
}

export class HttpClient {
  private options: HttpClientOptions;

  constructor(options: HttpClientOptions = {}) {
    this.options = {
      authHeader: 'Authorization',
      timeout: 30000,
      maxRetries: 3,
      retryDelayCap: 30000,
      ...options,
    };
  }

  private buildHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (this.options.apiKey && this.options.authHeader) {
      headers[this.options.authHeader] = `Bearer ${this.options.apiKey}`;
    }
    return headers;
  }

  async post<T>(url: string, payload: unknown, config?: AxiosRequestConfig): Promise<T> {
    validateUrlScheme(url);
    const headers = this.buildHeaders();
    return this.withRetry(async () => {
      const start = Date.now();
      if (DEBUG_HTTP) {
        logger.info(`[http] POST ${url}\n  headers: ${JSON.stringify(redactHeaders(headers))}\n  body: ${truncate(payload)}`);
      }
      try {
        const response: AxiosResponse<T> = await axios.post(url, payload, {
          headers,
          timeout: this.options.timeout,
          ...config,
        });
        if (DEBUG_HTTP) {
          logger.info(`[http] ← ${response.status} ${url} (${Date.now() - start}ms) body: ${truncate(response.data)}`);
        }
        return response.data;
      } catch (err: any) {
        this.logFailure('POST', url, start, err);
        throw err;
      }
    }, `POST ${url}`);
  }

  async get<T>(url: string, config?: AxiosRequestConfig): Promise<T> {
    validateUrlScheme(url);
    const headers = this.buildHeaders();
    return this.withRetry(async () => {
      const start = Date.now();
      if (DEBUG_HTTP) {
        logger.info(`[http] GET ${url}\n  headers: ${JSON.stringify(redactHeaders(headers))}`);
      }
      try {
        const response: AxiosResponse<T> = await axios.get(url, {
          headers,
          timeout: this.options.timeout,
          ...config,
        });
        if (DEBUG_HTTP) {
          logger.info(`[http] ← ${response.status} ${url} (${Date.now() - start}ms) body: ${truncate(response.data)}`);
        }
        return response.data;
      } catch (err: any) {
        this.logFailure('GET', url, start, err);
        throw err;
      }
    }, `GET ${url}`);
  }

  private logFailure(method: string, url: string, start: number, err: any): void {
    const latency = Date.now() - start;
    const status = err.response?.status;
    const body = err.response?.data;
    const code = err.code;
    if (status) {
      logger.warn(`[http] ✗ ${method} ${url} → HTTP ${status} (${latency}ms)\n  body: ${truncate(body)}`);
    } else {
      logger.warn(`[http] ✗ ${method} ${url} → ${code || 'network error'} (${latency}ms): ${err.message}`);
    }
  }

  private async withRetry<T>(fn: () => Promise<T>, label: string): Promise<T> {
    const maxRetries = this.options.maxRetries ?? 3;
    const cap = this.options.retryDelayCap ?? 30000;
    let lastErr: any;

    for (let i = 0; i < maxRetries; i++) {
      try {
        return await fn();
      } catch (err: any) {
        lastErr = err;
        const status = err.response?.status;
        const body = err.response?.data;

        // Check if this is a retryable error
        const isRetryable = this.isRetryableError(status, body);

        if (!isRetryable && typeof status === 'number' && status >= 400 && status < 500) {
          // Don't retry most 4xx client errors — they are not recoverable
          const bodySnippet = truncate(err.response?.data, 400);
          throw new ExecutionError(
            OpsVErrorCode.EXECUTION_API_ERROR,
            `${label} → HTTP ${status}: ${err.message}${bodySnippet ? ` | body: ${bodySnippet}` : ''}`,
            { cause: err.message, status }
          );
        }

        if (i < maxRetries - 1) {
          const delay = Math.min(1000 * Math.pow(2, i), cap);
          logger.warn(`[HttpClient] ${label} failed (attempt ${i + 1}/${maxRetries}): ${err.message}. Retrying in ${delay}ms...`);
          await sleep(delay);
        }
      }
    }

    throw new ExecutionError(
      OpsVErrorCode.EXECUTION_API_ERROR,
      `${label} failed after ${maxRetries} attempts: ${lastErr?.message}`,
      { cause: lastErr?.message }
    );
  }

  /**
   * Check if an error is retryable (e.g., queue limit, rate limit).
   * For queue limit, we should wait and retry, not throw immediately.
   */
  private isRetryableError(status?: number, body?: any): boolean {
    // 421 Misdirected Request — RH queue limit
    if (status === 421) return true;

    // 429 Too Many Requests
    if (status === 429) return true;

    // RH-specific queue limit error in response body
    if (body?.errorCode === '421' || body?.code === 421) return true;
    if (body?.errorMessage?.includes('queue limit')) return true;
    if (body?.msg?.includes('queue limit')) return true;

    return false;
  }
}

