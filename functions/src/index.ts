import { initializeApp } from "firebase-admin/app";
import type { Query } from "firebase-admin/firestore";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
import { logger } from "firebase-functions";
import { onSchedule } from "firebase-functions/v2/scheduler";

initializeApp();

/** ~30 days; Firestore cleanup uses a fixed window, not calendar months. */
const RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
const BATCH_SIZE = 500;

// POS orders in every business (businesses/{id}/dineInOrders, …), found with collection
// group queries (indexes in asian-le-firebase/firestore.indexes.json). Website orders
// are cleaned up by the website's own function.
const ORDER_COLLECTIONS = ["dineInOrders", "takeOutOrders"] as const;

const PRINT_QUEUE_COLLECTION = "printQueue";

async function deleteQueryInBatches(query: Query): Promise<number> {
  const snapshot = await query.limit(BATCH_SIZE).get();
  if (snapshot.empty) return 0;

  const db = getFirestore();
  const batch = db.batch();
  snapshot.docs.forEach((doc) => batch.delete(doc.ref));
  await batch.commit();

  const deleted = snapshot.size;
  const rest = await deleteQueryInBatches(query);
  return deleted + rest;
}

/** Deletes every document in a collection group, i.e. that collection in every
 * business (Firestore has no single “drop collection” API). */
async function deleteEntireCollectionGroupInBatches(
  collectionId: string,
): Promise<number> {
  const db = getFirestore();
  const col = db.collectionGroup(collectionId);
  let total = 0;

  while (true) {
    const snapshot = await col.limit(BATCH_SIZE).get();
    if (snapshot.empty) break;

    const batch = db.batch();
    snapshot.docs.forEach((doc) => batch.delete(doc.ref));
    await batch.commit();
    total += snapshot.size;
  }

  return total;
}

/**
 * Deletes POS orders (every business) where createdAt is older than ~30 days.
 * Runs daily (UTC). Requires Blaze + deploy: `firebase deploy --only functions`
 */
export const purgeStaleOrders = onSchedule(
  {
    schedule: "0 4 * * *",
    timeZone: "UTC",
    region: "us-central1",
    memory: "256MiB",
    timeoutSeconds: 540,
  },
  async () => {
    const db = getFirestore();
    const cutoff = Timestamp.fromMillis(Date.now() - RETENTION_MS);
    let total = 0;

    for (const name of ORDER_COLLECTIONS) {
      const q = db.collectionGroup(name).where("createdAt", "<", cutoff);
      const n = await deleteQueryInBatches(q);
      total += n;
      logger.info(`purgeStaleOrders: deleted ${n} from ${name}`);
    }

    logger.info(`purgeStaleOrders: finished, total deleted ${total}`);
  },
);

/**
 * Deletes **all** documents in every business's `printQueue` (batched). Runs daily at midnight in `America/Regina`.
 * Anything not yet processed by the print server at run time will be removed — acceptable only if
 * the queue is disposable. Adjust `timeZone` / `schedule` as needed.
 */
export const purgeStalePrintQueue = onSchedule(
  {
    schedule: "0 0 * * *",
    timeZone: "America/Regina",
    region: "us-central1",
    memory: "256MiB",
    timeoutSeconds: 540,
  },
  async () => {
    const n = await deleteEntireCollectionGroupInBatches(PRINT_QUEUE_COLLECTION);
    logger.info(
      `purgeStalePrintQueue: deleted ${n} docs from ${PRINT_QUEUE_COLLECTION} (full wipe)`,
    );
  },
);
