import { request } from './api';

// Existing records upload on crop confirmation; new groups upload on creation.
export async function uploadPhoto(image?: string | null): Promise<string | null> {
  if (!image?.startsWith('data:')) return image ?? null;
  if (!image.startsWith('data:image/jpeg;base64,') || image.length > 7_000_000) throw new Error('Choose an image smaller than 5 MB.');
  const response = await request<{ image: string }>('/media/images', { method: 'POST', body: { image } });
  return response.data.image;
}

export function squareCrop(width: number, height: number, zoom: number, position: { x: number; y: number }) {
  const side = Math.max(1, Math.floor(Math.min(width, height) / Math.max(1, zoom)));
  return { originX: Math.round((width - side) * Math.max(0, Math.min(1, position.x))), originY: Math.round((height - side) * Math.max(0, Math.min(1, position.y))), width: side, height: side };
}
