import "dotenv/config";
import { createApp } from "@/app";
import { env } from "@/common/env";
import { startGrantsEngine } from "@/modules/grants/grants.engine";

const app = createApp();

app.listen(env.port, () => {
  console.log(`Naraway Sales OS API listening on port ${env.port} (${env.nodeEnv})`);
  // Grants crawl loop runs in-process. Guarded by GRANTS_ENGINE_ENABLED and a
  // Postgres advisory lock so multiple instances never double-crawl or double-email.
  void startGrantsEngine();
});
