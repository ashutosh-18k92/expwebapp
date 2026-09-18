import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 192.168.31.111: a developer's LAN IP, for the iOS simulator's
  // SERVER_TYPE=local workflow (fog-mobile-app's LOCAL_SERVER). 10.0.2.2:
  // the Android emulator's alias for the host, for the equivalent Android
  // workflow - without it, dev-mode HMR/static chunk requests from the
  // emulator are blocked and the client never hydrates at all.
  allowedDevOrigins: ["192.168.31.111", "10.0.2.2"],
};

export default nextConfig;
