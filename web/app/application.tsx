"use client";

import { useCallback, useEffect, useState } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import {
  PublicKey,
  Transaction,
  type TransactionInstruction,
} from "@solana/web3.js";
import { Providers } from "./providers";
import { lienTransaction, type Config } from "@/lib/config";
import {
  deposer,
  enUnites,
  formater,
  lireEtatCoffre,
  lirePosition,
  motifDuRefus,
  retirer,
  transferer,
  type EtatCoffre,
  type Envoyer,
  type Position,
} from "@/lib/vault";

type Geste = "depot" | "retrait" | "transfert";

function court(cle: PublicKey | string): string {
  const s = typeof cle === "string" ? cle : cle.toBase58();
  return `${s.slice(0, 4)}...${s.slice(-4)}`;
}

export default function Application() {
  return <Providers enfants={(config) => <Demonstration config={config} />} />;
}

function Demonstration({ config }: { config: Config }) {
  const { connection } = useConnection();
  const { publicKey, sendTransaction } = useWallet();

  const [coffre, setCoffre] = useState<EtatCoffre | null>(null);
  const [position, setPosition] = useState<Position | null>(null);
  const [panne, setPanne] = useState<string | null>(null);

  const [montantDepot, setMontantDepot] = useState("1");
  const [montantRetrait, setMontantRetrait] = useState("0.5");
  const [montantTransfert, setMontantTransfert] = useState("0.1");
  const [destinataire, setDestinataire] = useState(
    config.porteurAutorise.toBase58(),
  );

  const [enCours, setEnCours] = useState<Geste | null>(null);
  const [signature, setSignature] = useState<string | null>(null);
  const [refus, setRefus] = useState<string | null>(null);

  const rafraichir = useCallback(async () => {
    try {
      setCoffre(await lireEtatCoffre(config, connection));
      setPanne(null);
    } catch (e) {
      setPanne(e instanceof Error ? e.message : String(e));
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
   * Envoi d'une transaction par le portefeuille. La composition vient de la
   * bibliotheque partagee ; ici on ne fait que signer et attendre.
   */
  const envoyer: Envoyer = useCallback(
    async (instructions: TransactionInstruction[]) => {
      const { blockhash, lastValidBlockHeight } =
        await connection.getLatestBlockhash("confirmed");
      const tx = new Transaction({
        blockhash,
        lastValidBlockHeight,
        feePayer: publicKey!,
      }).add(...instructions);
      const sig = await sendTransaction(tx, connection);
      await connection.confirmTransaction(
        { signature: sig, blockhash, lastValidBlockHeight },
        "confirmed",
      );
      return sig;
    },
    [connection, publicKey, sendTransaction],
  );

  async function jouer(geste: Geste, action: () => Promise<string>) {
    setEnCours(geste);
    setSignature(null);
    setRefus(null);
    try {
      setSignature(await action());
    } catch (e) {
      setRefus(motifDuRefus(config, e));
    } finally {
      setEnCours(null);
      await rafraichir().catch(() => {});
    }
  }

  if (panne) {
    return (
      <div className="shell">
        <Entete />
        <div className="card">
          <div className="title">Le coffre est illisible</div>
          <div className="status error">{panne}</div>
        </div>
      </div>
    );
  }

  if (!coffre) {
    return (
      <div className="shell">
        <Entete />
        <div className="card">
          <div className="title">Lecture du coffre</div>
        </div>
      </div>
    );
  }

  const dec = coffre.decimalesActif;
  const decParts = coffre.decimalesParts;

  return (
    <div className="shell">
      <Entete />

      <div className="card">
        <div className="title">Le coffre</div>
        <div className="subtitle">
          Un depot emet des parts au prorata. Les parts sont un jeton Token-2022
          dont chaque transfert entre porteurs est soumis a une liste
          d&apos;autorisation, appliquee par un second programme.
        </div>
        <Ligne label="Actif detenu" valeur={`${formater(coffre.actifDuCoffre, dec)} USDC`} />
        <Ligne label="Parts en circulation" valeur={formater(coffre.offreDeParts, decParts)} />
        <Ligne label="Depots et retraits" valeur={coffre.suspendu ? "suspendus" : "ouverts"} />
        <Ligne label="Mint des parts" valeur={court(coffre.sharesMint)} mono />
      </div>

      {!publicKey ? (
        <div className="card">
          <div className="title">Connectez un portefeuille</div>
          <div className="subtitle">
            Devnet. Il vous faut un peu de SOL pour les frais et de l&apos;USDC
            de test pour deposer : les deux robinets sont en bas de page.
          </div>
          <WalletMultiButton />
        </div>
      ) : (
        <>
          <div className="card">
            <div className="title">Votre position</div>
            <Ligne label="Portefeuille" valeur={court(publicKey)} mono />
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
            <div className="note">
              L&apos;eligibilite ne porte que sur la RECEPTION. Deposer et
              retirer restent ouverts a tous : une frappe et une destruction ne
              sont pas des transferts, donc la liste ne les voit jamais.
            </div>
          </div>

          <Action
            titre="Deposer"
            legende="Vos USDC entrent au coffre, des parts vous sont emises."
            valeur={montantDepot}
            onChange={setMontantDepot}
            suffixe="USDC"
            actif={enCours === null}
            enCours={enCours === "depot"}
            onClick={() =>
              jouer("depot", () =>
                deposer(config, connection, publicKey, enUnites(montantDepot, dec), envoyer),
              )
            }
          />

          <Action
            titre="Retirer"
            legende="Vos parts sont detruites, l'actif vous revient au prorata."
            valeur={montantRetrait}
            onChange={setMontantRetrait}
            suffixe="parts"
            actif={enCours === null}
            enCours={enCours === "retrait"}
            onClick={() =>
              jouer("retrait", () =>
                retirer(config, connection, publicKey, enUnites(montantRetrait, decParts), envoyer),
              )
            }
          />

          <div className="card">
            <div className="title">Transferer des parts</div>
            <div className="subtitle">
              La seule surface ou le controle se voit. Vers un porteur autorise
              le transfert aboutit ; vers un autre il est refuse par le
              programme, et son motif s&apos;affiche ici.
            </div>

            <label className="field">Destinataire</label>
            <div className="prereglages">
              <button
                className="lien"
                onClick={() => setDestinataire(config.porteurAutorise.toBase58())}
              >
                porteur autorise
              </button>
              <button
                className="lien"
                onClick={() => setDestinataire(config.porteurNonAutorise.toBase58())}
              >
                porteur non autorise
              </button>
            </div>
            <div className="input-wrap">
              <input
                type="text"
                value={destinataire}
                onChange={(e) => setDestinataire(e.target.value)}
                disabled={enCours !== null}
                spellCheck={false}
              />
            </div>

            <label className="field">Montant</label>
            <div className="input-wrap">
              <input
                type="text"
                inputMode="decimal"
                value={montantTransfert}
                onChange={(e) => setMontantTransfert(e.target.value)}
                disabled={enCours !== null}
              />
              <span className="suffix">parts</span>
            </div>

            <button
              onClick={() =>
                jouer("transfert", () =>
                  transferer(
                    config,
                    connection,
                    publicKey,
                    new PublicKey(destinataire.trim()),
                    enUnites(montantTransfert, decParts),
                    envoyer,
                  ),
                )
              }
              disabled={enCours !== null}
            >
              {enCours === "transfert" ? "Signature en cours..." : "Transferer"}
            </button>
          </div>
        </>
      )}

      {signature && (
        <div className="status success">
          Confirme sur devnet.{" "}
          <a href={lienTransaction(signature)} target="_blank" rel="noreferrer">
            Voir la transaction &rarr;
          </a>
        </div>
      )}
      {refus && <div className="status error">{refus}</div>}

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

function Ligne({
  label,
  valeur,
  mono,
}: {
  label: string;
  valeur: string;
  mono?: boolean;
}) {
  return (
    <div className="row">
      <span className="label">{label}</span>
      <span className={mono ? "value mono" : "value"}>{valeur}</span>
    </div>
  );
}

function Action({
  titre,
  legende,
  valeur,
  onChange,
  suffixe,
  actif,
  enCours,
  onClick,
}: {
  titre: string;
  legende: string;
  valeur: string;
  onChange: (v: string) => void;
  suffixe: string;
  actif: boolean;
  enCours: boolean;
  onClick: () => void;
}) {
  return (
    <div className="card">
      <div className="title">{titre}</div>
      <div className="subtitle">{legende}</div>
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
      <button onClick={onClick} disabled={!actif}>
        {enCours ? "Signature en cours..." : titre}
      </button>
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
      </div>
      <div className="note">
        Le robinet USDC plafonne a deux demandes par tranche de huit heures.
      </div>
      <div>
        <a
          href="https://github.com/Foryield/solana-yield-vault"
          target="_blank"
          rel="noreferrer"
        >
          Code source
        </a>
      </div>
    </div>
  );
}
