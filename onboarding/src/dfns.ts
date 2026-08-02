import { DfnsApiClient } from "@dfns/sdk";
import type { Garde } from "./config.js";
import { SignataireDeCle } from "./signataire.js";

/**
 * Client du fournisseur de garde.
 *
 * Le signataire tient la cle de signature d'action utilisateur : c'est elle qui
 * autorise chaque geste sensible, pas le jeton seul. Les deux vivent hors du
 * depot, cf. `env.ts`.
 *
 * Signataire maison plutot que celui du SDK, pour une raison precise : le
 * sien exige un identifiant de credential que le defi du fournisseur porte
 * deja. Cf. `signataire.ts`.
 */
export function clientDeGarde(garde: Garde): DfnsApiClient {
  return new DfnsApiClient({
    baseUrl: garde.apiUrl,
    authToken: garde.authToken,
    signer: new SignataireDeCle(garde.privateKey, garde.credId),
  });
}
