// ============================================================================
// OpsV Unified HTTP Client
// Handles auth, retry, timeout, logging, and error conversion.
// ============================================================================

import axios, { AxiosRequestConfig, AxiosResponse } from 'axios';
import { logger } from '../utils/logger';
import { ExecutionError, OpsVErrorCode } from '../errors/OpsVError';
import { sleep } from './polling';

export interface HttpClientOptions {
  apiKey?: string;
  authHeader?: string;
  timeout?: number;
  maxRetries?: number;
  retryDelayCap?: number;
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
    return this.withRetry(async () => {
      const response: AxiosResponse<T> = await axios.post(url, payload, {
        headers: this.buildHeaders(),
        timeout: this.options.timeout,
        ...config,
      });
      return response.data;
    }, `POST ${url}`);
  }

  async get<T>(url: string, config?: AxiosRequestConfig): Promise<T> {
    return this.withRetry(async () => {
      const response: AxiosResponse<T> = await axios.get(url, {
        headers: this.buildHeaders(),
        timeout: this.options.timeout,
        ...config,
      });
      return response.data;
    }, `GET ${url}`);
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
}
