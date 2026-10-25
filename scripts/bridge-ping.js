/**
 * Send one signed test item to the website bridge — to check a site deploy (docs/phase4/site/README.md).
 *
 *   SITE_BRIDGE_URL=https://<preview>/api/discord/bridge SITE_BRIDGE_SECRET=<secret> node scripts/bridge-ping.js
 *
 * Sends a review with key review:pingtest01; expect HTTP 200 {"ok":true} (or duplicate:true on a
 * second run). A 404 means the signature or secret does not match. Delete the test row on the site after.
 */

import { signBody } from '../src/modules/site/SiteBridge.js';

const url = process.env.SITE_BRIDGE_URL;
const secret = process.env.SITE_BRIDGE_SECRET;
if (!url || !secret) {
  console.error('Set SITE_BRIDGE_URL and SITE_BRIDGE_SECRET.');
  process.exit(1);
}

const body = JSON.stringify({
  key: 'review:pingtest01',
  kind: 'review',
  payload: { ticketId: 'pingtest01', rating: 5, comment: 'Bridge test from scripts/bridge-ping.js — delete me.', name: 'Bridge test' },
});
const timestamp = String(Math.floor(Date.now() / 1000));
const res = await fetch(url, {
  method: 'POST',
  headers: {
    'content-type': 'application/json',
    'x-bocampus-timestamp': timestamp,
    'x-bocampus-signature': signBody(secret, timestamp, body),
  },
  body,
});
console.log(res.status, await res.text());
process.exit(res.ok ? 0 : 1);
