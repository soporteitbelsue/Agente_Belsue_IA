/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverComponentsExternalPackages: ["unpdf", "mammoth", "imapflow", "mailparser"],
  },
};

export default nextConfig;
