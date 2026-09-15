import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "session-policy-"));
process.chdir(tmp);
fs.mkdirSync("data");

const {
  createSession,
  touchSession,
  countUserSessions,
  destroySession,
  SESSION_ABSOLUTE_SEC,
  SESSION_IDLE_SEC,
} = await import("../src/lib/auth.ts");
const db = (await import("../src/lib/db-connection.ts")).default;

db.exec(`
  CREATE TABLE IF NOT EXISTS admin_users (
    id INTEGER PRIMARY KEY,
    username TEXT,
    password_hash TEXT NOT NULL DEFAULT 'x',
    display_name TEXT,
    role TEXT NOT NULL DEFAULT 'admin',
    totp_enabled INTEGER NOT NULL DEFAULT 1
  );
`);
db.prepare(
  "INSERT INTO admin_users (id, username, password_hash, totp_enabled) VALUES (1, 'u', 'x', 1)"
).run();

test("max 2 sessions: third evicts oldest", () => {
  const a = createSession(1);
  const b = createSession(1);
  assert.equal(countUserSessions(1), 2);
  const c = createSession(1);
  assert.equal(countUserSessions(1), 2);
  assert.equal(touchSession(a), null);
  assert.ok(touchSession(b)! > 0);
  assert.ok(touchSession(c)! > 0);
  destroySession(b);
  destroySession(c);
});

test("within 8h: touch keeps long remaining (no 15m-only idle)", () => {
  const id = createSession(1);
  const remaining = touchSession(id);
  assert.ok(remaining !== null);
  // Debe quedar cerca de 8h + 15m, no solo 15m
  assert.ok(remaining! > SESSION_ABSOLUTE_SEC);
  assert.ok(remaining! <= SESSION_ABSOLUTE_SEC + SESSION_IDLE_SEC);
  destroySession(id);
});

test("after 8h: idle window applies", () => {
  const id = createSession(1);
  const now = Math.floor(Date.now() / 1000);
  // Simula que ya pasaron las 8h pero aún hay gracia
  db.prepare(
    `UPDATE sessions
     SET absolute_expires_at = ?,
         expires_at = ?
     WHERE id = ?`
  ).run(now - 1, now + SESSION_IDLE_SEC, id);

  const remaining = touchSession(id);
  assert.ok(remaining !== null);
  assert.ok(remaining! <= SESSION_IDLE_SEC);
  assert.ok(remaining! > SESSION_IDLE_SEC - 5);

  // Expira la gracia → muere
  db.prepare("UPDATE sessions SET expires_at = ? WHERE id = ?").run(now - 1, id);
  assert.equal(touchSession(id), null);
});

console.log("session-policy tests ok");
