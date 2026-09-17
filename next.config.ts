import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Módulo nativo: se carga desde node_modules en runtime, sin empaquetar.
  serverExternalPackages: ["@node-rs/argon2"],
  // Las fuentes del PDF se leen del disco en runtime: hay que incluirlas en la función.
  outputFileTracingIncludes: {
    "/api/cotizaciones/[id]/pdf": ["./src/lib/pdf/fuentes/**"],
  },
  poweredByHeader: false,
};

export default nextConfig;
