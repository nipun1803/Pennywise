// Demo data for local development. Clears every collection in MONGODB_URI first,
// so it only runs with --yes and never with NODE_ENV=production.
import 'dotenv/config';
import mongoose, { Types } from 'mongoose';
import bcrypt from 'bcrypt';
import crypto from 'crypto';
import { readEnvironment } from '../src/config/env';
import { User, Group, Expense, Settlement, Category, ensureIndexes, type AuditEvent } from '../src/models';
import { standardCategories } from '../src/services/categories';

type Person = { _id: Types.ObjectId; name: string };
const DAY = 24 * 60 * 60 * 1000;
const daysAgo = (days: number, hour = 19) => { const at = new Date(Date.now() - days * DAY); at.setHours(hour, 0, 0, 0); return at; };
const event = (actor: Person, action: string, at: Date, after: Record<string, unknown> | null): AuditEvent =>
  ({ id: new Types.ObjectId(), actorId: String(actor._id), actorName: actor.name, action, at, before: null, after });

// Fields every expense and settlement needs for idempotent creation, plus its audit trail.
function creation(groupId: Types.ObjectId, actor: Person, at: Date, action: string, after: Record<string, unknown>) {
  const requestKey = `seed-${crypto.randomUUID()}`;
  return { groupId, createdBy: actor._id, requestKey, requestHash: crypto.createHash('sha256').update(requestKey).digest('hex'), creationResponse: { seeded: true }, auditEvents: [event(actor, action, at, after)] };
}
// Splits an amount evenly in paise; the first members absorb any remainder.
function evenSplit(amountCents: number, members: Person[]) {
  const base = Math.floor(amountCents / members.length); const extra = amountCents - base * members.length;
  return members.map((member, i) => ({ userId: member._id, shareCents: base + (i < extra ? 1 : 0) }));
}
const standard = (id: string) => { const category = standardCategories.find(item => item.id === id)!; return { ...category }; };

function maskedHost(uri: string) { try { const url = new URL(uri); return `${url.protocol}//${url.host}${url.pathname}`; } catch { return '(unparseable MONGODB_URI)'; } }

async function seed() {
  const config = readEnvironment();
  if (config.NODE_ENV === 'production') throw new Error('Refusing to seed with NODE_ENV=production.');
  if (!process.argv.includes('--yes')) {
    console.error(`This deletes ALL data in ${maskedHost(config.MONGODB_URI)} and replaces it with demo data.\nRun again with: npm run seed -- --yes`);
    process.exitCode = 1; return;
  }
  console.log(`Seeding ${maskedHost(config.MONGODB_URI)}`);
  await mongoose.connect(config.MONGODB_URI);
  await ensureIndexes();
  await Promise.all([User.deleteMany({}), Group.deleteMany({}), Expense.deleteMany({}), Settlement.deleteMany({}), Category.deleteMany({})]);

  const password = 'Password123!';
  const passwordHash = await bcrypt.hash(password, 10);
  const people = await User.create([
    { name: 'Nipun Reddy', email: 'nipun@example.com', passwordHash, avatar: 'initials', avatarColor: 'violet' },
    { name: 'Priya Sharma', email: 'priya@example.com', passwordHash, avatar: 'initials', avatarColor: 'emerald' },
    { name: 'Rahul Verma', email: 'rahul@example.com', passwordHash, avatar: 'initials', avatarColor: 'amber' },
    { name: 'Ananya Iyer', email: 'ananya@example.com', passwordHash, avatar: 'initials', avatarColor: 'rose' },
    { name: 'Arjun Mehta', email: 'arjun@example.com', passwordHash, avatar: 'initials', avatarColor: 'blue' },
    { name: 'Kavya Nair', email: 'kavya@example.com', passwordHash, avatar: 'initials', avatarColor: 'emerald' },
    { name: 'Rohan Gupta', email: 'rohan@example.com', passwordHash, avatar: 'initials', avatarColor: 'blue' },
    { name: 'Sneha Kapoor', email: 'sneha@example.com', passwordHash, avatar: 'initials', avatarColor: 'rose' },
    { name: 'Vikram Singh', email: 'vikram@example.com', passwordHash, avatar: 'initials', avatarColor: 'amber' },
    { name: 'Meera Joshi', email: 'meera@example.com', passwordHash, avatar: 'initials', avatarColor: 'violet' },
  ]);
  const [nipun, priya, rahul, ananya, arjun, kavya, rohan, sneha, vikram, meera] = people;

  // Join codes follow the app's format: six characters from the unambiguous alphabet.
  const groups = [
    { name: 'Goa trip', description: 'Beach villa, scooters and seafood.', joinCode: 'GQA7TR', icon: 'airplane', color: 'violet', creator: nipun, members: [nipun, priya, rahul, ananya, kavya], createdDaysAgo: 21 },
    { name: 'Flat 402', description: 'Rent, groceries and bills for the flat.', joinCode: 'FX4H2Q', icon: 'home', color: 'blue', creator: rahul, members: [rahul, nipun, arjun, rohan], createdDaysAgo: 30 },
    { name: 'Friday dinners', description: 'Our weekly dinner plans.', joinCode: 'DNR8KP', icon: 'restaurant', color: 'amber', creator: priya, members: [priya, nipun, rahul, ananya, arjun, sneha, meera], createdDaysAgo: 14 },
    { name: 'Office lunch', description: 'Team lunches and chai runs.', joinCode: 'WRK5MP', icon: 'briefcase', color: 'emerald', creator: vikram, members: [vikram, nipun, sneha, meera, rohan, kavya], createdDaysAgo: 9 },
  ] as const;
  const [goa, flat, dinners, office] = await Promise.all(groups.map(async group => {
    const created = daysAgo(group.createdDaysAgo, 10);
    const audit = [event(group.creator, 'group.created', created, { name: group.name, description: group.description, icon: group.icon, color: group.color }),
      ...group.members.filter(member => member !== group.creator).map((member, i) => event(member, 'member.joined', new Date(created.getTime() + (i + 1) * 3600_000), { name: member.name }))];
    const doc = await Group.create({ name: group.name, description: group.description, joinCode: group.joinCode, icon: group.icon, color: group.color, createdBy: group.creator._id, members: group.members.map(member => member._id), auditEvents: audit });
    await Group.collection.updateOne({ _id: doc._id }, { $set: { createdAt: created } });
    return { doc, members: [...group.members] as Person[] };
  }));

  const villa = await Category.create({ groupId: goa.doc._id, name: 'Stay', key: 'stay', icon: 'home', color: 'violet', createdBy: nipun._id, auditEvents: [event(nipun, 'category.created', daysAgo(20), { name: 'Stay' })] });
  const custom = { id: String(villa._id), name: villa.name, icon: villa.icon, color: villa.color };

  const expenses: { group: typeof goa; paidBy: Person; description: string; rupees: number; days: number; category: ReturnType<typeof standard> | typeof custom | null; split?: Person[] }[] = [
    { group: goa, paidBy: nipun, description: 'Beach villa, 3 nights', rupees: 18000, days: 19, category: custom },
    { group: goa, paidBy: priya, description: 'Seafood dinner at Britto’s', rupees: 3640, days: 18, category: standard('food') },
    { group: goa, paidBy: rahul, description: 'Scooter rentals', rupees: 2400, days: 18, category: standard('transport') },
    { group: goa, paidBy: ananya, description: 'Snacks and water', rupees: 860, days: 17, category: standard('groceries') },
    { group: goa, paidBy: nipun, description: 'Dudhsagar jeep safari', rupees: 4800, days: 17, category: standard('travel'), split: [nipun, priya, rahul] },
    { group: goa, paidBy: kavya, description: 'Cab to the airport', rupees: 1650, days: 16, category: standard('transport') },
    { group: flat, paidBy: rahul, description: 'November rent', rupees: 36000, days: 20, category: standard('rent') },
    { group: flat, paidBy: nipun, description: 'Airtel broadband', rupees: 1179, days: 12, category: standard('utilities') },
    { group: flat, paidBy: arjun, description: 'BigBasket groceries', rupees: 2865, days: 6, category: standard('groceries') },
    { group: flat, paidBy: nipun, description: 'Electricity bill', rupees: 2140, days: 3, category: standard('utilities') },
    { group: flat, paidBy: rohan, description: 'Water cans and gas cylinder', rupees: 1340, days: 2, category: standard('utilities') },
    { group: dinners, paidBy: priya, description: 'Truffles burgers', rupees: 2450, days: 13, category: standard('food') },
    { group: dinners, paidBy: arjun, description: 'Movie tickets', rupees: 1750, days: 6, category: standard('entertainment') },
    { group: dinners, paidBy: sneha, description: 'Biryani at Paradise', rupees: 3920, days: 8, category: standard('food'), split: [sneha, priya, nipun, meera] },
    { group: dinners, paidBy: nipun, description: 'Pizza night', rupees: 2680, days: 1, category: standard('food') },
    { group: office, paidBy: vikram, description: 'Team lunch at Meghana’s', rupees: 3360, days: 7, category: standard('food') },
    { group: office, paidBy: meera, description: 'Chai and samosas', rupees: 420, days: 5, category: standard('food') },
    { group: office, paidBy: nipun, description: 'Farewell cake for Rohan', rupees: 1450, days: 4, category: standard('other'), split: [nipun, vikram, sneha, meera, kavya] },
    { group: office, paidBy: sneha, description: 'Bowling evening', rupees: 4200, days: 2, category: standard('entertainment') },
  ];
  for (const item of expenses) {
    const at = daysAgo(item.days); const amountCents = item.rupees * 100; const split = item.split ?? item.group.members;
    const doc = await Expense.create({ ...creation(item.group.doc._id, item.paidBy, at, 'expense.created', { description: item.description, amountCents, paidBy: String(item.paidBy._id), category: item.category }),
      description: item.description, amountCents, paidBy: item.paidBy._id, category: item.category, splits: evenSplit(amountCents, split) });
    await Expense.collection.updateOne({ _id: doc._id }, { $set: { createdAt: at, updatedAt: at } });
  }

  const payments: { group: typeof goa; from: Person; to: Person; rupees: number; days: number }[] = [
    { group: goa, from: rahul, to: nipun, rupees: 3000, days: 10 },
    { group: flat, from: nipun, to: rahul, rupees: 6000, days: 15 },
    { group: dinners, from: ananya, to: priya, rupees: 490, days: 9 },
    { group: goa, from: kavya, to: nipun, rupees: 2500, days: 8 },
    { group: office, from: rohan, to: vikram, rupees: 560, days: 3 },
  ];
  for (const item of payments) {
    const at = daysAgo(item.days, 21); const amountCents = item.rupees * 100;
    const doc = await Settlement.create({ ...creation(item.group.doc._id, item.from, at, 'payment.created', { fromUser: String(item.from._id), toUser: String(item.to._id), amountCents }), fromUser: item.from._id, toUser: item.to._id, amountCents });
    await Settlement.collection.updateOne({ _id: doc._id }, { $set: { createdAt: at, updatedAt: at } });
  }

  console.log(`\nSeeded ${expenses.length} expenses and ${payments.length} payments across ${groups.length} groups.`);
  console.log(`Password for every account: ${password}`);
  for (const user of people) console.log(` - ${user.email.padEnd(22)} ${user.name}`);
  for (const group of groups) console.log(` - ${group.name.padEnd(16)} code ${group.joinCode}`);
  await mongoose.disconnect();
}

seed().catch(async error => { console.error('Seeding failed:', error); await mongoose.disconnect().catch(() => undefined); process.exitCode = 1; });
