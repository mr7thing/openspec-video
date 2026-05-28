/**
 * ReviewServer authentication middleware.
 *
 * Validates HMAC tunnel access token (?a=) for tunnel mode.
 * In relay mode, VPS already validated the review JWT, so no re-validation needed.
 */

import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';

const TOKEN_TTL_MS = 5 * 60 * 1000; // 5 minutes

export interface AuthOptions {
  sessionToken: string;
}

// Map<token, expiryTime> with TTL-based eviction instead of unbounded Set
const usedTokens = new Map<string, number>();
const CLEANUP_INTERVAL_MS = 60 * 1000; // run cleanup every 60s
let cleanupTimer: ReturnType<typeof setInterval> | null = null;

function scheduleCleanup(): void {
  if (cleanupTimer) return;
  cleanupTimer = setInterval(() => {
    const now = Date.now();
    for (const [token, expiry] of usedTokens.entries()) {
      if (now >= expiry) usedTokens.delete(token);
    }
    // Stop the timer when there's nothing left to clean
    if (usedTokens.size === 0 && cleanupTimer) {
      clearInterval(cleanupTimer);
      cleanupTimer = null;
    }
  }, CLEANUP_INTERVAL_MS);
}

export function createAuthMiddleware(options: AuthOptions) {
  return (req: Request, res: Response, next: NextFunction) => {
    const accessToken = req.query.a as string;

    if (!accessToken) {
      return res.status(401).json({ error: 'Access token required', code: 'TOKEN_REQUIRED' });
    }

    // Check single-use: reject if token was already consumed
    if (usedTokens.has(accessToken)) {
      return res.status(401).json({ error: 'Token already used', code: 'TOKEN_REUSED' });
    }

    if (!verifyTunnelAccessToken(accessToken, options.sessionToken)) {
      return res.status(401).json({ error: 'Invalid or expired token', code: 'TOKEN_INVALID' });
    }

    // Mark as used with TTL-based expiry
    usedTokens.set(accessToken, Date.now() + TOKEN_TTL_MS);
    scheduleCleanup();

    next();
  };
}

function verifyTunnelAccessToken(token: string, sessionToken: string): boolean {
  try {
    const decoded = Buffer.from(token, 'base64url').toString('utf-8');
    const dotIndex = decoded.lastIndexOf('.');
    if (dotIndex === -1) return false;

    const payload = decoded.substring(0, dotIndex);
    const hmac = decoded.substring(dotIndex + 1);

    const expectedHmac = crypto
      .createHmac('sha256', sessionToken)
      .update(payload)
      .digest('hex');

    if (hmac !== expectedHmac) return false;

    const parsed = JSON.parse(payload);
    if (typeof parsed.ts !== 'number') return false;

    if (Date.now() - parsed.ts > TOKEN_TTL_MS) return false;

    return true;
  } catch {
    return false;
  }
}
