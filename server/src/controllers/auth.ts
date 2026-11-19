import type { RequestHandler } from 'express';
import { signupSchema, loginSchema } from '../validators';
import * as authService from '../services/auth';

export const signup = (secret: string): RequestHandler => async (req, res) => {
  res.status(201).json({ data: await authService.signup(signupSchema.parse(req.body), secret) });
};
export const login = (secret: string): RequestHandler => async (req, res) => {
  res.json({ data: await authService.login(loginSchema.parse(req.body), secret) });
};
