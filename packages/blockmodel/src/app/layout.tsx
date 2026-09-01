import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "blockmodel",
  description: "Turn phone photos into a 3D model.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // The 3D viewer manages its own gestures; stop the page from pinch-zooming under it.
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen">{children}</body>
    </html>
  );
}
