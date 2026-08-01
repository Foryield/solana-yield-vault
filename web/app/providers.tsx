"use client";

import { useMemo, type ReactNode } from "react";
import {
  ConnectionProvider,
  WalletProvider,
} from "@solana/wallet-adapter-react";
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui";
import "@solana/wallet-adapter-react-ui/styles.css";
import { chargerConfig, type Config } from "@/lib/config";

/**
 * Fournisseurs de portefeuille, et seul endroit ou la configuration est lue.
 *
 * AUCUN ADAPTATEUR N'EST DECLARE, et ce n'est pas un oubli. Phantom, Solflare
 * et les autres publient aujourd'hui leur portefeuille par le Wallet Standard,
 * que le fournisseur decouvre seul. Lister des adaptateurs a la main
 * embarquerait un paquet lourd pour dupliquer ce que le navigateur annonce
 * deja, et figerait une liste qui vieillit.
 *
 * Une configuration incomplete ARRETE la page avec le nom de ce qui manque.
 * Une demonstration qui se rabattrait sur des valeurs par defaut afficherait
 * des soldes faux avec l'aplomb des vrais.
 */
export function Providers({
  enfants,
}: {
  enfants: (config: Config) => ReactNode;
}) {
  const resultat = useMemo(() => {
    try {
      return { config: chargerConfig(), erreur: null };
    } catch (e) {
      return {
        config: null,
        erreur: e instanceof Error ? e.message : String(e),
      };
    }
  }, []);

  if (!resultat.config) {
    return (
      <div className="shell">
        <div className="card">
          <div className="title">Configuration incomplete</div>
          <div className="status error">{resultat.erreur}</div>
        </div>
      </div>
    );
  }

  const config = resultat.config;
  return (
    <ConnectionProvider
      endpoint={config.rpcUrl}
      config={{ commitment: "confirmed" }}
    >
      <WalletProvider wallets={[]} autoConnect>
        <WalletModalProvider>{enfants(config)}</WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
}
