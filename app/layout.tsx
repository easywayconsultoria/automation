import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "EasyWay AI", template: "%s | EasyWay AI" },
  description: "Automação segura de operações aduaneiras."
};

export default function RootLayout({
  children
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
