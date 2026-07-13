import "dotenv/config";
import { createApp } from "@/app";
import { env } from "@/common/env";

const app = createApp();

app.listen(env.port, () => {
  console.log(`Naraway Sales OS API listening on port ${env.port} (${env.nodeEnv})`);
});
