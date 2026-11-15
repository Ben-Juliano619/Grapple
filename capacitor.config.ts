import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.grapplewrestling.cardgame",
  appName: "Grapple",
  // Static Next.js export produced by `npm run build:mobile`.
  webDir: "out",
  ios: {
    contentInset: "never",
    backgroundColor: "#240808",
  },
  plugins: {
    // WKWebView doesn't reliably persist document.cookie for the
    // capacitor:// scheme; this routes cookies through native storage so the
    // reconnect session cookie (app/lib/session.ts) survives app restarts.
    CapacitorCookies: { enabled: true },
  },
};

export default config;
