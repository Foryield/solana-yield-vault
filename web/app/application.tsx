"use client";

import { useCallback, useEffect, useState } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { BaseWalletMultiButton } from "@solana/wallet-adapter-react-ui";
import {
  PublicKey,
  Transaction,
  type TransactionInstruction,
} from "@solana/web3.js";
import { Providers } from "./providers";
import { lienTransaction, type Config } from "@/lib/config";
import {
  confirmer,
  deposer,
  enUnites,
  formater,
  lireEtatCoffre,
  lirePosition,
  motifDuRefus,
  panneLisible,
  retirer,
  transferer,
  type EtatCoffre,
  type Envoyer,
  type Position,
} from "@/lib/vault";

/**
 * UN SEUL BLOC, CENTRE, comme la demonstration Soroban.
 *
 * Elle n'a qu'un geste, nous en avons trois : empiles, ils feraient une colonne
 * qui n'est plus un bloc. Les trois passent donc par des onglets, ce qui garde
 * la meme forme et n'expose qu'une action a la fois.
 */

type Geste = "depot" | "retrait" | "transfert";

const ONGLETS: { geste: Geste; nom: string }[] = [
  { geste: "depot", nom: "Deposer" },
  { geste: "retrait", nom: "Retirer" },
  { geste: "transfert", nom: "Transferer" },
];

/**
 * Le bouton de portefeuille parle anglais par defaut. Le reste de la page est
 * en francais, sans accents comme tout le code de ce depot.
 */
const LIBELLES = {
  "change-wallet": "Changer de portefeuille",
  connecting: "Connexion...",
  "copy-address": "Copier l'adresse",
  copied: "Adresse copiee",
  disconnect: "Deconnecter",
  "has-wallet": "Connecter",
  "no-wallet": "Choisir un portefeuille",
} as const;

export default function Application() {
  return <Providers enfants={(config) => <Demonstration config={config} />} />;
}

function Demonstration({ config }: { config: Config }) {
  const { connection } = useConnection();
  const { publicKey, sendTransaction } = useWallet();

  const [coffre, setCoffre] = useState<EtatCoffre | null>(null);
  const [position, setPosition] = useState<Position | null>(null);
  const [panne, setPanne] = useState<string | null>(null);

  const [onglet, setOnglet] = useState<Geste>("depot");
  const [montantDepot, setMontantDepot] = useState("1");
  const [montantRetrait, setMontantRetrait] = useState("0.5");
  const [montantTransfert, setMontantTransfert] = useState("0.1");
  const [destinataire, setDestinataire] = useState(
    config.porteurAutorise.toBase58(),
  );

  const [enCours, setEnCours] = useState(false);
  const [signature, setSignature] = useState<string | null>(null);
  const [refus, setRefus] = useState<string | null>(null);

  const rafraichir = useCallback(async () => {
    try {
      setCoffre(await lireEtatCoffre(config, connection));
      setPanne(null);
    } catch (e) {
      setPanne(panneLisible(e));
      return;
    }
    setPosition(
      publicKey ? await lirePosition(config, connection, publicKey) : null,
    );
  }, [config, connection, publicKey]);

  useEffect(() => {
    rafraichir().catch(() => {});
  }, [rafraichir]);

  /**
   * Envoi par le portefeuille. La composition vient de la bibliotheque
   * partagee ; ici on ne fait que signer et attendre.
   *
   * L'attente passe par `confirmer` et NON par `connection.confirmTransaction` :
   * ce dernier s'abonne par WebSocket, et notre point d'acces refuse les
   * abonnements. Voir le commentaire de `confirmer` dans `lib/vault.ts`.
   */
  const envoyer: Envoyer = useCallback(
    async (instructions: TransactionInstruction[]) => {
      const empreinte = await connection.getLatestBlockhash("confirmed");
      const tx = new Transaction({
        blockhash: empreinte.blockhash,
        lastValidBlockHeight: empreinte.lastValidBlockHeight,
        feePayer: publicKey!,
      }).add(...instructions);
      const sig = await sendTransaction(tx, connection);
      await confirmer(connection, sig, empreinte);
      return sig;
    },
    [connection, publicKey, sendTransaction],
  );

  function changerOnglet(geste: Geste) {
    setOnglet(geste);
    // Le resultat du geste precedent ne dit rien de celui-ci.
    setSignature(null);
    setRefus(null);
  }

  async function jouer(action: () => Promise<string>) {
    setEnCours(true);
    setSignature(null);
    setRefus(null);
    try {
      setSignature(await action());
    } catch (e) {
      setRefus(motifDuRefus(config, e));
    } finally {
      setEnCours(false);
      await rafraichir().catch(() => {});
    }
  }

  if (panne || !coffre) {
    return (
      <div className="shell">
        <Entete />
        <div className="card">
          <div className="title">
            {panne ? "Lecture impossible" : "Lecture du coffre"}
          </div>
          {panne && (
            <>
              <div className="status error">{panne}</div>
              {/* Sans ce bouton, une limite de debit passagere fige la page
                  jusqu'a ce que le visiteur pense a la recharger. */}
              <button onClick={() => void rafraichir()}>Reessayer</button>
            </>
          )}
        </div>
      </div>
    );
  }

  const dec = coffre.decimalesActif;
  const decParts = coffre.decimalesParts;

  function lancer() {
    if (!publicKey) return;
    if (onglet === "depot") {
      jouer(() =>
        deposer(config, connection, publicKey, enUnites(montantDepot, dec), envoyer),
      );
    } else if (onglet === "retrait") {
      jouer(() =>
        retirer(
          config, connection, publicKey, enUnites(montantRetrait, decParts), envoyer,
        ),
      );
    } else {
      jouer(() =>
        transferer(
          config,
          connection,
          publicKey,
          new PublicKey(destinataire.trim()),
          enUnites(montantTransfert, decParts),
          envoyer,
        ),
      );
    }
  }

  return (
    <div className="shell">
      <Entete />

      <div className="card">
        <div className="title">YieldVault</div>
        <div className="subtitle">
          Un depot emet des parts au prorata. Les parts sont un jeton Token-2022
          dont chaque transfert entre porteurs passe par une liste
          d&apos;autorisation, appliquee par un second programme.
        </div>

        <Ligne
          label="Actif au coffre"
          valeur={`${formater(coffre.actifDuCoffre, dec)} USDC`}
        />
        <Ligne
          label="Parts en circulation"
          valeur={formater(coffre.offreDeParts, decParts)}
        />
        {coffre.suspendu && (
          <Ligne label="Depots et retraits" valeur="suspendus" />
        )}

        {!publicKey ? (
          <>
            <div className="note">
              Devnet. Il vous faut un peu de SOL pour les frais et de l&apos;USDC
              de test pour deposer : les deux robinets sont en bas de page.
            </div>
            <BaseWalletMultiButton labels={LIBELLES} />
          </>
        ) : (
          <>
            {/* Il porte l'adresse et ouvre le menu qui permet d'en changer ou
                de se deconnecter : une ligne "Portefeuille" ferait double
                emploi. Discret, pour ne pas concurrencer le bouton d'action. */}
            <div className="portefeuille">
              <BaseWalletMultiButton labels={LIBELLES} />
            </div>
            <Ligne
              label="Vos parts"
              valeur={position ? formater(position.parts, decParts) : "..."}
            />
            <Ligne
              label="Votre USDC"
              valeur={position ? `${formater(position.actif, dec)} USDC` : "..."}
            />
            <Ligne
              label="Peut RECEVOIR des parts"
              valeur={position?.autorise ? "oui" : "non"}
            />

            <div className="onglets">
              {ONGLETS.map(({ geste, nom }) => (
                <button
                  key={geste}
                  className={geste === onglet ? "onglet actif" : "onglet"}
                  onClick={() => changerOnglet(geste)}
                  disabled={enCours}
                >
                  {nom}
                </button>
              ))}
            </div>

            {onglet === "depot" && (
              <>
                <div className="legende">
                  Vos USDC entrent au coffre, des parts vous sont emises. Une
                  frappe n&apos;est pas un transfert : la liste ne la voit pas.
                </div>
                <Montant
                  valeur={montantDepot}
                  onChange={setMontantDepot}
                  suffixe="USDC"
                  actif={!enCours}
                />
              </>
            )}

            {onglet === "retrait" && (
              <>
                <div className="legende">
                  Vos parts sont detruites, l&apos;actif vous revient au
                  prorata. Une destruction n&apos;est pas un transfert non plus.
                </div>
                <Montant
                  valeur={montantRetrait}
                  onChange={setMontantRetrait}
                  suffixe="parts"
                  actif={!enCours}
                />
              </>
            )}

            {onglet === "transfert" && (
              <>
                <div className="legende">
                  La seule surface ou le controle se voit. Vers un porteur
                  autorise le transfert aboutit ; vers un autre il est refuse
                  par le programme, et son motif s&apos;affiche ci-dessous.
                </div>
                <label className="field">Destinataire</label>
                <div className="prereglages">
                  <button
                    className="lien"
                    onClick={() =>
                      setDestinataire(config.porteurAutorise.toBase58())
                    }
                    disabled={enCours}
                  >
                    porteur autorise
                  </button>
                  <button
                    className="lien"
                    onClick={() =>
                      setDestinataire(config.porteurNonAutorise.toBase58())
                    }
                    disabled={enCours}
                  >
                    porteur non autorise
                  </button>
                </div>
                <div className="input-wrap">
                  <input
                    type="text"
                    className="adresse"
                    value={destinataire}
                    onChange={(e) => setDestinataire(e.target.value)}
                    disabled={enCours}
                    spellCheck={false}
                  />
                </div>
                <label className="field">Montant</label>
                <Montant
                  valeur={montantTransfert}
                  onChange={setMontantTransfert}
                  suffixe="parts"
                  actif={!enCours}
                />
              </>
            )}

            <button onClick={lancer} disabled={enCours}>
              {enCours
                ? "Signature en cours..."
                : ONGLETS.find((o) => o.geste === onglet)!.nom}
            </button>
          </>
        )}

        {signature && (
          <div className="status success">
            Confirme sur devnet.{" "}
            <a
              href={lienTransaction(signature)}
              target="_blank"
              rel="noreferrer"
            >
              Voir la transaction &rarr;
            </a>
          </div>
        )}
        {refus && <div className="status error">{refus}</div>}
      </div>

      <Pied />
    </div>
  );
}

function Entete() {
  return (
    <div className="brand">
      <div className="logo">
        For<span>Yield</span> &times; Solana
      </div>
      <div className="badge">devnet</div>
    </div>
  );
}

function Ligne({ label, valeur }: { label: string; valeur: string }) {
  return (
    <div className="row">
      <span className="label">{label}</span>
      <span className="value">{valeur}</span>
    </div>
  );
}

function Montant({
  valeur,
  onChange,
  suffixe,
  actif,
}: {
  valeur: string;
  onChange: (v: string) => void;
  suffixe: string;
  actif: boolean;
}) {
  return (
    <div className="input-wrap">
      <input
        type="text"
        inputMode="decimal"
        value={valeur}
        onChange={(e) => onChange(e.target.value)}
        disabled={!actif}
      />
      <span className="suffix">{suffixe}</span>
    </div>
  );
}

function Pied() {
  return (
    <div className="footer">
      <div>
        Demonstration sur <strong>devnet</strong>. Les jetons n&apos;ont aucune
        valeur.
      </div>
      <div className="robinets">
        <a href="https://faucet.solana.com" target="_blank" rel="noreferrer">
          SOL de test
        </a>
        <a href="https://faucet.circle.com" target="_blank" rel="noreferrer">
          USDC de test
        </a>
        <a
          href="https://github.com/Foryield/solana-yield-vault"
          target="_blank"
          rel="noreferrer"
        >
          Code source
        </a>
      </div>
      <div className="note">
        Le robinet USDC plafonne a deux demandes par tranche de huit heures.
      </div>
    </div>
  );
}
