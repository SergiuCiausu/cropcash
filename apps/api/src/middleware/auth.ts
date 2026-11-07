import type { NextFunction, Request, Response } from 'express';
import { createRemoteJWKSet, jwtVerify } from 'jose';

export interface AuthUser {
  userId: string;
  /** The raw access token, forwarded to Supabase so RLS applies to the request. */
  token: string;
}

export type TokenVerifier = (token: string) => Promise<{ userId: string }>;

/**
 * Verifies Supabase access tokens locally against the project's JWKS (ES256).
 * No network call per request; keys are fetched once and cached by jose.
 */
export function supabaseTokenVerifier(supabaseUrl: string): TokenVerifier {
  const issuer = `${supabaseUrl}/auth/v1`;
  const jwks = createRemoteJWKSet(new URL(`${issuer}/.well-known/jwks.json`));
  return async (token) => {
    const { payload } = await jwtVerify(token, jwks, { issuer, audience: 'authenticated' });
    if (!payload.sub) throw new Error('token has no subject');
    return { userId: payload.sub };
  };
}

declare module 'express-serve-static-core' {
  interface Locals {
    auth: AuthUser;
  }
}

export function requireAuth(verify: TokenVerifier) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const header = req.header('authorization') ?? '';
    const match = /^Bearer (.+)$/i.exec(header);
    if (!match?.[1]) {
      res.status(401).json({ error: 'unauthorized' });
      return;
    }
    try {
      const { userId } = await verify(match[1]);
      res.locals.auth = { userId, token: match[1] };
      next();
    } catch {
      res.status(401).json({ error: 'unauthorized' });
    }
  };
}
