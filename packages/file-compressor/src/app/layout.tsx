import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "File Compressor — adaptive PDF compression with a quality gate",
  description:
    "Compresses a PDF to the smallest file that still passes a perceptual quality check, page by page. Everything runs in your browser; the file is never uploaded.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
