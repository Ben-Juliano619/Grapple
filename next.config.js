/** @type {import('next').NextConfig} */

// BUILD_TARGET=mobile produces a fully static export in ./out that Capacitor
// bundles into the iOS app. The normal web build (next build / next start on
// Railway) is unchanged.
const isMobileBuild = process.env.BUILD_TARGET === "mobile";

const nextConfig = isMobileBuild
  ? {
      output: "export",
      trailingSlash: true,
      images: { unoptimized: true },
    }
  : {
      // Hide the floating "N" dev badge; it covers cards when testing on a phone.
      devIndicators: false,
      // Dev only: let phones/tablets on your home network load the dev server
      // (e.g. http://192.168.1.154:3000). Next.js blocks other devices by default.
      allowedDevOrigins: ["127.0.0.1", "192.168.*.*", "10.*.*.*", "172.*.*.*", "*.local"],
      async redirects() {
        // Keep old shared links like /game/123456 working on the website.
        return [{ source: "/game/:id", destination: "/game?id=:id", permanent: false }];
      },
    };

module.exports = nextConfig;
