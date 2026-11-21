// Explicitly isolated preview: never reads MONGODB_URI or changes a real DB.
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { createApp } from '../src/app';
import { ensureIndexes } from '../src/models';

async function main() {
  const mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri(), { dbName: 'pennywise_frontend_preview' });
  await ensureIndexes();
  const server = createApp({ jwtSecret: 'isolated-local-preview-only-do-not-deploy', corsOrigins: ['http://localhost:8081'] }).listen(3000, '0.0.0.0', () => console.log('Isolated preview API ready on http://localhost:3000 (temporary database)'));
  let closing = false;
  const stop = async () => {
    if (closing) return; closing = true;
    await new Promise<void>(resolve => server.close(() => resolve()));
    await mongoose.disconnect(); await mongo.stop();
  };
  process.once('SIGINT', () => { void stop(); });
  process.once('SIGTERM', () => { void stop(); });
}
void main().catch(error => { console.error(error); process.exitCode = 1; });
