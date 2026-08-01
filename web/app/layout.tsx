import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ForYield x Solana - coffre de rendement (devnet)",
  description:
    "Deposer, retirer et transferer des parts d'un coffre Solana dont les parts sont un jeton Token-2022 soumis a une liste d'autorisation. Demonstration devnet.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="fr">
      <body>{children}</body>
    </html>
  );
}
