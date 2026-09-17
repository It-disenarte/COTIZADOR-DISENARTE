import "dotenv/config";
import { db } from "@/lib/db";
import { sembrarAdmin } from "@/lib/seed";
import { omitirFueraDeProduccion } from "./entorno";

const MENSAJES = {
  creado: `[seed] cuenta admin creada para ${process.env.ADMIN_EMAIL}; deberá cambiar su contraseña al entrar`,
  ya_existia: "[seed] la cuenta admin ya existía; no se modificó",
  omitido: "[seed] sin ADMIN_EMAIL / ADMIN_PASSWORD; no se creó cuenta admin",
};

async function main() {
  if (omitirFueraDeProduccion("seed")) return;
  const resultado = await sembrarAdmin(db, {
    email: process.env.ADMIN_EMAIL,
    password: process.env.ADMIN_PASSWORD,
    nombre: process.env.ADMIN_NOMBRE,
  });
  // Nunca imprimir la contraseña.
  console.log(MENSAJES[resultado]);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("[seed] falló:", error instanceof Error ? error.message : error);
    process.exit(1);
  });
