import fs from "fs";
import { fileURLToPath } from "url";
import path from "path";
import dotenv from "dotenv";
import { pool } from "../config/database.js";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const sqlFilePath = path.resolve(__dirname, "../../db/init.sql");

const seed = async () => {
  const sql = await fs.promises.readFile(sqlFilePath, "utf8");
  await pool.query(sql);
};

seed()
  .then(() => {
    // eslint-disable-next-line no-console
    console.log("Database seeded successfully");
  })
  .catch((error) => {
    // eslint-disable-next-line no-console
    console.error("Failed to seed database", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
