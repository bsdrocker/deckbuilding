import { buildApp } from './app.js';
import { loadEnv } from './env.js';

async function main() {
  const env = loadEnv();
  const app = await buildApp();
  try {
    await app.listen({ port: env.port, host: env.host });
    app.log.info(`Deckbuilding API listening on http://${env.host}:${env.port} (docs at /docs)`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

void main();
