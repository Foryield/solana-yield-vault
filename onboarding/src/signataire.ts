import { sign } from "node:crypto";
import type {
  CredentialSigner,
  KeyAssertion,
  UserActionChallenge,
} from "@dfns/sdk";

/**
 * Signataire d'action utilisateur, qui LIT L'IDENTIFIANT DE CREDENTIAL DANS LE
 * DEFI au lieu de le reclamer en configuration.
 *
 * Le signataire fourni par le SDK exige `credId` en argument de constructeur.
 * En le lisant, on voit qu'il ne s'en sert que pour deux choses : verifier que
 * cet identifiant figure parmi ceux que le defi autorise, puis le recopier dans
 * l'assertion. Or le defi porte deja cette liste, `allowCredentials.key`. La
 * valeur etait donc reclamee a l'operateur pour etre comparee a une reponse qui
 * la contient.
 *
 * On la lit. Le dorsal Rails de la maison procede ainsi depuis longtemps, en
 * prenant l'identifiant dans la reponse d'initialisation d'action ; ce module
 * met les deux au meme niveau.
 *
 * `credIdImpose` reste possible pour le seul cas ou il tranche vraiment quelque
 * chose : plusieurs credentials de type cle sur le meme compte. Le defi ne dit
 * pas laquelle correspond a notre cle privee, et essayer au hasard produirait
 * un refus opaque.
 */
export class SignataireDeCle implements CredentialSigner<KeyAssertion> {
  constructor(
    private readonly clePrivee: string,
    private readonly credIdImpose?: string,
  ) {}

  async sign(defi: UserActionChallenge): Promise<KeyAssertion> {
    const credId = this.choisir(defi.allowCredentials.key.map((c) => c.id));

    // Forme imposee par le fournisseur : c'est cette structure exacte qui est
    // signee, pas le defi brut.
    const donnees = Buffer.from(
      JSON.stringify({ type: "key.get", challenge: defi.challenge }),
    );

    return {
      kind: "Key",
      credentialAssertion: {
        credId,
        // `base64url` de Node produit exactement ce que le SDK fabrique a la
        // main : base64 sans remplissage, `+` en `-` et `/` en `_`.
        clientData: donnees.toString("base64url"),
        // Algorithme absent : Ed25519 porte le sien, et en nommer un le fait
        // refuser.
        signature: sign(undefined, donnees, this.clePrivee).toString(
          "base64url",
        ),
      },
    };
  }

  private choisir(permis: string[]): string {
    if (this.credIdImpose) {
      if (!permis.includes(this.credIdImpose)) {
        throw new Error(
          `DFNS_CRED_ID (${this.credIdImpose}) ne figure pas parmi les ` +
            `credentials autorises : ${permis.join(", ") || "aucun"}.`,
        );
      }
      return this.credIdImpose;
    }

    if (permis.length === 1) return permis[0]!;

    if (permis.length === 0) {
      throw new Error(
        "le fournisseur n'autorise aucun credential de type cle pour cette " +
          "action. Verifier que la cle publique est bien celle enregistree " +
          "sur le compte de service.",
      );
    }

    throw new Error(
      `${permis.length} credentials de type cle sont autorises et le defi ne ` +
        `dit pas lequel correspond a notre cle. Poser DFNS_CRED_ID parmi : ` +
        `${permis.join(", ")}.`,
    );
  }
}
