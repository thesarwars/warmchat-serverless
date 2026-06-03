/**
 * Cloudflare Turnstile public config, kept out of the component file so the
 * widget module only exports a component (Fast Refresh requirement).
 *
 * VITE_TURNSTILE_SITE_KEY pairs with TURNSTILE_SECRET_KEY in the backend.
 * When the site key is unset, TURNSTILE_ENABLED is false and forms skip the
 * captcha gate so the app still works in unconfigured environments.
 */
export const TURNSTILE_SITE_KEY = import.meta.env.VITE_TURNSTILE_SITE_KEY as string | undefined;

/** True only when a site key is configured - forms gate submission on this. */
export const TURNSTILE_ENABLED = Boolean(TURNSTILE_SITE_KEY);
