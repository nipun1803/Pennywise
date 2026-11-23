// OpenAPI lives with the API, so Swagger's Try it out uses the same origin.
const ref = (name: string) => ({ $ref: `#/components/schemas/${name}` });
const string = { type: 'string' };
const objectId = { type: 'string', pattern: '^[a-fA-F0-9]{24}$', example: '507f1f77bcf86cd799439011' };
const money = { type: 'integer', minimum: 1, maximum: Number.MAX_SAFE_INTEGER, description: 'Integer paise (hundredths of INR). No real money is transferred.', example: 15000 };
const date = { type: 'string', format: 'date-time' };
const array = (items: unknown) => ({ type: 'array', items });
const object = (properties: Record<string, unknown>, required: string[] = []) => ({ type: 'object', properties, ...(required.length ? { required } : {}) });
const input = (properties: Record<string, unknown>, required: string[] = []) => ({ ...object(properties, required), additionalProperties: false });
const name = { type: 'string', minLength: 1, maxLength: 80 };
const accent = { type: 'string', enum: ['emerald', 'blue', 'amber', 'violet', 'rose'] };
const image = { type: ['string', 'null'], maxLength: 1000, description: 'null for initials, preset:people|airplane|home|restaurant|briefcase|heart, or an HTTPS image URL from this server’s configured Cloudinary cloud.' };
const metadata = { name, description: { type: 'string', maxLength: 200 }, image, icon: { type: 'string', enum: ['people', 'airplane', 'home', 'restaurant', 'briefcase', 'heart'] }, color: accent };
const share = input({ userId: objectId, shareCents: { ...money, minimum: 0 } }, ['userId', 'shareCents']);
const expenseInput = {
  description: { type: 'string', minLength: 1, maxLength: 200 }, amountCents: money, paidBy: objectId, categoryId: { type: 'string', description: 'A standard category id (food, groceries, transport, rent, utilities, shopping, entertainment, travel, health, other) or the id of an active category from this group. Unknown, archived or cross-group choices return 400 INVALID_CATEGORY.' },
  splitMode: { type: 'string', enum: ['all', 'selected', 'allExcept', 'custom'] }, splitUserIds: { ...array(objectId), minItems: 1, uniqueItems: true },
  excludedUserIds: { ...array(objectId), minItems: 1, uniqueItems: true }, customSplits: { ...array(share), minItems: 1 },
};
const schemas = {
  User: object({ id: objectId, name, email: { type: 'string', format: 'email' }, createdAt: date, image, avatar: { type: 'string', enum: ['initials', 'leaf', 'sun', 'sparkles', 'coffee'] }, avatarColor: accent, notifications: object({ expenses: { type: 'boolean' }, payments: { type: 'boolean' }, members: { type: 'boolean' } }) }),
  Group: object({ id: objectId, ...metadata, joinCode: string, createdBy: objectId, memberCount: { type: 'integer' }, createdAt: date }),
  Member: object({ id: objectId, name, image }),
  Category: object({ id: string, name, icon: string, color: accent, standard: { type: 'boolean' }, archivedAt: { type: ['string', 'null'], format: 'date-time' } }),
  Expense: object({ id: objectId, groupId: objectId, description: string, amountCents: money, paidBy: objectId, splits: array(share), category: { anyOf: [ref('Category'), { type: 'null' }] }, createdBy: objectId, createdAt: date, updatedAt: date }),
  Settlement: object({ id: objectId, groupId: objectId, fromUser: objectId, toUser: objectId, amountCents: money, createdBy: objectId, createdAt: date, updatedAt: date, updatedBy: { type: ['string', 'null'] }, deletedAt: { type: ['string', 'null'], format: 'date-time' }, deletedBy: { type: ['string', 'null'] } }),
  PaymentInput: input({ fromUser: objectId, toUser: objectId, amountCents: money }, ['fromUser', 'toUser', 'amountCents']),
  ExpenseCreate: { ...input(expenseInput, ['description', 'amountCents', 'paidBy', 'categoryId', 'splitMode']), description: 'selected requires splitUserIds; allExcept requires excludedUserIds; custom requires unique member customSplits whose shares sum exactly to amountCents. Do not send irrelevant split fields.' },
  ExpenseEdit: { ...input(expenseInput, ['description', 'amountCents', 'paidBy']), description: 'Same split-mode rules as creation. Omitted mode keeps the original people and splits equally; use explicit custom amounts to retain unequal shares.' },
  CategoryInput: input({ name, icon: { type: 'string', enum: ['food', 'cart', 'bus', 'home', 'bulb', 'bag', 'game', 'airplane', 'heart', 'grid'] }, color: accent }, ['name']),
  PushToken: input({ token: { type: 'string', pattern: '^Expo(nent)?PushToken\\[[\\w-]{1,100}\\]$', example: 'ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]' } }, ['token']),
  Signup: input({ name, email: { type: 'string', format: 'email', maxLength: 254 }, password: { type: 'string', minLength: 8, format: 'password', description: 'Minimum 8 Unicode characters; maximum 72 UTF-8 bytes.' } }, ['name', 'email', 'password']),
  Login: input({ email: { type: 'string', format: 'email' }, password: { type: 'string', minLength: 1, format: 'password', description: 'Maximum 72 UTF-8 bytes. Not trimmed; signup policy is not reapplied.' } }, ['email', 'password']),
  Session: object({ token: string, user: ref('User') }),
  Balance: object({ userId: objectId, name, image, balanceCents: { type: 'integer', description: 'Positive: owed to member. Negative: member owes.' } }),
  Suggestion: object({ fromUser: objectId, toUser: objectId, amountCents: money }),
  Pagination: object({ page: { type: 'integer' }, limit: { type: 'integer' }, total: { type: 'integer' }, totalPages: { type: 'integer' } }),
  Error: object({ error: object({ code: string, message: string }, ['code', 'message']) }, ['error']),
  Activity: object({ id: objectId, actorId: objectId, actorName: string, action: string, at: date, before: { type: ['object', 'null'] }, after: { type: ['object', 'null'] } }),
  GlobalActivity: object({ id: objectId, actorId: objectId, actorName: string, action: string, at: date, before: { type: ['object', 'null'] }, after: { type: ['object', 'null'] }, group: ref('Group'), fromName: string, toName: string }),
  Dashboard: object({ groups: array(ref('Group')), summaries: { type: 'object', additionalProperties: object({ expenseCount: { type: 'integer' }, spendingCents: { type: 'integer' }, balanceCents: { type: 'integer' } }) }, totals: object({ expenseCount: { type: 'integer' }, spendingCents: { type: 'integer' }, balanceCents: { type: 'integer' } }) }),
  Statement: object({ view: string, userId: objectId, generatedAt: date, rows: array(object({ id: objectId, type: string, createdAt: date, description: string, amountCents: { type: 'integer' }, deltaCents: { type: 'integer' }, balanceCents: { type: 'integer' }, paidCents: { type: 'integer' }, shareCents: { type: 'integer' }, sentCents: { type: 'integer' }, receivedCents: { type: 'integer' }, category: { type: ['string', 'null'] } })), openingBalanceCents: { type: 'integer' }, closingBalanceCents: { type: 'integer' }, overallBalanceCents: { type: 'integer' } }),
};
const query = (name: string, schema: unknown) => ({ name, in: 'query', required: false, schema });
const pages = [query('page', { type: 'integer', minimum: 1, default: 1 }), query('limit', { type: 'integer', minimum: 1, maximum: 100, default: 25 })];
const search = query('search', { type: 'string', maxLength: 80 });
const key = { name: 'Idempotency-Key', in: 'header', required: true, schema: { type: 'string', format: 'uuid' }, description: 'Fresh UUID for a new record. Reuse for identical retries; changed payload returns 409.' };
type Options = { public?: boolean; body?: unknown; paginated?: boolean; status?: number; parameters?: unknown[]; description?: string };
const paths: Record<string, Record<string, unknown>> = {};
function add(method: string, path: string, tag: string, summary: string, response: unknown, options: Options = {}) {
  const parameters = [...Array.from(path.matchAll(/\{([^}]+)\}/g), match => ({ name: match[1], in: 'path', required: true, schema: match[1] === 'cid' ? string : objectId })), ...(options.paginated ? pages : []), ...(options.parameters ?? [])];
  const success = options.status === 204 ? { description: 'Removed; no content' } : { description: 'Success', content: { 'application/json': { schema: object({ data: response, ...(options.paginated ? { pagination: ref('Pagination') } : {}), ...(path === '/groups/join' ? { alreadyMember: { type: 'boolean' } } : {}) }, ['data']) } } };
  const errors = Object.fromEntries([400, 401, 403, 404, 409, 413, 415, 422, 429, 500, 502, 503].map(code => [code, { description: ({ 400: 'Invalid input', 401: 'Authentication required', 403: 'Membership or creator permission required', 404: 'Not found', 409: 'Conflict or changed idempotent request', 413: 'Body too large', 415: 'Unsupported request charset or content encoding', 422: 'Unsafe aggregate overflow', 429: 'Rate limit exceeded (global, sign-in, join or upload); see RateLimit headers', 500: 'Internal error', 502: 'Image provider failure', 503: 'Service unavailable' } as Record<number, string>)[code], content: { 'application/json': { schema: ref('Error') } } }]));
  paths[path] ??= {};
  paths[path]![method] = { tags: [tag], summary, ...(options.description ? { description: options.description } : {}), operationId: `${method}_${path.replace(/[^a-zA-Z0-9]/g, '_')}`, security: options.public ? [] : [{ bearerAuth: [] }], ...(parameters.length ? { parameters } : {}), ...(options.body ? { requestBody: { required: true, content: { 'application/json': { schema: options.body } } } } : {}), responses: { [options.status ?? 200]: success, ...errors } };
}
add('get', '/health', 'System', 'Database health', object({ status: string }), { public: true });
add('get', '/openapi.json', 'System', 'Raw OpenAPI specification (not wrapped in data)', {}, { public: true });
// The document endpoint returns the specification directly, unlike API responses.
(paths['/openapi.json']!.get as { responses: Record<string, unknown> }).responses['200'] = { description: 'OpenAPI 3.1 document', content: { 'application/json': { schema: { type: 'object' } } } };
add('post', '/auth/signup', 'Authentication', 'Create account', ref('Session'), { public: true, body: ref('Signup'), status: 201, description: 'Returns a 7-day bearer token. A duplicate email returns 409 EMAIL_IN_USE.' });
add('post', '/auth/login', 'Authentication', 'Sign in', ref('Session'), { public: true, body: ref('Login'), description: 'Returns a 7-day bearer token. Unknown email and wrong password both return 401 INVALID_CREDENTIALS.' });
add('get', '/me', 'Profile', 'Read your profile', ref('User'));
add('patch', '/me', 'Profile', 'Update profile (at least one field)', ref('User'), { body: input({ name, image, avatar: schemas.User.properties.avatar, avatarColor: accent }), description: 'Email/password changes are not accepted.' });
add('patch', '/me/notifications', 'Profile', 'Choose which push notifications you receive', ref('User'), { body: input({ expenses: { type: 'boolean' }, payments: { type: 'boolean' }, members: { type: 'boolean' } }), description: 'At least one field. All types default to on.' });
add('put', '/me/push-token', 'Profile', 'Register this device for push notifications', {}, { status: 204, body: ref('PushToken'), description: 'Moves the token off any other account that registered it. A user keeps at most 10 tokens.' });
add('delete', '/me/push-token', 'Profile', 'Stop push notifications on this device', {}, { status: 204, body: ref('PushToken') });
add('post', '/media/images', 'Photos', 'Upload a profile or group photo', object({ image: string }), { status: 201, body: input({ image: { type: 'string', maxLength: 7_000_000, pattern: '^data:image/(jpeg|png|webp);base64,', description: 'Base64 data URI; decoded image must be <=5 MB.' } }, ['image']), description: 'Server-only Cloudinary credentials required. Five attempts per user/minute/process. Public image URLs; no sensitive uploads. Replacing a reference does not delete the old asset.' });
add('get', '/dashboard', 'Overview', 'All your groups, full spending and balances', ref('Dashboard'));
add('get', '/activity', 'Overview', 'Globally paginated expense/payment audit feed', array(ref('GlobalActivity')), { paginated: true, parameters: [query('kind', { type: 'string', enum: ['all', 'expenses', 'payments'], default: 'all' })] });
add('get', '/groups', 'Groups', 'List your groups', array(ref('Group')), { paginated: true });
add('post', '/groups', 'Groups', 'Create a group', ref('Group'), { status: 201, body: input(metadata, ['name']), description: 'Not idempotent. Check your groups after a lost response before retrying.' });
add('post', '/groups/join', 'Groups', 'Join by invite code', ref('Group'), { body: input({ code: { type: 'string', minLength: 1, maxLength: 64, example: 'K7M2QX' } }, ['code']), description: 'Codes are case-insensitive. Joining a group you already belong to succeeds with alreadyMember: true. An unknown or rotated code returns 404.' });
add('get', '/groups/{id}', 'Groups', 'Read a group (member only)', ref('Group'));
add('patch', '/groups/{id}', 'Groups', 'Edit a group (creator only)', ref('Group'), { body: input(metadata), description: 'At least one field required. All changes, including setting/removing a photo or preset avatar, require the group creator.' });
add('post', '/groups/{id}/join-code', 'Groups', 'Regenerate invite code (creator only)', object({ joinCode: string }), { description: 'Invalidates existing code/QR; existing members remain.' });
add('get', '/groups/{id}/members', 'Groups', 'Search group members without exposing emails', array(ref('Member')), { paginated: true, parameters: [search] });
add('get', '/groups/{id}/balances', 'Ledger', 'Full non-deleted member balances', array(ref('Balance')));
add('get', '/groups/{id}/settle-up', 'Ledger', 'Simplified suggested repayments', array(ref('Suggestion')));
add('get', '/groups/{id}/expenses', 'Expenses', 'List non-deleted expenses', array(ref('Expense')), { paginated: true, description: 'Newest first. Deleted expenses are not listed.' });
add('post', '/groups/{id}/expenses', 'Expenses', 'Record an expense', ref('Expense'), { status: 201, body: ref('ExpenseCreate'), parameters: [key], description: 'Shares are calculated by the server (remainder cents go to the first members by id order) unless splitMode is custom. Payer and every participant must be group members, otherwise 400 INVALID_MEMBERS.' });
add('get', '/groups/{id}/expenses/{eid}', 'Expenses', 'Read an expense', ref('Expense'));
add('put', '/groups/{id}/expenses/{eid}', 'Expenses', 'Correct expense (author or group creator)', ref('Expense'), { body: ref('ExpenseEdit') });
add('delete', '/groups/{id}/expenses/{eid}', 'Expenses', 'Soft-delete expense (author or group creator)', {}, { status: 204 });
add('get', '/groups/{id}/settlements', 'Payments', 'Payment history including deleted records', array(ref('Settlement')), { paginated: true });
add('post', '/groups/{id}/settlements', 'Payments', 'Record an external payment (any member)', ref('Settlement'), { status: 201, body: ref('PaymentInput'), parameters: [key], description: 'Sender and recipient must be different group members. This does not transfer money.' });
add('put', '/groups/{id}/settlements/{sid}', 'Payments', 'Correct an external payment (any member)', ref('Settlement'), { body: ref('PaymentInput') });
add('delete', '/groups/{id}/settlements/{sid}', 'Payments', 'Soft-delete payment (any member)', {}, { status: 204 });
add('get', '/groups/{id}/categories', 'Categories', 'List standard and group categories', array(ref('Category')), { paginated: true, parameters: [search, query('includeArchived', { type: 'boolean', default: false })] });
add('post', '/groups/{id}/categories', 'Categories', 'Create category (any member)', ref('Category'), { status: 201, body: ref('CategoryInput'), description: 'Names are unique per group, including archived ones, and cannot match a standard category name; duplicates return 409 CATEGORY_NAME_IN_USE.' });
add('patch', '/groups/{id}/categories/{cid}', 'Categories', 'Edit or archive a custom category (creator only)', ref('Category'), { body: input({ ...schemas.CategoryInput.properties, archived: { type: 'boolean' } }), description: 'Every change, including rename, recolor, archive and restore (archived: false), requires the group creator. At least one field is required. Standard categories are read-only and return 404. Existing expense snapshots are not rewritten.' });
add('get', '/groups/{id}/activity', 'Ledger', 'Group audit history', array(ref('Activity')), { paginated: true, parameters: [query('kind', { type: 'string', enum: ['all', 'expenses', 'payments', 'group', 'categories'], default: 'all' })] });
add('get', '/groups/{id}/statements', 'Ledger', 'Corrected member or group spending statement', ref('Statement'), { paginated: true, parameters: [query('view', { type: 'string', enum: ['member', 'spending'], default: 'member' }), { ...query('userId', objectId), description: 'Defaults to you. Must be a group member, otherwise 400 INVALID_MEMBERS.' }] });

export const openapi = {
  openapi: '3.1.0',
  info: { title: 'Pennywise API', version: '1.0.0', description: 'Shared-expense ledger. Money is integer paise (INR); payments only record external transfers. Use signup/login to obtain a token, then click Authorize and enter the token. Group routes require membership; creator/author permissions are noted per operation. Bearer tokens last 7 days; there is no refresh or revocation. Unknown input fields are rejected. Errors use { error: { code, message } }. Requests are rate limited per client IP (and per user for joining and uploads); limited calls return 429.' },
  servers: [{ url: '/', description: 'This backend' }],
  components: { securitySchemes: { bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' } }, schemas },
  paths,
};
