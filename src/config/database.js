import pg from "pg";

const {
  PGHOST = "localhost",
  PGPORT = 5432,
  PGDATABASE = "cachepatterns",
  PGUSER = "cachepatterns",
  PGPASSWORD = "cachepatterns",
} = process.env;

export const pool = new pg.Pool({
  host: PGHOST,
  port: Number(PGPORT),
  database: PGDATABASE,
  user: PGUSER,
  password: PGPASSWORD,
});

export const query = (text, params) => pool.query(text, params);

export const getClient = () => pool.connect();
