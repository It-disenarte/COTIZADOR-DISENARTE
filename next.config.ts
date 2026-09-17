import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Módulo nativo: se carga desde node_modules en runtime, sin empaquetar.
  serverExternalPackages: ["@node-rs/argon2"],
  poweredByHeader: false,
};

export default nextConfig;
