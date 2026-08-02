import { DfnsApiClient } from "@dfns/sdk";
import { AsymmetricKeySigner } from "@dfns/sdk-keysigner";
import type { Garde } from "./config.js";

/**
 * Client du fournisseur de garde.
 *
 * Le signataire tient la cle de signature d'action utilisateur : c'est elle qui
 * autorise chaque geste sensible, pas le jeton seul. Les deux vivent hors du
 * depot, cf. `env.ts`.
 */
export function clientDeGarde(garde: Garde): DfnsApiClient {
  return new DfnsApiClient({
    baseUrl: garde.apiUrl,
    authToken: garde.authToken,
    signer: new AsymmetricKeySigner({
      credId: garde.credId,
      privateKey: garde.privateKey,
    }),
  });
}
