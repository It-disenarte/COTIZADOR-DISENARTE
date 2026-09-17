import "dotenv/config";
import { db } from "@/lib/db";
import { sembrarAdmin } from "@/lib/seed";

async function main() {
  const resultado = await sembrarAdmin(db, {
    email: process.env.ADMIN_EMAIL,
    password: process.env.ADMIN_PASSWORD,
    nombre: process.env.ADMIN_NOMBRE,
  });
  // Nunca imprimir la contraseña.
  console.log(
    resultado === "creado"
      ? `[seed] cuenta admin creada para ${process.env.ADMIN_EMAIL}; deberá cambiar su contraseña al entrar`
      : "[seed] la cuenta admin ya existía; no se modificó",
  );
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("[seed] falló:", error instanceof Error ? error.message : error);
    process.exit(1);
  });
