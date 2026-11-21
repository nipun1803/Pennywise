import { Category, type CategoryRecord, type GroupRecord } from '../models';
import { ApiError } from '../utils/errors';

export const standardCategories = [
  { id: 'food', name: 'Food & drinks', icon: 'food', color: 'amber' },
  { id: 'groceries', name: 'Groceries', icon: 'cart', color: 'emerald' },
  { id: 'transport', name: 'Transport', icon: 'bus', color: 'blue' },
  { id: 'rent', name: 'Rent', icon: 'home', color: 'violet' },
  { id: 'utilities', name: 'Utilities', icon: 'bulb', color: 'amber' },
  { id: 'shopping', name: 'Shopping', icon: 'bag', color: 'rose' },
  { id: 'entertainment', name: 'Entertainment', icon: 'game', color: 'violet' },
  { id: 'travel', name: 'Travel', icon: 'airplane', color: 'blue' },
  { id: 'health', name: 'Health', icon: 'heart', color: 'rose' },
  { id: 'other', name: 'Other', icon: 'grid', color: 'emerald' },
];
export const categoryKey = (name: string) => name.normalize('NFKC').trim().toLowerCase();
export function checkCategoryName(name: string) {
  if (standardCategories.some(category => categoryKey(category.name) === categoryKey(name))) throw new ApiError(409, 'CATEGORY_NAME_IN_USE', 'A standard category already has that name');
}
export const categoryView = (category: CategoryRecord) => ({ id: String(category._id), name: category.name, icon: category.icon, color: category.color, standard: false, archivedAt: category.archivedAt?.toISOString() ?? null });
export async function expenseCategory(group: GroupRecord, categoryId?: string, existing?: { id: string; name: string; icon: string; color: string } | null) {
  if (!categoryId) return existing ?? null;
  const standard = standardCategories.find(category => category.id === categoryId);
  if (standard) return standard;
  if (!/^[a-f\d]{24}$/i.test(categoryId)) throw new ApiError(400, 'INVALID_CATEGORY', 'Choose an available category');
  const category = await Category.findOne({ _id: categoryId, groupId: group._id }).lean();
  // Existing snapshots may keep an archived category, but new choices may not.
  if (category?.archivedAt && categoryId === existing?.id) return existing;
  if (category?.archivedAt) throw new ApiError(400, 'INVALID_CATEGORY', 'Choose an available category from this group');
  if (!category) throw new ApiError(400, 'INVALID_CATEGORY', 'Choose an available category from this group');
  return { id: String(category._id), name: category.name, icon: category.icon, color: category.color };
}
