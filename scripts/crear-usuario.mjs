// Genera el INSERT para dar acceso a alguien a la app, con su contrasena cifrada (bcrypt).
// Uso:  npm run crear-usuario -- correo@compusoluciones.com "Contrasena segura"
// Copia el INSERT que imprime y correlo en MySQL. Si el correo ya existe, cambia su contrasena.

import { randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";

const [email, password] = process.argv.slice(2);
if (!email || !password) {
  console.error('Uso: npm run crear-usuario -- correo@compusoluciones.com "Contrasena segura"');
  process.exit(1);
}
if (password.length < 8) {
  console.error("La contrasena debe tener al menos 8 caracteres.");
  process.exit(1);
}

const sqlText = (value) => `'${value.replace(/\\/g, "\\\\").replace(/'/g, "''")}'`;
const hash = await bcrypt.hash(password, 10);
console.log(
  `INSERT INTO app_users (id, email, password_hash) VALUES (${sqlText(randomUUID())}, ${sqlText(email.trim().toLowerCase())}, ${sqlText(hash)})\n` +
    "ON DUPLICATE KEY UPDATE password_hash = VALUES(password_hash);"
);
