const { drizzle } = require('drizzle-orm/postgres-js');
const postgres = require('postgres');

async function testSupabase() {
  try {
    const sql = postgres(process.env.DATABASE_URL);
    const db = drizzle(sql);
    
    console.log('Testing Supabase connection...');
    const result = await sql`SELECT 1 as test`;
    console.log('✅ Supabase connection successful:', result);
    
    await sql.end();
    process.exit(0);
  } catch (error) {
    console.error('❌ Supabase connection failed:', error);
    process.exit(1);
  }
}

testSupabase();