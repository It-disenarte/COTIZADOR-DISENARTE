/**
 * Crea una cuenta admin o recupera el acceso de una existente, directo en la base.
 * Úsalo si perdiste la contraseña del admin o si todas las cuentas admin quedaron desactivadas.
 *
 *   npm run crear-admin
 *
 * Requiere DATABASE_URL en .env (la URL pública de la base de producción, o la local).
 * La contraseña se escribe oculta y no se guarda en ningún archivo ni variable.
 */
import "dotenv/config";
import { createInterface } from "node:readline/promises";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { usuarios } from "@/lib/db/schema";
import { ETIQUETA_ROL } from "@/lib/permisos";
import { PASSWORD_MIN } from "@/lib/roles";
import { crearORecuperarAdmin } from "@/lib/servicios/configuracion-inicial";

function destinoSinPassword(url: string | undefined): string {
  if (!url) throw new Error("Falta DATABASE_URL en .env.");
  const { hostname, port, pathname } = new URL(url);
  return `${hostname}:${port || "5432"}${pathname}`;
}

/** Lee una línea sin mostrar lo que se escribe. */
function leerOculto(pregunta: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const { stdin, stdout } = process;
    if (!stdin.isTTY) {
      reject(new Error("Ejecuta el comando en una terminal interactiva."));
      return;
    }
    stdout.write(pregunta);
    stdin.setRawMode(true);
    stdin.setEncoding("utf8");
    stdin.resume();
    let valor = "";

    const terminar = () => {
      stdin.off("data", alTeclear);
      stdin.setRawMode(false);
      stdin.pause();
      stdout.write("\n");
    };
    function alTeclear(datos: string) {
      for (const c of datos) {
        if (c === "\r" || c === "\n") {
          terminar();
          resolve(valor);
          return;
        }
        if (c === "") {
          terminar();
          reject(new Error("Cancelado."));
          return;
        }
        if (c === "" || c === "\b") {
          if (valor) {
            valor = valor.slice(0, -1);
            stdout.write("\b \b");
          }
          continue;
        }
        valor += c;
        stdout.write("*");
      }
    }
    stdin.on("data", alTeclear);
  });
}

async function main() {
  console.log(`\nCrear o recuperar cuenta admin\nBase de datos: ${destinoSinPassword(process.env.DATABASE_URL)}\n`);

  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const email = (await rl.question("Correo: ")).trim().toLowerCase();
  const [existente] = await db
    .select({ nombre: usuarios.name, rol: usuarios.rol, activo: usuarios.activo })
    .from(usuarios)
    .where(eq(usuarios.email, email));

  let nombre: string;
  if (existente) {
    console.log(
      `\nYa existe la cuenta de ${existente.nombre} (${ETIQUETA_ROL[existente.rol]}, ${existente.activo ? "activa" : "desactivada"}).` +
        "\nSe le asignará una contraseña nueva, quedará activa con rol Admin total y se cerrarán sus sesiones.",
    );
    const respuesta = (await rl.question("¿Continuar? (s/N): ")).trim().toLowerCase();
    if (respuesta !== "s" && respuesta !== "si" && respuesta !== "sí") {
      rl.close();
      console.log("Sin cambios.");
      return;
    }
    nombre = existente.nombre;
  } else {
    nombre = (await rl.question("Nombre: ")).trim();
  }
  rl.close();

  const password = await leerOculto(`Contraseña (mínimo ${PASSWORD_MIN} caracteres): `);
  if (password !== (await leerOculto("Confirmar contraseña: "))) throw new Error("Las contraseñas no coinciden.");

  const resultado = await crearORecuperarAdmin({ nombre, email, password });
  console.log(resultado === "creado" ? `\n✔ Cuenta admin creada para ${email}.` : `\n✔ Acceso recuperado para ${email}.`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    const mensaje =
      error?.name === "ZodError"
        ? error.issues.map((i: { message: string }) => i.message).join(" ")
        : error instanceof Error
          ? error.message
          : String(error);
    console.error(`\n✖ ${mensaje}`);
    process.exit(1);
  });
