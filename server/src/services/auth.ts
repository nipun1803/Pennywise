import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { User, type UserRecord } from '../models';
import { TOKEN_OPTIONS } from '../middleware/auth';
import { ApiError, isDuplicate } from '../utils/errors';
import { userView } from '../utils/serialize';

const authView = (user: UserRecord, secret: string) => ({ token: jwt.sign({}, secret, { ...TOKEN_OPTIONS, subject: String(user._id) }), user: userView(user) });
export async function signup(input: { name: string; email: string; password: string }, secret: string) {
  const passwordHash = await bcrypt.hash(input.password, 12);
  try {
    const user = await User.create({ name: input.name, email: input.email, passwordHash });
    return authView(user, secret);
  } catch (error) {
    if (isDuplicate(error)) throw new ApiError(409, 'EMAIL_IN_USE', 'An account with that email already exists');
    throw error;
  }
}
// A fixed valid hash keeps unknown-email attempts on the bcrypt path too.
const dummyHash = bcrypt.hashSync('pennywise-dummy-password', 12);
export async function login(input: { email: string; password: string }, secret: string) {
  const user = await User.findOne({ email: input.email }).select('+passwordHash');
  const valid = await bcrypt.compare(input.password, user?.passwordHash ?? dummyHash);
  if (!user || !valid) throw new ApiError(401, 'INVALID_CREDENTIALS', 'Invalid email or password');
  return authView(user, secret);
}
