import { Schema, model, type Types } from 'mongoose';
import { creationFields, indexCreationRecords, money, ref, type CreationRecord } from './shared';

export interface SettlementRecord extends CreationRecord {
  fromUser: Types.ObjectId; toUser: Types.ObjectId; amountCents: number;
}

const settlementSchema = new Schema<SettlementRecord>({
  ...creationFields, fromUser: ref('User'), toUser: ref('User'), amountCents: money,
}, { timestamps: true });
indexCreationRecords(settlementSchema);

export const Settlement = model<SettlementRecord>('Settlement', settlementSchema);
