import 'dotenv/config';
import mongoose from 'mongoose';
import { readEnvironment } from './config/env';
import { createApp } from './app';
import { ensureIndexes } from './models';

async function main() {
  const config = readEnvironment();
  await mongoose.connect(config.MONGODB_URI, { serverSelectionTimeoutMS: 10000 });
  await ensureIndexes();
  const server = createApp(config).listen(config.PORT, '0.0.0.0', () => console.log(`Pennywise API listening on port ${config.PORT}`));
  server.on('error', error => { console.error(error); void mongoose.disconnect().finally(() => process.exit(1)); });
  const shutdown = () => {
    const timeout = setTimeout(() => process.exit(1), 10000);
    timeout.unref();
    server.close(() => { void mongoose.disconnect().finally(() => { clearTimeout(timeout); process.exit(0); }); });
  };
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
}
main().catch(error => { console.error('Backend startup failed:', error); void mongoose.disconnect().finally(() => process.exit(1)); });
