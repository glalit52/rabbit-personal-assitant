import { buildServer } from "./server.js";
import { env } from "./env.js";

buildServer()
  .then((app) => app.listen({ port: env.port, host: "0.0.0.0" }))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
