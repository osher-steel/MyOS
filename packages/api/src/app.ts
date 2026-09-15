import cors from "cors";
import express from "express";
import { isProduction } from "./config/environment.js";
import { rateLimiter } from "./middleware/rateLimiter.js";
import { router } from "./routes/index.js";

export const app = express();

app.set("query parser", "extended");
app.use(cors());
app.use(express.json());

// ── Request logging (non-production) ─────────────────────
if (!isProduction()) {
  app.use((req, res, next) => {
    const startedAt = Date.now();

    res.on("finish", () => {
      const auth = req.headers.authorization ? "auth" : "anon";
      console.log(
        `[req] ${req.method} ${req.originalUrl} -> ${res.statusCode} (${auth}, ${Date.now() - startedAt}ms)`,
      );
    });

    next();
  });
}

app.use(rateLimiter);

app.get("/", (_req, res) => {
  res.status(200).send("OK");
});

app.use("/api", router);
app.use("/", router);
