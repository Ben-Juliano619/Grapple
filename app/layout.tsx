import type { Viewport } from "next";

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
      <body
        style={{
          margin: 0,
          background: "#240808",
          WebkitTapHighlightColor: "transparent",
        }}
      >
        {children}
      </body>
    </html>
  );
}
