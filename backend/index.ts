import { app } from "./src/app";
import { env } from "./src/config/env";
import { logger } from "./src/lib/logger";

app.listen(env.port);

console.log(`API running at ${app.server?.hostname}:${app.server?.port}`);

if (env.debug) {
    console.log(`Debug logging enabled — session log: ${logger.logFile}`);
}

logger.info("Server started", {
    port: env.port,
    nodeEnv: env.nodeEnv,
    sessionId: logger.sessionId
});
