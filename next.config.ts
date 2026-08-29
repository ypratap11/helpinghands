import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Emit a self-contained server (server.js + traced node_modules) so the
  // production Docker image can ship without node_modules wholesale.
  output: "standalone",
};

export default nextConfig;
