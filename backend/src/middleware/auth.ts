import type { NextFunction, Request, Response } from 'express';

export type TokenVerifier = (idToken: string) => Promise<string>;

export interface AuthOptions {
  /** Verifies a Firebase ID token and returns the uid. Absent when Firebase isn't configured. */
  verifyToken?: TokenVerifier;
  /** Accept an anonymous per-install device ID (X-Device-Id) when no token is sent. */
  allowDeviceAuth: boolean;
}

export interface AuthedRequest extends Request {
  uid?: string;
}

const DEVICE_ID = /^[A-Za-z0-9_-]{8,64}$/;

/**
 * Resolve the caller to a user ID that scopes all their data:
 *  1. `Authorization: Bearer <Firebase ID token>` -> Firebase uid
 *  2. `X-Device-Id: <id>` (development / evaluation only) -> `device_<id>`
 */
export const authenticate = ({ verifyToken, allowDeviceAuth }: AuthOptions) =>
  async (req: AuthedRequest, res: Response, next: NextFunction) => {
    const header = req.header('authorization') || '';
    const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
    if (token && verifyToken) {
      try {
        req.uid = await verifyToken(token);
        return next();
      } catch {
        return res.status(401).json({ success: false, error: 'Invalid or expired auth token' });
      }
    }
    const deviceId = req.header('x-device-id') || '';
    if (allowDeviceAuth && DEVICE_ID.test(deviceId)) {
      req.uid = `device_${deviceId}`;
      return next();
    }
    return res.status(401).json({ success: false, error: 'Authentication required' });
  };
