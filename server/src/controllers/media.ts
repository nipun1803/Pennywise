import type { RequestHandler } from 'express';
import { createHash, randomUUID } from 'node:crypto';
import { z } from 'zod';
import { ApiError } from '../utils/errors';

const uploads = new Map<string, { until: number; count: number }>();

export const imageSchema = z.string().max(1000).nullable().refine(value => {
  if (value === null || /^preset:(people|airplane|home|restaurant|briefcase|heart)$/.test(value)) return true;
  const cloud = process.env.CLOUDINARY_CLOUD_NAME;
  return !!cloud && value.startsWith(`https://res.cloudinary.com/${cloud}/image/upload/`) && !/[?#]/.test(value);
}, 'Choose a preset or upload an image through Pennywise');

export const upload: RequestHandler = async (req, res) => {
  const cloud = process.env.CLOUDINARY_CLOUD_NAME;
  const apiKey = process.env.CLOUDINARY_API_KEY;
  const secret = process.env.CLOUDINARY_API_SECRET;
  if (!cloud || !apiKey || !secret) throw new ApiError(503, 'MEDIA_UNAVAILABLE', 'Photo uploads are not configured. Choose a built-in avatar instead.');
  const now = Date.now();
  for (const [userId, bucket] of uploads) if (bucket.until <= now) uploads.delete(userId);
  const bucket = uploads.get(res.locals.userId) ?? { until: now + 60_000, count: 0 };
  if (bucket.count >= 5 || uploads.size >= 10_000 && !uploads.has(res.locals.userId)) throw new ApiError(429, 'UPLOAD_LIMIT', 'Too many photo uploads. Please wait a minute.');
  bucket.count++; uploads.set(res.locals.userId, bucket);
  const { image } = z.object({ image: z.string().regex(/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/]+=*$/).max(7_000_000) }).strict().parse(req.body);
  const bytes = Buffer.from(image.split(',')[1]!, 'base64');
  if (bytes.length > 5 * 1024 * 1024) throw new ApiError(413, 'PAYLOAD_TOO_LARGE', 'Choose an image smaller than 5 MB.');
  const jpeg = bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  const png = bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  const webp = bytes.subarray(0, 4).toString() === 'RIFF' && bytes.subarray(8, 12).toString() === 'WEBP';
  if (!jpeg && !png && !webp) throw new ApiError(400, 'VALIDATION_ERROR', 'Choose a JPEG, PNG or WebP image.');
  const timestamp = Math.floor(Date.now() / 1000);
  const publicId = `pennywise/${res.locals.userId}/${randomUUID()}`;
  const signature = createHash('sha1').update(`public_id=${publicId}&timestamp=${timestamp}${secret}`).digest('hex');
  const form = new FormData();
  for (const [key, value] of Object.entries({ file: image, api_key: apiKey, public_id: publicId, timestamp: String(timestamp), signature })) form.append(key, value);
  const response = await fetch(`https://api.cloudinary.com/v1_1/${encodeURIComponent(cloud)}/image/upload`, { method: 'POST', body: form, signal: AbortSignal.timeout(12000) });
  if (!response.ok) throw new ApiError(502, 'UPLOAD_FAILED', 'The photo could not be uploaded. Try a different image.');
  const result = await response.json() as { secure_url: string; resource_type: string };
  if (result.resource_type !== 'image') throw new ApiError(502, 'UPLOAD_FAILED', 'Only images are supported.');
  res.status(201).json({ data: { image: result.secure_url } });
};
