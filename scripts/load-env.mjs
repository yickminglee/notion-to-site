/**
 * Loads .env for local development, using Node's built-in loader (no dependency).
 * On Railway the variables are already real environment variables and no .env
 * exists — that case is expected, so a missing file is silently ignored.
 * Real environment variables always win over .env.
 */
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const envPath = resolve(dirname(fileURLToPath(import.meta.url)), '../.env');

try {
  process.loadEnvFile(envPath);
} catch {
  // No .env — fine in CI/Railway.
}
