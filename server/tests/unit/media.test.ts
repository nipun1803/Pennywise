import type { Request, Response } from 'express';
import { randomUUID } from 'node:crypto';
import { upload } from '../../src/controllers/media';

const image = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl2G3sAAAAASUVORK5CYII=';
const keys = ['CLOUDINARY_CLOUD_NAME', 'CLOUDINARY_API_KEY', 'CLOUDINARY_API_SECRET'] as const;
let previous: (string | undefined)[];
beforeEach(() => {
  previous = keys.map(key => process.env[key]);
  process.env.CLOUDINARY_CLOUD_NAME = 'test-cloud'; process.env.CLOUDINARY_API_KEY = 'test-key'; process.env.CLOUDINARY_API_SECRET = 'test-secret';
});
afterEach(() => {
  jest.restoreAllMocks();
  keys.forEach((key, i) => { if (previous[i] === undefined) delete process.env[key]; else process.env[key] = previous[i]; });
});
function runUpload() {
  const req = { body: { image } } as Request;
  const res = { locals: { userId: randomUUID() }, status: jest.fn().mockReturnThis(), json: jest.fn() };
  return { res, result: Promise.resolve(upload(req, res as unknown as Response, jest.fn())) };
}
test.each([
  [401, 'Invalid cloud_name test-cloud'],
  [401, 'cloud_name mismatch'],
  [403, 'Access denied'],
  [400, 'Invalid Signature test-secret'],
])('provider configuration failure %s does not blame the photo or expose secrets', async (status, message) => {
  jest.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: false, status, json: async () => ({ error: { message } }) } as globalThis.Response);
  const { result } = runUpload();
  await expect(result).rejects.toMatchObject({ status: 503, code: 'MEDIA_UNAVAILABLE', message: expect.stringContaining('configuration was rejected') });
  await expect(result).rejects.not.toHaveProperty('message', expect.stringContaining('test-secret'));
  await expect(result).rejects.not.toHaveProperty('message', expect.stringContaining('test-cloud'));
});
test('unreadable provider authentication response still reports configuration failure', async () => {
  jest.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: false, status: 401, json: async () => { throw new SyntaxError('Not JSON'); } } as unknown as globalThis.Response);
  await expect(runUpload().result).rejects.toMatchObject({ status: 503, code: 'MEDIA_UNAVAILABLE' });
});
test.each([429, 500, 503])('temporary provider failure %s offers a retry rather than a different image', async status => {
  jest.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: false, status, json: async () => ({ error: { message: 'Unavailable' } }) } as globalThis.Response);
  await expect(runUpload().result).rejects.toMatchObject({ status: 502, message: expect.stringContaining('temporarily unavailable') });
});
test('invalid images retain the actionable image error', async () => {
  jest.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: false, status: 400, json: async () => ({ error: { message: 'Invalid image file' } }) } as globalThis.Response);
  await expect(runUpload().result).rejects.toMatchObject({ status: 502, code: 'UPLOAD_FAILED', message: expect.stringContaining('different image') });
});
test.each(['TimeoutError', 'AbortError', 'TypeError'])('network failure %s has an actionable upload error', async name => {
  const error = new Error('Sensitive transport details'); error.name = name;
  jest.spyOn(globalThis, 'fetch').mockRejectedValue(error);
  await expect(runUpload().result).rejects.toMatchObject({ status: name === 'TypeError' ? 502 : 504, code: name === 'TypeError' ? 'UPLOAD_FAILED' : 'UPLOAD_TIMEOUT' });
});
test.each([
  null,
  { resource_type: 'image' },
  { resource_type: 'video', secure_url: 'https://res.cloudinary.com/test-cloud/image/upload/a.jpg' },
  { resource_type: 'image', secure_url: 'https://example.com/a.jpg' },
  { resource_type: 'image', secure_url: 'https://res.cloudinary.com/other-cloud/image/upload/a.jpg' },
])('invalid provider success response %# is never saved', async body => {
  jest.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: true, json: async () => body } as globalThis.Response);
  const { result, res } = runUpload();
  await expect(result).rejects.toMatchObject({ status: 502, code: 'UPLOAD_FAILED' });
  expect(res.json).not.toHaveBeenCalled();
});
test('a valid successful upload returns the image URL', async () => {
  const url = 'https://res.cloudinary.com/test-cloud/image/upload/a.jpg';
  jest.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: true, json: async () => ({ resource_type: 'image', secure_url: url }) } as globalThis.Response);
  const { result, res } = runUpload(); await result;
  expect(res.status).toHaveBeenCalledWith(201); expect(res.json).toHaveBeenCalledWith({ data: { image: url } });
});
