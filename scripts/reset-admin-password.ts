import {
  listAdminUsers,
  updateAdminUser,
} from "../src/lib/admin-settings.js";
import db from "../src/lib/db-connection.js";

const password = process.env.ADMIN_PASSWORD;
const username = process.env.ADMIN_USERNAME?.trim().toLowerCase();

if (!password || password.length < 8) {
  console.error(
    "Uso: ADMIN_PASSWORD='...' [ADMIN_USERNAME=admin] npx tsx scripts/reset-admin-password.ts"
  );
  process.exit(1);
}

const users = listAdminUsers().filter((u) =>
  username ? u.username === username : u.role === "admin"
);

if (users.length === 0) {
  console.error("No se encontraron usuarios para actualizar.");
  process.exit(1);
}

for (const user of users) {
  updateAdminUser(user.id, { password });
  console.log(`Contraseña actualizada: ${user.username}`);
}

db.prepare("DELETE FROM login_attempts").run();
db.prepare("DELETE FROM sessions").run();
console.log("Intentos fallidos y sesiones anteriores eliminados.");
