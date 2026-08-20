import {db} from '../db.js';

// Data retention: protected customer data (order id, amount) shouldn't be
// kept longer than needed to reconcile a payment. Raw webhook payloads are
// pure logs and are purged sooner; finished charges are purged once there's
// no realistic reason to still need them (support/dispute window).
const WEBHOOK_EVENT_RETENTION_DAYS = 90;
const FINISHED_CHARGE_RETENTION_DAYS = 180;

const TERMINAL_CHARGE_STATUSES = ['PAID', 'FAILED', 'CANCELLED', 'EXPIRED'] as const;

function daysAgo(days: number): Date {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

export async function runDataRetentionCleanup() {
  const webhookEvents = await db.webhookEvent.deleteMany({
    where: {createdAt: {lt: daysAgo(WEBHOOK_EVENT_RETENTION_DAYS)}},
  });

  const charges = await db.charge.deleteMany({
    where: {
      status: {in: [...TERMINAL_CHARGE_STATUSES]},
      updatedAt: {lt: daysAgo(FINISHED_CHARGE_RETENTION_DAYS)},
    },
  });

  return {webhookEventsDeleted: webhookEvents.count, chargesDeleted: charges.count};
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runDataRetentionCleanup()
    .then((result) => {
      console.log('Data retention cleanup complete:', result);
      return db.$disconnect();
    })
    .catch(async (error) => {
      console.error('Data retention cleanup failed:', error);
      await db.$disconnect();
      process.exit(1);
    });
}
