import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { users, templates, processingJobs } from '@shared/schema';

let db: ReturnType<typeof drizzle>;

// Check for Supabase configuration first
if (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
  // Use Supabase connection via REST API endpoint
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  
  // Extract project ID from Supabase URL for database connection
  const projectId = supabaseUrl.replace('https://', '').split('.')[0];
  const supabaseDbUrl = `postgresql://postgres:[YOUR-PASSWORD]@db.${projectId}.supabase.co:5432/postgres`;
  
  // Try to construct connection using the existing DATABASE_URL if available
  const connectionString = process.env.DATABASE_URL || supabaseDbUrl;
  
  console.log('Attempting Supabase database connection...');
  const sql = postgres(connectionString, {
    ssl: { rejectUnauthorized: false },
    connect_timeout: 10,
    idle_timeout: 30,
    max_lifetime: 60 * 30
  });
  
  db = drizzle(sql, { schema: { users, templates, processingJobs } });
} else if (process.env.DATABASE_URL) {
  // Fallback to direct DATABASE_URL connection
  console.log('Using direct DATABASE_URL connection...');
  const sql = postgres(process.env.DATABASE_URL, {
    ssl: { rejectUnauthorized: false },
    connect_timeout: 10,
    idle_timeout: 30,
    max_lifetime: 60 * 30
  });
  db = drizzle(sql, { schema: { users, templates, processingJobs } });
} else {
  throw new Error('Either SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY or DATABASE_URL must be set');
}

export { db };