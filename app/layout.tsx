import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Firefox WASM for iPadOS",
  description:
    "Firefox Gecko in WebAssembly with Traditional Chinese fonts and iPad keyboard support.",
  icons: {
    icon: "/firefox/logo.webp",
    shortcut: "/firefox/logo.webp",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-Hant-TW">
      <body>{children}</body>
    </html>
  );
}
