import type { RequestHandler } from 'express';
import { Settlement } from '../models';
import { context } from '../middleware/membership';
import { id, settlementSchema, requestKeySchema } from '../validators';
import { pagination, pageView } from '../utils/pagination';
import { settlementView } from '../utils/serialize';
import * as ledger from '../services/ledger';

export const create: RequestHandler = async (req, res) => {
  const { group, userId } = context(res);
  const key = requestKeySchema.parse(req.get('Idempotency-Key'));
  res.status(201).json(await ledger.createSettlement(group, userId, key, settlementSchema.parse(req.body)));
};
export const list: RequestHandler = async (req, res) => {
  const { page, limit, skip } = pagination(req.query);
  const filter = { groupId: context(res).group._id };
  const [settlements, total] = await Promise.all([Settlement.find(filter).sort({ createdAt: -1, _id: -1 }).skip(skip).limit(limit).lean(), Settlement.countDocuments(filter)]);
  res.json({ data: settlements.map(settlementView), pagination: pageView(page, limit, total) });
};
export const edit: RequestHandler = async (req, res) => {
  const { group, userId } = context(res);
  res.json({ data: await ledger.editSettlement(group, userId, id.parse(req.params.sid), settlementSchema.parse(req.body)) });
};
export const remove: RequestHandler = async (req, res) => {
  const { group, userId } = context(res);
  await ledger.deleteSettlement(group, userId, id.parse(req.params.sid));
  res.sendStatus(204);
};
