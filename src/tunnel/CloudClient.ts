import axios from 'axios';
import { logger } from '../utils/logger';
import { InfrastructureError, OpsVErrorCode } from '../errors/OpsVError';

export interface TunnelSession {
  sessionId: string;
  reviewUrl: string;
  jwt: string;
  sessionToken: string;
  tunnelUrl?: string;
  routeMode: 'tunnel' | 'relay';
  relayAvailable: boolean;
}

const CLOUD_TIMEOUT = 30000;

function unwrapData<T>(responseData: any): T {
  return (responseData?.data ?? responseData) as T;
}

function getResponseError(err: any): string {
  return err.response?.data?.error || err.response?.data?.message || err.message;
}

export class CloudClient {
  constructor(private cloudUrl: string, private authToken: string) {}

  private getHeaders() {
    const token = this.authToken.startsWith('Bearer ') ? this.authToken : `Bearer ${this.authToken}`;
    return { Authorization: token };
  }

  async createSession(): Promise<TunnelSession> {
    try {
      const response = await axios.post(`${this.cloudUrl}/api/sessions`, {}, {
        headers: this.getHeaders(),
        timeout: CLOUD_TIMEOUT,
      });
      const data = unwrapData<any>(response.data);
      return {
        sessionId: data.sessionId,
        reviewUrl: data.reviewUrl,
        jwt: data.jwt || data.reviewJwt,
        sessionToken: data.sessionToken,
        tunnelUrl: data.tunnelUrl,
        routeMode: data.routeMode || 'tunnel',
        relayAvailable: data.relayAvailable ?? false,
      };
    } catch (err: any) {
      if (err.response?.status === 402 || err.response?.status === 429) {
        throw new InfrastructureError(
          OpsVErrorCode.INFRA_NETWORK_ERROR,
          'OpsV Cloud quota exceeded. Please check your subscription plan.'
        );
      }
      logger.error(`Failed to create cloud session: ${err.message}`);
      throw new InfrastructureError(
        OpsVErrorCode.INFRA_NETWORK_ERROR,
        getResponseError(err)
      );
    }
  }

  async updateTunnelUrl(sessionId: string, tunnelUrl: string): Promise<void> {
    try {
      await axios.put(
        `${this.cloudUrl}/api/sessions/${sessionId}/tunnel-url`,
        { tunnelUrl },
        { headers: this.getHeaders(), timeout: CLOUD_TIMEOUT }
      );
    } catch (err: any) {
      logger.error(`Failed to update tunnel URL: ${err.message}`);
      throw new InfrastructureError(
        OpsVErrorCode.INFRA_NETWORK_ERROR,
        getResponseError(err)
      );
    }
  }

  async refreshSession(sessionId: string): Promise<{ jwt: string, reviewUrl: string }> {
    try {
      const response = await axios.post(`${this.cloudUrl}/api/sessions/${sessionId}/refresh`, {}, {
        headers: this.getHeaders(),
        timeout: CLOUD_TIMEOUT,
      });
      return unwrapData<{ jwt: string, reviewUrl: string }>(response.data);
    } catch (err: any) {
      logger.error(`Failed to refresh cloud session: ${err.message}`);
      throw new InfrastructureError(
        OpsVErrorCode.INFRA_NETWORK_ERROR,
        getResponseError(err)
      );
    }
  }

  async getSession(sessionId: string): Promise<any> {
    try {
      const response = await axios.get(`${this.cloudUrl}/api/sessions/${sessionId}`, {
        headers: this.getHeaders(),
        timeout: CLOUD_TIMEOUT,
      });
      return unwrapData<any>(response.data);
    } catch (err: any) {
      logger.error(`Failed to get cloud session: ${err.message}`);
      throw new InfrastructureError(
        OpsVErrorCode.INFRA_NETWORK_ERROR,
        getResponseError(err)
      );
    }
  }

  async enableRelay(sessionId: string): Promise<any> {
    try {
      const response = await axios.post(
        `${this.cloudUrl}/api/sessions/${sessionId}/relay`,
        {},
        { headers: this.getHeaders(), timeout: CLOUD_TIMEOUT }
      );
      return unwrapData<any>(response.data);
    } catch (err: any) {
      logger.error(`Failed to enable relay: ${err.message}`);
      throw new InfrastructureError(
        OpsVErrorCode.INFRA_NETWORK_ERROR,
        getResponseError(err)
      );
    }
  }

  async closeSession(sessionId: string): Promise<void> {
    try {
      await axios.post(`${this.cloudUrl}/api/sessions/${sessionId}/close`, {}, {
        headers: this.getHeaders(),
        timeout: CLOUD_TIMEOUT,
      });
    } catch (err: any) {
      logger.error(`Failed to close cloud session: ${err.message}`);
      throw new InfrastructureError(
        OpsVErrorCode.INFRA_NETWORK_ERROR,
        getResponseError(err)
      );
    }
  }
}
