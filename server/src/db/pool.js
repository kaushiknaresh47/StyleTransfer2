import pg from 'pg';

const { Pool } = pg;

// Prefer a single DATABASE_URL, fall back to discrete PG* vars.
const config = process.env.DATABASE_URL
  ? {
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.PGSSL === 'true' ? { rejectUnauthorized: false } : false,
    }
  : {
      host: process.env.PGHOST || 'localhost',
      port: Number(process.env.PGPORT) || 5432,
      user: process.env.PGUSER || 'postgres',
      password: process.env.PGPASSWORD || 'postgres',
      database: process.env.PGDATABASE || 'styletransfer',
    };

export const pool = new Pool(config);

pool.on('error', (err) => {
  console.error('Unexpected error on idle PostgreSQL client', err);
});

export const query = (text, params) => pool.query(text, params);

export async function checkConnection() {
  const { rows } = await pool.query('SELECT NOW() AS now');
  return rows[0].now;
}
