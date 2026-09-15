import {
  createAdminUser,
  listAdminUsers,
  updateAdminUser,
} from "../src/lib/admin-settings.js";
import type { UserRole } from "../src/lib/admin-settings-types.js";

/**
 * Bootstrap del primer usuario administrador en una BD limpia.
 *
 * La app exige 2FA TOTP para dar sesión; este script solo crea el usuario con
 * contraseña. El segundo factor se configura en el primer login desde la UI.
 *
 * Uso:
 *   ADMIN_USERNAME=admin ADMIN_PASSWORD='TuPass1!' \
 *     [ADMIN_DISPLAY_NAME='Nombre'] [ADMIN_ROLE=super_admin] \
 *     npx tsx scripts/create-admin.ts
 */

const username = process.env.ADMIN_USERNAME?.trim().toLowerCase();
const password = process.env.ADMIN_PASSWORD;
const displayName = process.env.ADMIN_DISPLAY_NAME?.trim() || undefined;
const role = (process.env.ADMIN_ROLE?.trim() || "super_admin") as UserRole;

if (!username || username.length < 3) {
  console.error(
    "Falta ADMIN_USERNAME (mínimo 3 caracteres).\n" +
      "Uso: ADMIN_USERNAME=admin ADMIN_PASSWORD='TuPass1!' [ADMIN_DISPLAY_NAME='Nombre'] [ADMIN_ROLE=super_admin] npx tsx scripts/create-admin.ts"
  );
  process.exit(1);
}

if (!password || password.length < 8) {
  console.error("Falta ADMIN_PASSWORD (mínimo 8 caracteres).");
  process.exit(1);
}

const existing = listAdminUsers().find((u) => u.username === username);

if (existing) {
  updateAdminUser(existing.id, { password, role });
  console.log(
    `Usuario existente actualizado: ${existing.username} (rol: ${role}). Contraseña restablecida.`
  );
} else {
  const user = createAdminUser({
    username,
    password,
    displayName,
    role,
    allowedLineIds: [1],
  });
  console.log(
    `Usuario creado: ${user.username} (id ${user.id}, rol: ${user.role}).`
  );
}

console.log(
  "Listo. Inicia sesión en http://localhost:3000 y configura el 2FA (TOTP) en el primer acceso."
);
