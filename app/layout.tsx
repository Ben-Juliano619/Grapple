import type { Viewport } from "next";
import NativeSetup from "./NativeSetup";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // Lets the app draw edge-to-edge on notched iPhones; content is kept clear
  // of the notch / home indicator by safe-area padding on each page's root.
  viewportFit: "cover",
  themeColor: "#031c92",
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
          /* Portrait only on phones. The iOS app is locked to portrait; Safari can't
             lock orientation for a website, so cover the page when a phone is
             sideways (short landscape screens only; tablets/desktop unaffected). */
          .rotate-notice { display: none; }
          @media (orientation: landscape) and (max-height: 500px) {
            .rotate-notice {
              position: fixed; inset: 0; z-index: 1000;
              display: grid; place-content: center; justify-items: center; gap: 12px;
              background: #031c92; color: #fff; text-align: center;
              font: 600 18px system-ui, -apple-system, sans-serif;
            }
            .rotate-notice svg { width: 56px; height: 56px; }
          }
          @keyframes grappleSceneIn { from { opacity: 0; transform: translateY(3px); } to { opacity: 1; transform: none; } }
        `}</style>
      </head>
      <body
        style={{
          margin: 0,
          background: "#071736",
          WebkitTapHighlightColor: "transparent",
        }}
      >
        <NativeSetup />
        <div className="rotate-notice" role="alert">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <rect x="7" y="2" width="10" height="20" rx="2" />
            <path d="M11 18h2" />
          </svg>
          <div>Rotate your phone to portrait to play</div>
        </div>
        {children}
      </body>
    </html>
  );
}
