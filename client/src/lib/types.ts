export type Accent = 'emerald' | 'blue' | 'amber' | 'violet' | 'rose';
export type GroupIcon = 'people' | 'airplane' | 'home' | 'restaurant' | 'briefcase' | 'heart';
export type Avatar = 'initials' | 'leaf' | 'sun' | 'sparkles' | 'coffee';
export type NotificationKind = 'expenses' | 'payments' | 'members';
export interface User { notifications?: Record<NotificationKind, boolean>; image?: string | null; id: string; name: string; email: string; createdAt: string; avatar?: Avatar; avatarColor?: Accent }
export interface Group { image?: string | null; id: string; name: string; description?: string; icon?: GroupIcon; color?: Accent; joinCode: string; memberCount: number; createdBy: string; createdAt: string }
export interface Member { id: string; name: string; image?: string | null }
export interface Balance { userId: string; name: string; balanceCents: number; image?: string | null }
export interface Category { id: string; name: string; icon: string; color: Accent; standard: boolean; archivedAt: string | null }
export interface Expense { id: string; groupId: string; description: string; amountCents: number; paidBy: string; splits: { userId: string; shareCents: number }[]; createdBy: string; createdAt: string; updatedAt: string; category: Pick<Category, 'id' | 'name' | 'icon' | 'color'> | null }
export interface Settlement { id: string; fromUser: string; toUser: string; amountCents: number; createdBy: string; createdAt: string; updatedAt: string; updatedBy: string | null; deletedAt: string | null; deletedBy: string | null }
export interface Suggestion { fromUser: string; toUser: string; amountCents: number }
export interface Pagination { page: number; limit: number; total: number; totalPages: number }
export interface Response<T> { data: T; pagination?: Pagination; alreadyMember?: boolean }
export interface Session { token: string; user: User; expiresAt: number }
