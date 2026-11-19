import type { ErrorRequestHandler } from 'express';
import { ZodError } from 'zod';

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
  }
}

export function isDuplicate(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 11000;
}

export const errorHandler: ErrorRequestHandler = (error: unknown, _req, res, _next) => {
  let status = 500;
  let code = 'INTERNAL_ERROR';
  let message = 'An unexpected error occurred';
  if (error instanceof ApiError) {
    ({ status, code, message } = error);
  } else if (error instanceof ZodError) {
    status = 400; code = 'VALIDATION_ERROR'; message = error.issues[0]?.message ?? 'Invalid request';
  } else if (typeof error === 'object' && error !== null && 'type' in error) {
    if (error.type === 'entity.parse.failed') {
      status = 400; code = 'INVALID_JSON'; message = 'Request body must be valid JSON';
    } else if (error.type === 'entity.too.large') {
      status = 413; code = 'PAYLOAD_TOO_LARGE'; message = 'Request body is too large';
    } else if (error.type === 'charset.unsupported' || error.type === 'encoding.unsupported') {
      status = 415; code = 'UNSUPPORTED_MEDIA_TYPE'; message = 'Request charset or content encoding is unsupported';
    }
  }
  if (status === 500 && process.env.NODE_ENV !== 'test') console.error(error);
  res.status(status).json({ error: { code, message } });
};
