import type { RequestHandler } from 'express';
import jwt from 'jsonwebtoken';
import { User } from '../models';
import { ApiError } from '../utils/errors';
import { id } from '../validators';

export const TOKEN_OPTIONS = { algorithm: 'HS256' as const, issuer: 'pennywise', audience: 'pennywise-app', expiresIn: '7d' as const };
export function authenticate(secret: string): RequestHandler {
  return async (req, res, next) => {
    const match = /^Bearer ([^\s]+)$/i.exec(req.get('Authorization') ?? '');
    if (!match) throw new ApiError(401, 'UNAUTHENTICATED', 'A valid access token is required');
    let userId: string;
    try {
      const payload = jwt.verify(match[1]!, secret, { algorithms: ['HS256'], issuer: TOKEN_OPTIONS.issuer, audience: TOKEN_OPTIONS.audience });
      if (typeof payload === 'string') throw new Error('Invalid payload');
      userId = id.parse(payload.sub);
    } catch {
      throw new ApiError(401, 'UNAUTHENTICATED', 'Access token is invalid or expired');
    }
    if (!await User.exists({ _id: userId })) throw new ApiError(401, 'UNAUTHENTICATED', 'Account not found');
    res.locals.userId = userId;
    next();
  };
}
