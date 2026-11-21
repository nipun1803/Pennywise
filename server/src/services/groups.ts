import { randomInt } from 'node:crypto';
import { Group } from '../models';
import { ApiError, isDuplicate } from '../utils/errors';
import { auditEvent } from './audit';

export const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export function generateJoinCode(): string {
  return Array.from({ length: 6 }, () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]!).join('');
}
export async function createGroup(name: string, userId: string, details: { image?: string | null | undefined; description?: string | undefined; icon?: string | undefined; color?: string | undefined } = {}) {
  const metadata = { image: details.image ?? null, description: details.description ?? '', icon: details.icon ?? 'people', color: details.color ?? 'emerald' };
  for (let attempt = 0; attempt < 10; attempt++) {
    try { return await Group.create({ name, ...metadata, createdBy: userId, members: [userId], joinCode: generateJoinCode(), auditEvents: [await auditEvent(userId, 'group.created', null, { name, ...metadata })] }); }
    catch (error) { if (!isDuplicate(error)) throw error; }
  }
  throw new ApiError(503, 'CODE_UNAVAILABLE', 'Could not generate a join code; please try again');
}
export async function rotateCode(groupId: string, actor: string) {
  for (let attempt = 0; attempt < 10; attempt++) {
    const current = await Group.findById(groupId).lean();
    if (!current) throw new ApiError(404, 'NOT_FOUND', 'Group not found');
    const joinCode = generateJoinCode();
    if (joinCode === current.joinCode) continue;
    try {
      // Compare-and-set: another rotation may have changed the code since our
      // read. Retry against its new value instead of reporting a no-op success.
      const entry = await auditEvent(actor, 'group.invite_regenerated', null, { regenerated: true });
      const group = await Group.findOneAndUpdate({ _id: groupId, joinCode: current.joinCode }, { $set: { joinCode }, $push: { auditEvents: entry }, $inc: { __v: 1 } }, { returnDocument: 'after', runValidators: true });
      if (!group) continue;
      return group.joinCode;
    } catch (error) { if (!isDuplicate(error)) throw error; }
  }
  throw new ApiError(503, 'CODE_UNAVAILABLE', 'Could not generate a join code; please try again');
}
