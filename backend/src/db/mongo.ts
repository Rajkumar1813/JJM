import { MongoClient, Db, ClientSession } from 'mongodb';
import { Logger } from '../services/logger';

let client: MongoClient | null = null;
let db: Db | null = null;

export const initDbPool = async () => {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    Logger.error('MONGODB_URI is required in environment variables');
    process.exit(1);
  }

  const dbName = process.env.MONGODB_DB_NAME || 'hospital_signage';
  const maxPoolSize = Number(process.env.MONGODB_MAX_POOL) || 10;

  client = new MongoClient(uri, {
    maxPoolSize,
    serverSelectionTimeoutMS: 10000,
  });

  try {
    await client.connect();
    const adminDb = client.db().admin();
    const info = await adminDb.command({ hello: 1 });
    if (!info.setName) {
      Logger.error('[CRITICAL] MongoDB is not running as a replica set. Transactions require a replica set (e.g. Atlas or local mongod --replSet rs0).');
      process.exit(1);
    }
    db = client.db(dbName);
    Logger.info(`[Database] Connected to MongoDB database successfully.`);
  } catch (err) {
    Logger.error(`[Database] Connection failed. Error: ${(err as Error).message}`);
    throw err;
  }
};

export const getClient = (): MongoClient => {
  if (!client) {
    throw new Error('MongoClient is not initialized. Call initDbPool first.');
  }
  return client;
};

export const getDb = (): Db => {
  if (!db) {
    throw new Error('Database is not initialized. Call initDbPool first.');
  }
  return db;
};

export async function withTransaction<T>(callback: (session: ClientSession) => Promise<T>): Promise<T> {
  const session = getClient().startSession();
  try {
    let res: T;
    await session.withTransaction(async (sess) => {
      res = await callback(sess);
    });
    return res!;
  } finally {
    await session.endSession();
  }
}

export const closeDb = async () => {
  if (client) {
    await client.close();
    client = null;
    db = null;
    Logger.info('[Database] MongoDB connection closed.');
  }
};
