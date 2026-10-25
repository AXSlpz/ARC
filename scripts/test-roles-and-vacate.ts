/**
 * Smoke: roles + vacate field mapping helpers.
 * npx tsx scripts/test-roles-and-vacate.ts
 */
import assert from "node:assert/strict";
import {
  can,
  canManageRole,
  isAdminOrAbove,
  normalizeUserRole,
} from "../src/lib/permissions";

assert.equal(normalizeUserRole("super_admin"), "super_admin");
assert.equal(normalizeUserRole("admin"), "admin");
assert.equal(normalizeUserRole("weird"), "atencion");

assert.equal(isAdminOrAbove("super_admin"), true);
assert.equal(isAdminOrAbove("admin"), true);
assert.equal(isAdminOrAbove("atencion"), false);

assert.equal(can({ role: "super_admin" }, "delete_conversation"), true);
assert.equal(can({ role: "admin" }, "delete_conversation"), false);
assert.equal(can({ role: "admin" }, "assign_chat_to_others"), true);
assert.equal(can({ role: "atencion" }, "assign_chat_to_others"), false);
assert.equal(can({ role: "atencion" }, "manage_tags"), false);
assert.equal(can({ role: "atencion" }, "residentes"), true);
assert.equal(can({ role: "admin" }, "advanced_admin"), true);
assert.equal(can({ role: "atencion" }, "crm_prospectos"), true);
assert.equal(can({ role: "atencion" }, "crm_write"), false);
assert.equal(can({ role: "admin" }, "crm_write"), true);

assert.equal(canManageRole("super_admin", "super_admin"), true);
assert.equal(canManageRole("admin", "super_admin"), false);
assert.equal(canManageRole("admin", "atencion"), true);

console.log("OK: roles permissions");
