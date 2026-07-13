/**
 * Tunnel Adapter — Abstraction for different tunnel providers.
 *
 * Each adapter provides:
 * - A stable or temporary URL for reviewer access
 * - WebSocket connection to relay HTTP requests
 * - Lifecycle management (start/stop)
 */

export interface TunnelAdapter {
  /** Provider name */
  readonly provider: string;

  /** Start the tunnel, returns the public URL for reviewer access */
  start(localPort: number): Promise<TunnelStartResult>;

  /** Stop the tunnel and clean up resources */
  stop(): Promise<void>;

  /** Get the current tunnel URL (null if not started) */
  getTunnelUrl(): string | null;

  /** Check if tunnel is connected */
  isConnected(): boolean;
}

export interface TunnelStartResult {
  /** Public URL for reviewer access */
  url: string;

  /** Whether this is a stable URL (true for Edge, false for cloudflared) */
  stable: boolean;

  /** Provider name */
  provider: string;

  /** Provider-specific metadata */
  metadata?: Record<string, unknown>;
}

export interface TunnelAdapterConfig {
  /** Cloud API URL */
  cloudUrl: string;

  /** Session token for authentication */
  sessionToken: string;

  /** Session ID */
  sessionId: string;

  /** Edge domain (for Tencent Edge) */
  edgeDomain?: string;

  /** Edge API key */
  edgeApiKey?: string;
}
