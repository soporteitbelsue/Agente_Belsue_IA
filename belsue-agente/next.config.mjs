/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    // @napi-rs/canvas es un módulo nativo (render de páginas de PDF): no se
    // puede empaquetar, se carga tal cual desde node_modules.
    serverComponentsExternalPackages: [
      "unpdf",
      "@napi-rs/canvas",
      "mammoth",
      "imapflow",
      "mailparser",
    ],
  },
};

export default nextConfig;
