/**
 * Smoke: verificación webhook Meta + parseo de mensajes + firma.
 * npx tsx scripts/test-meta-webhook.ts
 */
import assert from "node:assert/strict";
import crypto from "node:crypto";
import {
  resolveMetaVerifyChallenge,
  toMetaRecipient,
  verifyMetaSignature,
} from "../src/lib/wa/meta-client.js";
import {
  parseMetaWebhookMessages,
  waIdToChatKey,
} from "../src/lib/wa/meta-inbound.js";

assert.equal(
  resolveMetaVerifyChallenge({
    mode: "subscribe",
    token: "abc",
    challenge: "12345",
    verifyToken: "abc",
  }),
  "12345"
);

assert.equal(
  resolveMetaVerifyChallenge({
    mode: "subscribe",
    token: "wrong",
    challenge: "12345",
    verifyToken: "abc",
  }),
  null
);

assert.equal(toMetaRecipient("5215512345678@s.whatsapp.net"), "5215512345678");
assert.equal(waIdToChatKey("5215512345678"), "5215512345678@s.whatsapp.net");

const secret = "test-secret";
const body = JSON.stringify({ hello: "world" });
const sig =
  "sha256=" +
  crypto.createHmac("sha256", secret).update(body, "utf8").digest("hex");
assert.equal(verifyMetaSignature(body, sig, secret), true);
assert.equal(verifyMetaSignature(body, "sha256=deadbeef", secret), false);

// Sin META_LINE_ID en env, el parse no resuelve línea — solo valida que no truena.
const eventsEmpty = parseMetaWebhookMessages({
  object: "whatsapp_business_account",
  entry: [
    {
      changes: [
        {
          field: "messages",
          value: {
            metadata: { phone_number_id: "999" },
            contacts: [{ profile: { name: "Ana" }, wa_id: "5215512345678" }],
            messages: [
              {
                from: "5215512345678",
                id: "wamid.TEST1",
                type: "text",
                text: { body: "Hola" },
              },
            ],
          },
        },
      ],
    },
  ],
});
assert.equal(eventsEmpty.length, 0);

process.env.META_ACCESS_TOKEN = "token";
process.env.META_PHONE_NUMBER_ID = "999";
process.env.META_WEBHOOK_VERIFY_TOKEN = "vt";
process.env.META_APP_SECRET = "test-secret";
process.env.META_LINE_ID = "2";

const events = parseMetaWebhookMessages({
  object: "whatsapp_business_account",
  entry: [
    {
      changes: [
        {
          field: "messages",
          value: {
            metadata: { phone_number_id: "999" },
            contacts: [{ profile: { name: "Ana" }, wa_id: "5215512345678" }],
            messages: [
              {
                from: "5215512345678",
                id: "wamid.TEST2",
                type: "text",
                text: { body: "Hola colonia" },
              },
            ],
          },
        },
      ],
    },
  ],
});

assert.equal(events.length, 1);
assert.equal(events[0]!.lineId, 2);
assert.equal(events[0]!.text, "Hola colonia");
assert.equal(events[0]!.chatKey, "5215512345678@s.whatsapp.net");
assert.equal(events[0]!.pushName, "Ana");

// Idempotencia por wamid
const dup = parseMetaWebhookMessages({
  object: "whatsapp_business_account",
  entry: [
    {
      changes: [
        {
          field: "messages",
          value: {
            metadata: { phone_number_id: "999" },
            messages: [
              {
                from: "5215512345678",
                id: "wamid.TEST2",
                type: "text",
                text: { body: "Hola colonia" },
              },
            ],
          },
        },
      ],
    },
  ],
});
assert.equal(dup.length, 0);

console.log("OK: meta webhook helpers");
