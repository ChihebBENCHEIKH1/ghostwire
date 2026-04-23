import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Visual API Builder",
  description: "A premium visual node-based API builder",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
