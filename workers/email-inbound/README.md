# WarmChats Inbound Email Worker

Receives every email sent to `*@mail.warmchats.com` via Cloudflare Email
Routing, parses it, and delivers it to the WarmChats app, where it threads
into the correct lead conversation.

```
Lead replies to a WarmChats email
  -> MX: mail.warmchats.com -> Cloudflare Email Routing
  -> this Worker (parses the message)
  -> POST https://dev.warmchats.com/api/elastic/inbound
  -> appears in the WarmChats inbox thread
```

## Files
- `src/index.ts` - the entire worker (~60 lines). No secrets.
- `wrangler.toml` - worker config. The only variable is INBOUND_ENDPOINT
  (the WarmChats API URL to deliver parsed emails to).
- `package.json` - one dependency, `postal-mime` (MIME parser).

## Status
The worker is ALREADY DEPLOYED in this Cloudflare account as
`warmchats-email-inbound`. Nothing needs re-deploying.

## What the account owner needs to do (one time, ~2 minutes)
These steps need account-owner permissions on the `warmchats.com` zone:

1. Dashboard -> warmchats.com zone -> Email -> Email Routing -> Enable.
   IMPORTANT: if the wizard offers to add DNS records to the APEX
   (warmchats.com), SKIP that - the apex MX is Outlook (company mail)
   and must not change.
2. Email Routing -> Settings -> Subdomains -> Add subdomain:
   `mail.warmchats.com` (accept the DNS records it creates for the
   subdomain).
3. DNS -> Records: DELETE the old record
   `mail.warmchats.com MX -> mx.inbound.elasticemail.com`
   (it conflicts with the Cloudflare MX added in step 2).
4. Email Routing -> Routing rules (subdomain mail.warmchats.com):
   set the Catch-all rule -> action "Send to a Worker" ->
   `warmchats-email-inbound` -> enable.

After step 4, reply to any WarmChats email (or send anything to
inbound+1@mail.warmchats.com) and it appears in the WarmChats inbox.

## Redeploying after a source change
```
npm install
npx wrangler deploy   # while authenticated to this Cloudflare account
```
