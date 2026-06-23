// Crea un usuario en Supabase desde la terminal.
// Uso: npm run create-user
//
// Pregunta nombre, email, contraseña, rol y departamento por consola,
// hashea la contraseña con bcrypt (saltRounds: 12) e inserta en `users`.

import { createClient } from "@supabase/supabase-js";
import bcrypt from "bcryptjs";
import * as readline from "readline";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error(
    "Faltan SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY. Revisa tu .env.local.",
  );
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

function ask(question: string): Promise<string> {
  return new Promise((resolve) => rl.question(question, (a) => resolve(a.trim())));
}

async function main() {
  console.log("\n=== Crear usuario · Asistente Belsué ===\n");

  const name = await ask("Nombre: ");
  const email = (await ask("Email: ")).toLowerCase();
  const password = await ask("Contraseña: ");
  let role = (await ask("Rol (asesor/admin) [asesor]: ")) || "asesor";
  const department = await ask("Departamento (opcional): ");

  if (!name || !email || !password) {
    console.error("\nNombre, email y contraseña son obligatorios.");
    rl.close();
    process.exit(1);
  }
  if (role !== "asesor" && role !== "admin") {
    console.warn(`Rol "${role}" no válido; se usará "asesor".`);
    role = "asesor";
  }

  const password_hash = await bcrypt.hash(password, 12);

  const { data, error } = await supabase
    .from("users")
    .insert({
      name,
      email,
      password_hash,
      role,
      department: department || null,
    })
    .select("id, name, email, role, department")
    .single();

  rl.close();

  if (error) {
    console.error("\nError al crear el usuario:", error.message);
    process.exit(1);
  }

  console.log("\n✅ Usuario creado correctamente:");
  console.log(`   id:          ${data.id}`);
  console.log(`   nombre:      ${data.name}`);
  console.log(`   email:       ${data.email}`);
  console.log(`   rol:         ${data.role}`);
  console.log(`   departamento: ${data.department ?? "—"}\n`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
