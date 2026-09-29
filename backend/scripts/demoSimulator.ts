#!/usr/bin/env tsx
import path from 'path';
import dotenv from 'dotenv';

// Ensure backend/.env is reliably loaded regardless of current working directory
dotenv.config({ path: path.resolve(__dirname, '../.env') });
dotenv.config();

import { runDemoSimulator } from '../src/device/demoSimulator';

const args = process.argv.slice(2);
let targetJobId = 0;

for (let i = 0; i < args.length; i++) {
  const arg = args[i];
  if (arg === '--job' || arg === '-j' || arg === '--jobId') {
    targetJobId = parseInt(args[i + 1], 10);
    break;
  }
  if (arg.startsWith('--job=') || arg.startsWith('--jobId=')) {
    targetJobId = parseInt(arg.split('=')[1], 10);
    break;
  }
  const num = parseInt(arg, 10);
  if (!isNaN(num) && num > 0) {
    targetJobId = num;
    break;
  }
}

if (!targetJobId || isNaN(targetJobId) || targetJobId <= 0) {
  console.error('\n[DEMO SIMULATOR ERROR] Missing or invalid Job ID.');
  console.error('Usage: npm run demo:proof -- <jobId>');
  console.error('Example: npm run demo:proof -- 4\n');
  process.exit(1);
}

runDemoSimulator({ jobId: targetJobId })
  .then((res) => {
    if (!res.success) {
      process.exit(1);
    }
  })
  .catch((err) => {
    console.error(`\n[DEMO SIMULATOR ERROR]: ${err.message}\n`);
    process.exit(1);
  });
