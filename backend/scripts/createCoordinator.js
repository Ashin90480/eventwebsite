import bcrypt from 'bcryptjs';
import readline from 'node:readline';
import { connectDb, disconnectDb } from '../src/config/db.js';
import { env } from '../src/config/env.js';
import { Coordinator } from '../src/models/index.js';

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith('--')) out[argv[i].slice(2)] = argv[++i];
  }
  return out;
}

/** Reads a line without echoing it, so the password never appears on screen or in shell history. */
function askHidden(question) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    let muted = false;
    rl._writeToOutput = (s) => {
      if (!muted) rl.output.write(s);
    };
    rl.question(question, (answer) => {
      rl.close();
      process.stdout.write('\n');
      resolve(answer);
    });
    muted = true;
  });
}

const args = parseArgs(process.argv.slice(2));
const name = (args.name || '').trim();
const email = (args.email || '').trim().toLowerCase();
const role = args.role === 'admin' ? 'admin' : 'coordinator';

if (!name || !/^\S+@\S+\.\S+$/.test(email)) {
  console.error('Usage: npm run create-coordinator -- --name "Dr. A. Rao" --email rao@college.edu [--role admin]');
  process.exit(1);
}

const password = await askHidden('Password (min. 10 characters): ');
if (password.length < 10) {
  console.error('Password must be at least 10 characters.');
  process.exit(1);
}
const again = await askHidden('Repeat password: ');
if (again !== password) {
  console.error('Passwords do not match.');
  process.exit(1);
}

await connectDb(env.MONGODB_URI);
const passwordHash = await bcrypt.hash(password, 12);
const existing = await Coordinator.findOne({ email });
if (existing) {
  existing.passwordHash = passwordHash;
  existing.name = name;
  existing.role = role;
  existing.active = true;
  await existing.save();
  console.log(`Updated ${email} (password reset).`);
} else {
  await Coordinator.create({ name, email, passwordHash, role });
  console.log(`Created ${role} ${email}.`);
}
await disconnectDb();
