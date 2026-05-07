import axios from 'axios';
import { logger } from '../utils/logger';

export interface TunnelSession {
  sessionId: string;
  reviewUrl: string;
  jwt: string;
  sessionToken: string; // Token used for authenticating the WS tunnel connection
}

export class CloudClient {
  constructor(private cloudUrl: string, private apiKey: string) {}

  async createSession(): Promise<TunnelSession> {
    try {
      const response = await axios.post(`${this.cloudUrl}/api/sessions`, {}, {
        headers: { Authorization: `Bearer ${this.apiKey}` }
      });
      return response.data;
    } catch (err: any) {
      if (err.response?.status === 402) {
        throw new Error('OpsV Cloud quota exceeded. Please check your subscription plan.');
      }
      logger.error(`Failed to create cloud session: ${err.message}`);
      throw new Error(err.response?.data?.error || err.message);
    }
  }

  async refreshSession(sessionId: string): Promise<{ jwt: string, reviewUrl: string }> {
    try {
      const response = await axios.post(`${this.cloudUrl}/api/sessions/${sessionId}/refresh`, {}, {
        headers: { Authorization: `Bearer ${this.apiKey}` }
      });
      return response.data;
    } catch (err: any) {
      logger.error(`Failed to refresh cloud session: ${err.message}`);
      throw new Error(err.response?.data?.error || err.message);
    }
  }

  async closeSession(sessionId: string): Promise<void> {
    try {
      await axios.post(`${this.cloudUrl}/api/sessions/${sessionId}/close`, {}, {
        headers: { Authorization: `Bearer ${this.apiKey}` }
      });
    } catch (err: any) {
      logger.error(`Failed to close cloud session: ${err.message}`);
      throw new Error(err.response?.data?.error || err.message);
    }
  }
}
