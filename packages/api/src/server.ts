// Local entry point: plain Node HTTP server, no Functions emulator needed.
import "./load-env.js";

import { app } from "./app.js";

const port = Number(process.env.PORT ?? 8787);

app.listen(port, () => {
  console.log(`[api] listening on http://localhost:${port} (${process.env.RUNTIME_ENV})`);
});
