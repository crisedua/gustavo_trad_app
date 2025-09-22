import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { users, templates, processingJobs } from '@shared/schema';

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL environment variable is required');
}

const sql = postgres(process.env.DATABASE_URL);
export const db = drizzle(sql, { schema: { users, templates, processingJobs } });