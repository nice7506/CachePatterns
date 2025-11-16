import dotenv from "dotenv";
import express from "express";
import routes from "./routes/index.js";
import { connectRedis } from "./config/redisClient.js";
import { startWriteBackWorker } from "./workers/writeBackFlusher.js";

dotenv.config();

const app = express();
const port = process.env.PORT || 3000;

app.use(express.json());
app.use("/api", routes);

app.get("/", (req, res) => {
  res.json({
    message: "Cache patterns demo running. Visit /api/docs for usage details.",
  });
});

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  // eslint-disable-next-line no-console
  console.error("Unexpected error", err);
  res.status(500).json({ error: "Internal server error" });
});

app
  .listen(port, () => {
    // eslint-disable-next-line no-console
    console.log(`Server listening on port ${port}`);
  })
  .on("listening", () => {
    connectRedis().catch((error) => {
      // eslint-disable-next-line no-console
      console.error("Failed to connect to Redis on startup", error);
    });

    startWriteBackWorker();
  });
