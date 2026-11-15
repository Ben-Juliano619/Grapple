import type { Viewport } from "next";
import NativeSetup from "./NativeSetup";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // Lets the app draw edge-to-edge on notched iPhones; content is kept clear
  // of the notch / home indicator by safe-area padding on each page's root.
  viewportFit: "cover",
  themeColor: "#240808",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <style>{`
          /* Padding and borders count inside an element's width, so boxes sized to the
             screen (cards, pop-ups) never overflow and force iOS to zoom the page out. */
          *, *::before, *::after { box-sizing: border-box; }
          html { -webkit-text-size-adjust: 100%; }
          /* iOS zooms in when focusing a field with text under 16px. */
          input, select, textarea { font-size: 16px; }
          /* Feel like an app, not a web page: no text selection, no long-press
             "Save Image" menu on cards, no double-tap zoom on buttons. */
          body { -webkit-user-select: none; user-select: none; -webkit-touch-callout: none; }
          input, textarea { -webkit-user-select: text; user-select: text; }
          img { -webkit-user-drag: none; -webkit-touch-callout: none; }
          button, a, select { touch-action: manipulation; }
        `}</style>
      </head>
      <body
        style={{
          margin: 0,
          background: "#240808",
          WebkitTapHighlightColor: "transparent",
        }}
      >
        <NativeSetup />
        {children}
      </body>
    </html>
  );
}
