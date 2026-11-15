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
      async redirects() {
        // Keep old shared links like /game/123456 working on the website.
        return [{ source: "/game/:id", destination: "/game?id=:id", permanent: false }];
      },
    };

module.exports = nextConfig;
