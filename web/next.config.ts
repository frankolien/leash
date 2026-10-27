import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  // The repository is the root: the hosted MCP route imports the sibling mcp package.
  turbopack: { root: path.join(__dirname, "..") },
  // Lets a tunnel serve the dev server, so Claude can reach a local Leash connector while testing.
  allowedDevOrigins: ["*.ngrok-free.app", "*.ngrok-free.dev", "*.ngrok.app"],
};

export default nextConfig;
