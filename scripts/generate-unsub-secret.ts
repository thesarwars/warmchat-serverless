/**
 * Generates a fresh 256-bit hex value for EMAIL_UNSUB_SIGNING_KEY - the HMAC-SHA256
 * key used to sign CAN-SPAM unsubscribe tokens (see functions/_shared/emailCompliance.ts).
 *
 * Run: pnpm gen:unsub-secret
 *
 * Prints the value plus the three operator commands needed to rotate it.
 * Copy/paste the value into .dev.vars + wrangler.toml, or pipe it into
 * `wrangler ... secret put` for prod. Nothing is written automatically.
 *
 * Rotation note: any unsubscribe link signed with the previous value will
 * fail verification after rotation. Coordinate with email send volume.
 */

import { randomBytes } from 'node:crypto';

const value = randomBytes(32).toString('hex');

process.stdout.write(`${value}\n\n`);
process.stdout.write(`# Local dev (.dev.vars):\nEMAIL_UNSUB_SIGNING_KEY=${value}\n\n`);
process.stdout.write(`# Production - Pages Functions:\nwrangler pages secret put EMAIL_UNSUB_SIGNING_KEY --project-name warmchats\n\n`);
process.stdout.write(`# Production - cron Worker:\nwrangler secret put EMAIL_UNSUB_SIGNING_KEY --name warmchats-cron\n`);
