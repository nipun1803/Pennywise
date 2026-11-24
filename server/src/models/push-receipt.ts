import { Schema, model } from 'mongoose';

// Persist only delivery metadata, not notification bodies or financial data.
const schema = new Schema({
  ticketId: { type: String, required: true, unique: true },
  token: { type: String, required: true },
  checkAfter: { type: Date, required: true, index: true },
  expiresAt: { type: Date, required: true },
});
schema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
export const PushReceipt = model('PushReceipt', schema);
