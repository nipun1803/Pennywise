import type { RequestHandler } from 'express';
import { z } from 'zod';
import { Category } from '../models';
import { context, requireCreator } from '../middleware/membership';
import { categorySchema, categoryUpdateSchema, id, searchSchema } from '../validators';
import { pagination, pageView } from '../utils/pagination';
import { ApiError, isDuplicate } from '../utils/errors';
import { categoryKey, categoryView, checkCategoryName, standardCategories } from '../services/categories';
import { auditedUpdate, auditEvent } from '../services/audit';
export const list: RequestHandler = async (req, res) => {
  const { page, limit, skip } = pagination(req.query); const search = searchSchema.parse(req.query.search);
  const includeArchived = z.enum(['true', 'false']).default('false').parse(req.query.includeArchived) === 'true';
  const escaped = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const standards = standardCategories.filter(category => category.name.toLowerCase().includes(search.toLowerCase()));
  const filter = { groupId: context(res).group._id, ...(includeArchived ? {} : { archivedAt: null }), ...(search ? { name: { $regex: escaped, $options: 'i' } } : {}) };
  const first = standards.slice(skip, skip + limit).map(category => ({ ...category, standard: true, archivedAt: null }));
  const total = await Category.countDocuments(filter);
  const custom = first.length < limit ? await Category.find(filter).sort({ name: 1, _id: 1 }).skip(Math.max(0, skip - standards.length)).limit(limit - first.length).lean() : [];
  res.json({ data: [...first, ...custom.map(categoryView)], pagination: pageView(page, limit, standards.length + total) });
};
export const create: RequestHandler = async (req, res) => {
  const input = categorySchema.parse(req.body); checkCategoryName(input.name);
  try { const category = await Category.create({ ...input, key: categoryKey(input.name), groupId: context(res).group._id, createdBy: res.locals.userId, auditEvents: [await auditEvent(res.locals.userId, 'category.created', null, input)] }); res.status(201).json({ data: categoryView(category) }); }
  catch (error) { if (isDuplicate(error)) throw new ApiError(409, 'CATEGORY_NAME_IN_USE', 'This group already has a category with that name'); throw error; }
};
export const edit: RequestHandler = async (req, res) => {
  requireCreator(res); const { archived, ...input } = categoryUpdateSchema.parse(req.body);
  if (input.name) checkCategoryName(input.name);
  try {
    const category = await auditedUpdate(Category, { _id: id.parse(req.params.cid), groupId: context(res).group._id }, res.locals.userId, archived ? 'category.archived' : 'category.updated', before => ({
      updates: { ...input, ...(input.name ? { key: categoryKey(input.name) } : {}), ...(archived !== undefined ? { archivedAt: archived ? new Date() : null } : {}) },
      before: { name: before.name, icon: before.icon, color: before.color, archived: !!before.archivedAt },
      after: { name: input.name ?? before.name, icon: input.icon ?? before.icon, color: input.color ?? before.color, archived: archived ?? !!before.archivedAt },
    }));
    if (!category) throw new ApiError(404, 'NOT_FOUND', 'Custom category not found');
    res.json({ data: categoryView(category) });
  } catch (error) { if (isDuplicate(error)) throw new ApiError(409, 'CATEGORY_NAME_IN_USE', 'This group already has a category with that name'); throw error; }
};
