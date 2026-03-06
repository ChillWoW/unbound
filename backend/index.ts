import { app } from "./src/app";
import { env } from "./src/config/env";

app.listen(env.port);

console.log(`API running at ${app.server?.hostname}:${app.server?.port}`);
