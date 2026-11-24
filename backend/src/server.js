import { createApp } from './app.js';
import { connectDb } from './config/db.js';
import { env, mailConfigured } from './config/env.js';
import { Attendance, Coordinator, Event, EventRegistration, Student } from './models/index.js';

async function main() {
  await connectDb(env.MONGODB_URI);
  // Make sure unique indexes exist before accepting traffic: integrity relies on them.
  await Promise.all([Coordinator, Event, Student, EventRegistration, Attendance].map((m) => m.init()));

  const server = createApp().listen(env.PORT, () => {
    console.log(`EventQR API listening on :${env.PORT} (${env.NODE_ENV})`);
    console.log(mailConfigured ? 'Ticket e-mail: SMTP configured' : 'Ticket e-mail: SMTP not configured (tickets are shown on screen only)');
  });

  const stop = () => server.close(() => process.exit(0));
  process.on('SIGTERM', stop);
  process.on('SIGINT', stop);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
