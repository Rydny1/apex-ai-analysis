import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "APEX",
  description: "A personal, pre-match football prediction dashboard.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col bg-surface-0 text-ink">{children}</body>
    </html>
  );
}
