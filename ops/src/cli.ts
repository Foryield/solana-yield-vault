import { readFileSync } from "node:fs";
import { AnchorProvider, Wallet } from "@coral-xyz/anchor";
import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import {
  TOKEN_2022_PROGRAM_ID,
  createAssociatedTokenAccountIdempotentInstruction,
  createTransferCheckedInstruction,
  getAccount,
  getAssociatedTokenAddressSync,
  getMint,
} from "@solana/spl-token";
import {
  hookProgram,
  vaultProgram,
  allocatorProgram,
  instructionAttacher,
  instructionAutoriser,
  instructionRevoquer,
  instructionInitialize,
  instructionDeposit,
  instructionWithdraw,
  instructionTransfert,
  instructionDeposerJupiterLend,
  instructionRetirerJupiterLend,
  instructionRacheterTout,
  instructionInitialiserAllocateur,
  instructionOuvrirPosition,
  instructionReglerPlafond,
  instructionSuspendre,
  lirePosition,
  adressesDuCoffre,
  adressesDuHook,
  adressesDeLAllocateur,
  adresseEntree,
  lireCoffre,
  estAutorise,
  PROGRAMMES_JUPITER_LEND_DEVNET,
  type AllocatorContext,
} from "@foryield/solana-yield-vault-client";
import {
  chargerConfig,
  ConfigError,
  exigeAllocateur,
  type Config,
} from "./config.js";

/**
 * Administration du coffre et du module de conformite.
 *
 * Ce programme SIGNE avec une cle locale : il n'a rien a faire dans un
 * navigateur, et reciproquement la demonstration web n'a pas a connaitre ces
 * gestes. C'est la seule raison pour laquelle deux surfaces existent ; elles
 * partagent la meme bibliotheque de composition.
 *
 * Chaque commande imprime une ligne JSON sur la sortie standard et ses erreurs
 * sur la sortie d'erreur, pour etre appelable depuis n'importe quel dorsal.
 */

function chargerCle(chemin: string): Keypair {
  const brut = JSON.parse(readFileSync(chemin.replace(/^~/, process.env["HOME"] ?? "~"), "utf8"));
  return Keypair.fromSecretKey(Uint8Array.from(brut));
}

function contexte(config: Config) {
  const connection = new Connection(config.rpcUrl, "confirmed");
  const cle = chargerCle(config.keypairPath);
  const provider = new AnchorProvider(connection, new Wallet(cle), {
    commitment: "confirmed",
  });
  return { connection, cle, provider };
}

async function envoyer(
  connection: Connection,
  cle: Keypair,
  instructions: Awaited<ReturnType<typeof instructionAttacher>>[],
): Promise<string> {
  const tx = new Transaction().add(...instructions);
  return sendAndConfirmTransaction(connection, tx, [cle], {
    commitment: "confirmed",
  });
}

const commandes: Record<
  string,
  (config: Config, args: string[]) => Promise<unknown>
> = {
  /** Attache le hook a un mint : configuration + liste de comptes supplementaires. */
  async attacher(config, [mintStr]) {
    if (!mintStr) throw new Error("usage : attacher <mint>");
    const { connection, cle, provider } = contexte(config);
    const mint = new PublicKey(mintStr);
    const ctx = { program: hookProgram(config.hookProgramId, provider), mint };
    const ix = await instructionAttacher(ctx, cle.publicKey, cle.publicKey);
    const signature = await envoyer(connection, cle, [ix]);
    return { mint: mintStr, ...adressesToBase58(adressesDuHook(ctx)), signature };
  },

  /** Autorise un porteur a RECEVOIR des parts. */
  async autoriser(config, [mintStr, porteurStr]) {
    if (!mintStr || !porteurStr) throw new Error("usage : autoriser <mint> <porteur>");
    const { connection, cle, provider } = contexte(config);
    const mint = new PublicKey(mintStr);
    const porteur = new PublicKey(porteurStr);
    const ctx = { program: hookProgram(config.hookProgramId, provider), mint };
    const ix = await instructionAutoriser(ctx, cle.publicKey, cle.publicKey, porteur);
    const signature = await envoyer(connection, cle, [ix]);
    return {
      mint: mintStr,
      porteur: porteurStr,
      entree: adresseEntree(ctx, porteur).toBase58(),
      signature,
    };
  },

  /** Retire l'autorisation. Le compte est ferme, son depot revient a l'autorite. */
  async revoquer(config, [mintStr, porteurStr]) {
    if (!mintStr || !porteurStr) throw new Error("usage : revoquer <mint> <porteur>");
    const { connection, cle, provider } = contexte(config);
    const mint = new PublicKey(mintStr);
    const porteur = new PublicKey(porteurStr);
    const ctx = { program: hookProgram(config.hookProgramId, provider), mint };
    const ix = await instructionRevoquer(ctx, cle.publicKey, porteur);
    const signature = await envoyer(connection, cle, [ix]);
    return { mint: mintStr, porteur: porteurStr, signature };
  },

  /**
   * Cree un coffre sur un actif. Le programme de jeton de l'actif est LU
   * on-chain plutot que suppose : USDC et EURC devnet sont du SPL classique,
   * mais rien ne l'impose a un autre actif.
   */
  async initialiser(config, [mintStr]) {
    if (!mintStr) throw new Error("usage : initialiser <mint-de-l-actif>");
    const { connection, cle, provider } = contexte(config);
    const depositMint = new PublicKey(mintStr);
    const compte = await connection.getAccountInfo(depositMint);
    if (!compte) throw new Error(`mint introuvable sur ce reseau : ${mintStr}`);

    const ctx = {
      program: vaultProgram(config.vaultProgramId, provider),
      depositMint,
      depositTokenProgram: compte.owner,
    };
    const ix = await instructionInitialize(ctx, cle.publicKey, config.hookProgramId);
    const signature = await envoyer(connection, cle, [ix]);
    return {
      depositMint: mintStr,
      depositTokenProgram: compte.owner.toBase58(),
      ...adressesToBase58(adressesDuCoffre(ctx)),
      signature,
    };
  },

  /**
   * Depose sur un coffre. GESTE DE PORTEUR, pas d'administration : il figure
   * ici parce que c'est notre seul client pour l'instant, et parce que la
   * preuve devnet en a besoin. La demonstration web le fera avec un
   * portefeuille, sur la meme bibliotheque de composition.
   *
   * Le compte de parts du deposant est cree si besoin, en compte associe : le
   * programme dedie calcule sa taille depuis les extensions IMPOSEES par le
   * mint, ce qui evite de la calculer nous-memes et de se tromper.
   */
  async deposer(config, [mintStr, montantStr]) {
    if (!mintStr || !montantStr) throw new Error("usage : deposer <mint-actif> <montant>");
    const { connection, cle, provider } = contexte(config);
    const depositMint = new PublicKey(mintStr);
    const compteMint = await connection.getAccountInfo(depositMint);
    if (!compteMint) throw new Error(`mint introuvable : ${mintStr}`);

    const ctx = {
      program: vaultProgram(config.vaultProgramId, provider),
      depositMint,
      depositTokenProgram: compteMint.owner,
    };
    const a = adressesDuCoffre(ctx);
    const actifs = getAssociatedTokenAddressSync(
      depositMint, cle.publicKey, false, compteMint.owner,
    );
    const parts = getAssociatedTokenAddressSync(
      a.sharesMint, cle.publicKey, false, TOKEN_2022_PROGRAM_ID,
    );
    const creerParts = createAssociatedTokenAccountIdempotentInstruction(
      cle.publicKey, parts, cle.publicKey, a.sharesMint, TOKEN_2022_PROGRAM_ID,
    );
    const ix = await instructionDeposit(
      ctx, cle.publicKey, actifs, parts, BigInt(montantStr),
    );
    const signature = await envoyer(connection, cle, [creerParts, ix]);
    return {
      depositMint: mintStr,
      montant: montantStr,
      comptesDuPorteur: { actifs: actifs.toBase58(), parts: parts.toBase58() },
      soldes: await soldes(connection, ctx, parts, actifs, compteMint.owner),
      signature,
    };
  },

  /** Retire. Geste de porteur egalement, meme reserve que le depot. */
  async retirer(config, [mintStr, partsStr]) {
    if (!mintStr || !partsStr) throw new Error("usage : retirer <mint-actif> <parts>");
    const { connection, cle, provider } = contexte(config);
    const depositMint = new PublicKey(mintStr);
    const compteMint = await connection.getAccountInfo(depositMint);
    if (!compteMint) throw new Error(`mint introuvable : ${mintStr}`);

    const ctx = {
      program: vaultProgram(config.vaultProgramId, provider),
      depositMint,
      depositTokenProgram: compteMint.owner,
    };
    const a = adressesDuCoffre(ctx);
    const actifs = getAssociatedTokenAddressSync(
      depositMint, cle.publicKey, false, compteMint.owner,
    );
    const parts = getAssociatedTokenAddressSync(
      a.sharesMint, cle.publicKey, false, TOKEN_2022_PROGRAM_ID,
    );
    const ix = await instructionWithdraw(
      ctx, cle.publicKey, actifs, parts, BigInt(partsStr),
    );
    const signature = await envoyer(connection, cle, [ix]);
    return {
      depositMint: mintStr,
      partsDetruites: partsStr,
      soldes: await soldes(connection, ctx, parts, actifs, compteMint.owner),
      signature,
    };
  },

  /**
   * Transfere des parts a un autre porteur. GESTE DE PORTEUR, meme reserve que
   * le depot et le retrait.
   *
   * C'est la SEULE surface ou le controle d'eligibilite se voit : une frappe et
   * une destruction ne sont pas des transferts, donc ni le depot ni le retrait
   * n'invoquent le hook.
   *
   * Le compte de parts du destinataire est cree dans une transaction SEPAREE.
   * Le grouper avec le transfert ferait disparaitre le compte avec le refus, et
   * on ne pourrait plus montrer qu'un destinataire non autorise a bien un
   * compte, reste a zero.
   */
  async transferer(config, [mintStr, destinataireStr, partsStr]) {
    if (!mintStr || !destinataireStr || !partsStr) {
      throw new Error("usage : transferer <mint-actif> <destinataire> <parts>");
    }
    const { connection, cle, provider } = contexte(config);
    const depositMint = new PublicKey(mintStr);
    const compteMint = await connection.getAccountInfo(depositMint);
    if (!compteMint) throw new Error(`mint introuvable : ${mintStr}`);
    const destinataire = new PublicKey(destinataireStr);

    const ctx = {
      program: vaultProgram(config.vaultProgramId, provider),
      depositMint,
      depositTokenProgram: compteMint.owner,
    };
    const a = adressesDuCoffre(ctx);

    // Les decimales sont LUES sur le mint des parts. La composition les exige
    // en argument pour rester hors ligne ; les supposer egales a celles de
    // l'actif serait une coincidence, pas une regle.
    const { decimals } = await getMint(
      connection, a.sharesMint, "confirmed", TOKEN_2022_PROGRAM_ID,
    );

    const source = getAssociatedTokenAddressSync(
      a.sharesMint, cle.publicKey, false, TOKEN_2022_PROGRAM_ID,
    );
    const destination = getAssociatedTokenAddressSync(
      a.sharesMint, destinataire, false, TOKEN_2022_PROGRAM_ID,
    );

    let creation: string | null = null;
    if ((await connection.getAccountInfo(destination)) === null) {
      creation = await envoyer(connection, cle, [
        createAssociatedTokenAccountIdempotentInstruction(
          cle.publicKey, destination, destinataire, a.sharesMint, TOKEN_2022_PROGRAM_ID,
        ),
      ]);
      // Annoncee des qu'elle est acquise : si le transfert est ensuite refuse,
      // la ligne JSON ne sera jamais imprimee et un compte aura pourtant ete
      // cree et paye. Un effet non trace est un effet perdu.
      console.error(`compte de parts du destinataire cree : ${creation}`);
    }

    const hookCtx = {
      program: hookProgram(config.hookProgramId, provider),
      mint: a.sharesMint,
    };
    const ix = instructionTransfert(
      hookCtx, source, destination, cle.publicKey, destinataire,
      BigInt(partsStr), decimals,
    );
    const signature = await envoyer(connection, cle, [ix]);
    return {
      sharesMint: a.sharesMint.toBase58(),
      destinataire: destinataireStr,
      parts: partsStr,
      comptes: { source: source.toBase58(), destination: destination.toBase58() },
      creationDuCompte: creation,
      soldes: {
        source: await lireSolde(connection, source, TOKEN_2022_PROGRAM_ID),
        destination: await lireSolde(connection, destination, TOKEN_2022_PROGRAM_ID),
      },
      signature,
    };
  },

  /**
   * Inspecte la venue pour un actif : toutes les adresses, et lesquelles
   * EXISTENT deja sur la chaine.
   *
   * NE SIGNE RIEN. C'est la commande a passer avant de depenser quoi que ce
   * soit : sur vingt et un comptes dont dix-huit appartiennent a un tiers, un
   * compte absent produit un echec qui ne nomme rien. Le voir avant vaut mieux
   * que le deduire apres.
   */
  async venue(config, [mintStr]) {
    if (!mintStr) throw new Error("usage : venue <mint-de-l-actif>");
    const { connection, provider } = contexte(config);
    const ctx = await contexteAllocateur(config, connection, provider, mintStr);
    const a = adressesDeLAllocateur(ctx);

    // L'AUTORITE DE POSITION EST ABSENTE DE CETTE LISTE, et ce n'est pas un
    // oubli : a l'etape 1 elle ne porte aucune donnee, donc elle n'existe pas
    // en tant que compte et n'existera jamais tant que rien ne l'y oblige. La
    // faire figurer parmi les comptes a controler enverrait un operateur creer
    // ce qui n'a pas a l'etre. Son adresse est rendue a part.
    const aInspecter: Record<string, PublicKey> = {
      marche: a.venue.marche,
      jetonDeRecu: a.venue.jetonDeRecu,
      administration: a.venue.administration,
      reserves: a.venue.reserves,
      positionDeLiquidite: a.venue.positionDeLiquidite,
      modeleDeTaux: a.venue.modeleDeTaux,
      liquidite: a.venue.liquidite,
      modeleDeRecompenses: a.venue.modeleDeRecompenses,
      compteDeReclamation: a.venue.compteDeReclamation,
      coffreDeLaVenue: a.venue.coffreDeLaVenue,
      actifDeLaPosition: a.actifDeLaPosition,
      recuDeLaPosition: a.recuDeLaPosition,
    };

    const comptes: Record<string, { adresse: string; existe: boolean }> = {};
    const infos = await connection.getMultipleAccountsInfo(
      Object.values(aInspecter),
      "confirmed",
    );
    Object.keys(aInspecter).forEach((nom, i) => {
      comptes[nom] = {
        adresse: aInspecter[nom]!.toBase58(),
        existe: infos[i] !== null,
      };
    });

    return {
      actif: mintStr,
      coffre: ctx.coffre.toBase58(),
      /** Signataire des invocations croisees, et porteur de l'etat depuis l'etape 2. */
      adresseDeLaPosition: a.position.toBase58(),
      ...(await etatDeLaPosition(ctx)),
      configuration: a.configuration.toBase58(),
      programmes: {
        pret: ctx.programmes.pret.toBase58(),
        liquidite: ctx.programmes.liquidite.toBase58(),
        recompenses: ctx.programmes.recompenses.toBase58(),
      },
      comptes,
      // Ce qui manque, dit en clair plutot qu'a deduire de la liste ci-dessus.
      manquants: Object.entries(comptes)
        .filter(([, v]) => !v.existe)
        .map(([k]) => k),
      soldes: {
        actifDeLaPosition: await lireSolde(
          connection, a.actifDeLaPosition, ctx.programmeDeJeton,
        ),
        recuDeLaPosition: await lireSolde(
          connection, a.recuDeLaPosition, ctx.programmeDeJeton,
        ),
      },
    };
  },

  /**
   * Fige l'administrateur de l'allocateur. UN SEUL APPEL POSSIBLE : le compte
   * de configuration est cree par cette instruction, donc une seconde tentative
   * echoue parce qu'il existe deja. C'est ce qui empeche un tiers de
   * s'attribuer l'administration apres coup.
   */
  async configurer(config, []) {
    const { connection, cle, provider } = contexte(config);
    const programme = allocatorProgram(exigeAllocateur(config), provider);
    const ix = await instructionInitialiserAllocateur(programme, cle.publicKey);
    const signature = await envoyer(connection, cle, [ix]);
    return { admin: cle.publicKey.toBase58(), signature };
  },

  /** Ouvre une position sur un actif, avec son plafond de valorisation. */
  async ouvrir(config, [mintStr, plafondStr]) {
    if (!mintStr || !plafondStr) throw new Error("usage : ouvrir <mint-actif> <plafond>");
    const { connection, cle, provider } = contexte(config);
    const ctx = await contexteAllocateur(config, connection, provider, mintStr);
    const ix = await instructionOuvrirPosition(ctx, cle.publicKey, BigInt(plafondStr));
    const signature = await envoyer(connection, cle, [ix]);
    return { actif: mintStr, plafond: plafondStr, ...(await etatDeLaPosition(ctx)), signature };
  },

  /**
   * Regle le plafond. L'ABAISSER SOUS LA VALORISATION COURANTE EST ADMIS : c'est
   * le geste qu'on veut pouvoir faire en premier quand une venue inquiete, et il
   * bloque tout nouveau depot sans rien forcer a sortir.
   */
  async plafonner(config, [mintStr, plafondStr]) {
    if (!mintStr || !plafondStr) throw new Error("usage : plafonner <mint-actif> <plafond>");
    const { connection, cle, provider } = contexte(config);
    const ctx = await contexteAllocateur(config, connection, provider, mintStr);
    const ix = await instructionReglerPlafond(ctx, cle.publicKey, BigInt(plafondStr));
    const signature = await envoyer(connection, cle, [ix]);
    return { actif: mintStr, ...(await etatDeLaPosition(ctx)), signature };
  },

  /** Suspend ou reprend la position. Ne bloque que les depots, jamais les sorties. */
  async geler(config, [mintStr, etatStr]) {
    if (!mintStr || (etatStr !== "oui" && etatStr !== "non")) {
      throw new Error("usage : geler <mint-actif> <oui|non>");
    }
    const { connection, cle, provider } = contexte(config);
    const ctx = await contexteAllocateur(config, connection, provider, mintStr);
    const ix = await instructionSuspendre(ctx, cle.publicKey, etatStr === "oui");
    const signature = await envoyer(connection, cle, [ix]);
    return { actif: mintStr, ...(await etatDeLaPosition(ctx)), signature };
  },

  /**
   * CHEMIN D'URGENCE : sort l'integralite de la position de la venue.
   *
   * Aucun montant n'est demande, seulement le minimum a recevoir : sortir ne
   * doit pas exiger de valoriser d'abord. Poser zero signifie « sortir a tout
   * prix », ce qui est une decision d'operateur assumee et non un defaut.
   */
  async evacuer(config, [mintStr, minimumStr]) {
    if (!mintStr || !minimumStr) {
      throw new Error("usage : evacuer <mint-actif> <actif-minimal>");
    }
    const { connection, cle, provider } = contexte(config);
    const ctx = await contexteAllocateur(config, connection, provider, mintStr);
    const ix = await instructionRacheterTout(ctx, cle.publicKey, BigInt(minimumStr));
    const signature = await envoyer(connection, cle, [ix]);
    return {
      actif: mintStr,
      actifMinimal: minimumStr,
      ...(await soldesDeLaPosition(connection, ctx)),
      signature,
    };
  },

  /**
   * Cree les deux comptes de jeton de la position, en compte associe idempotent.
   *
   * PREALABLE AU PREMIER DEPOT, et il ne se cree pas tout seul : la venue verse
   * sur un compte qui doit exister. Idempotent, donc rejouable sans dommage.
   */
  async preparer(config, [mintStr]) {
    if (!mintStr) throw new Error("usage : preparer <mint-de-l-actif>");
    const { connection, cle, provider } = contexte(config);
    const ctx = await contexteAllocateur(config, connection, provider, mintStr);
    const a = adressesDeLAllocateur(ctx);

    const creations = [
      createAssociatedTokenAccountIdempotentInstruction(
        cle.publicKey, a.actifDeLaPosition, a.position, ctx.actif, ctx.programmeDeJeton,
      ),
      createAssociatedTokenAccountIdempotentInstruction(
        cle.publicKey, a.recuDeLaPosition, a.position, a.venue.jetonDeRecu,
        ctx.programmeDeJeton,
      ),
    ];
    const signature = await envoyer(connection, cle, creations);
    return {
      actif: mintStr,
      position: a.position.toBase58(),
      comptes: {
        actifDeLaPosition: a.actifDeLaPosition.toBase58(),
        recuDeLaPosition: a.recuDeLaPosition.toBase58(),
      },
      signature,
    };
  },

  /**
   * Verse de l'actif de l'operateur vers le compte de la position.
   *
   * L'ALLOCATEUR NE SE SERT PAS TOUT SEUL, et c'est deliberer a l'etape 1 : le
   * coffre detient son actif sur une adresse derivee dont l'allocateur ne sait
   * pas signer, et l'y raccorder est un chantier a part. En attendant, la
   * position est dotee explicitement, ce qui rend la dotation visible plutot
   * que cachee dans un enchainement.
   */
  async approvisionner(config, [mintStr, montantStr]) {
    if (!mintStr || !montantStr) {
      throw new Error("usage : approvisionner <mint-actif> <montant>");
    }
    const { connection, cle, provider } = contexte(config);
    const ctx = await contexteAllocateur(config, connection, provider, mintStr);
    const a = adressesDeLAllocateur(ctx);
    const source = getAssociatedTokenAddressSync(
      ctx.actif, cle.publicKey, false, ctx.programmeDeJeton,
    );
    const ix = createTransferCheckedInstruction(
      source,
      ctx.actif,
      a.actifDeLaPosition,
      cle.publicKey,
      BigInt(montantStr),
      (await getMint(connection, ctx.actif, "confirmed", ctx.programmeDeJeton)).decimals,
      [],
      ctx.programmeDeJeton,
    );
    const signature = await envoyer(connection, cle, [ix]);
    return {
      actif: mintStr,
      montant: montantStr,
      source: source.toBase58(),
      ...(await soldesDeLaPosition(connection, ctx)),
      signature,
    };
  },

  /** Place l'actif de la position sur la venue. Le plancher est calcule on-chain. */
  async placer(config, [mintStr, montantStr]) {
    if (!mintStr || !montantStr) throw new Error("usage : placer <mint-actif> <montant>");
    const { connection, cle, provider } = contexte(config);
    const ctx = await contexteAllocateur(config, connection, provider, mintStr);
    const ix = await instructionDeposerJupiterLend(ctx, cle.publicKey, BigInt(montantStr));
    const signature = await envoyer(connection, cle, [ix]);
    return {
      actif: mintStr,
      montant: montantStr,
      ...(await soldesDeLaPosition(connection, ctx)),
      signature,
    };
  },

  /**
   * Rapatrie de l'actif depuis la venue.
   *
   * LE PLAFOND DE PARTS EST EXIGE, jamais deduit. La conversion inverse n'a pas
   * ete mesuree : la calculer ici reviendrait a inventer une borne, et une
   * borne trop serree fait echouer le retrait. L'operateur la pose depuis ce
   * qu'il observe, et le programme verifie de son cote que l'actif demande est
   * bien arrive.
   */
  async rapatrier(config, [mintStr, montantStr, partsMaxStr]) {
    if (!mintStr || !montantStr || !partsMaxStr) {
      throw new Error("usage : rapatrier <mint-actif> <montant> <parts-maximales>");
    }
    const { connection, cle, provider } = contexte(config);
    const ctx = await contexteAllocateur(config, connection, provider, mintStr);
    const ix = await instructionRetirerJupiterLend(
      ctx, cle.publicKey, BigInt(montantStr), BigInt(partsMaxStr),
    );
    const signature = await envoyer(connection, cle, [ix]);
    return {
      actif: mintStr,
      montant: montantStr,
      partsMaximales: partsMaxStr,
      ...(await soldesDeLaPosition(connection, ctx)),
      signature,
    };
  },

  /** Lit l'etat d'un coffre et, si un porteur est donne, son eligibilite. */
  async etat(config, [mintStr, porteurStr]) {
    if (!mintStr) throw new Error("usage : etat <mint-de-l-actif> [porteur]");
    const { connection, provider } = contexte(config);
    const depositMint = new PublicKey(mintStr);
    const compte = await connection.getAccountInfo(depositMint);
    if (!compte) throw new Error(`mint introuvable sur ce reseau : ${mintStr}`);

    const ctx = {
      program: vaultProgram(config.vaultProgramId, provider),
      depositMint,
      depositTokenProgram: compte.owner,
    };
    const etat = await lireCoffre(ctx);
    const sortie: Record<string, unknown> = {
      depositMint: mintStr,
      ...adressesToBase58(adressesDuCoffre(ctx)),
      initialise: etat !== null,
      ...(etat
        ? {
            admin: etat.admin.toBase58(),
            hookProgram: etat.hookProgram.toBase58(),
            suspendu: etat.paused,
          }
        : {}),
    };

    if (porteurStr && etat) {
      const hookCtx = {
        program: hookProgram(config.hookProgramId, provider),
        mint: etat.sharesMint,
      };
      sortie["porteur"] = porteurStr;
      sortie["autorise"] = await estAutorise(hookCtx, new PublicKey(porteurStr));
    }
    return sortie;
  },
};

/**
 * Contexte des commandes de venue.
 *
 * DEUX REFUS Y SONT CONCENTRES plutot que repetes dans chaque commande. Le
 * premier porte sur le cluster : les identifiants de la venue codes dans le
 * client sont ceux de DEVNET, et une adresse de programme est propre a son
 * reseau. Les employer sur le mainnet viserait des comptes qui n'y sont pas, ou
 * pire, qui y sont et appartiennent a quelqu'un d'autre. Le second porte sur le
 * programme de jeton de l'actif, LU sur la chaine et non suppose.
 */
async function contexteAllocateur(
  config: Config,
  connection: Connection,
  provider: ReturnType<typeof contexte>["provider"],
  mintStr: string,
): Promise<AllocatorContext> {
  if (config.estMainnet) {
    throw new Error(
      "les identifiants de la venue portes par le client sont ceux de DEVNET : " +
        "sur Solana une adresse de programme est propre a son reseau, et rien " +
        "ici ne connait ceux du mainnet.",
    );
  }
  const actif = new PublicKey(mintStr);
  const compteMint = await connection.getAccountInfo(actif);
  if (!compteMint) throw new Error(`mint introuvable sur ce reseau : ${mintStr}`);

  const coffre = adressesDuCoffre({
    program: vaultProgram(config.vaultProgramId, provider),
    depositMint: actif,
    depositTokenProgram: compteMint.owner,
  }).vault;

  return {
    program: allocatorProgram(exigeAllocateur(config), provider),
    programmes: PROGRAMMES_JUPITER_LEND_DEVNET,
    actif,
    programmeDeJeton: compteMint.owner,
    coffre,
  };
}

/** Etat de la position tel que le programme le porte, ou son absence. */
async function etatDeLaPosition(
  ctx: AllocatorContext,
): Promise<{ position: Record<string, unknown> | null }> {
  const etat = await lirePosition(ctx);
  return {
    position: etat
      ? {
          plafond: etat.plafond.toString(),
          suspendue: etat.suspendue,
          actif: etat.actif.toBase58(),
          jetonDeRecu: etat.jetonDeRecu.toBase58(),
        }
      : null,
  };
}

/** Photo des deux soldes de la position, apres un mouvement de venue. */
async function soldesDeLaPosition(
  connection: Connection,
  ctx: AllocatorContext,
): Promise<{ position: string; soldes: Record<string, string> }> {
  const a = adressesDeLAllocateur(ctx);
  return {
    position: a.position.toBase58(),
    soldes: {
      actifDeLaPosition: await lireSolde(
        connection, a.actifDeLaPosition, ctx.programmeDeJeton,
      ),
      recuDeLaPosition: await lireSolde(
        connection, a.recuDeLaPosition, ctx.programmeDeJeton,
      ),
    },
  };
}

/** Solde d'un compte de jeton. Un compte absent vaut zero, pas une erreur. */
async function lireSolde(
  connection: Connection,
  compte: PublicKey,
  programme: PublicKey,
): Promise<string> {
  try {
    return (await getAccount(connection, compte, "confirmed", programme)).amount.toString();
  } catch {
    return "0";
  }
}

/** Photo des soldes qui comptent, apres une operation. */
async function soldes(
  connection: Connection,
  ctx: { depositMint: PublicKey; program: { programId: PublicKey } },
  parts: PublicKey,
  actifs: PublicKey,
  programmeActif: PublicKey,
): Promise<Record<string, string>> {
  const a = adressesDuCoffre(ctx as never);
  return {
    partsDuPorteur: await lireSolde(connection, parts, TOKEN_2022_PROGRAM_ID),
    actifDuPorteur: await lireSolde(connection, actifs, programmeActif),
    actifDuCoffre: await lireSolde(connection, a.vaultAssets, programmeActif),
    partsMortes: await lireSolde(connection, a.deadShares, TOKEN_2022_PROGRAM_ID),
  };
}

function adressesToBase58(a: object): Record<string, string> {
  return Object.fromEntries(
    Object.entries(a).map(([k, v]) => [k, (v as PublicKey).toBase58()]),
  );
}

async function main(): Promise<void> {
  const [commande, ...args] = process.argv.slice(2);
  if (!commande || !(commande in commandes)) {
    console.error(`commandes : ${Object.keys(commandes).join(", ")}`);
    process.exit(1);
  }
  const config = chargerConfig(process.env);
  const resultat = await commandes[commande]!(config, args);
  console.log(JSON.stringify(resultat));
}

main().catch((e) => {
  if (e instanceof ConfigError) {
    console.error(`configuration : ${e.message}`);
  } else {
    const message = e instanceof Error ? e.message : String(e);
    console.error(message);
    // LES JOURNAUX DU PROGRAMME, quand le message ne les porte pas deja. Un
    // refus dont on ne lit pas le code ne prouve rien : une regle appliquee et
    // un accident de composition echouent de la meme facon vu du dehors. Un
    // echec de simulation les joint ; un echec constate apres envoi, non.
    const journaux = (e as { logs?: string[] }).logs;
    if (journaux?.length && !message.includes(journaux[0]!)) {
      console.error(journaux.join("\n"));
    }
  }
  process.exit(1);
});
