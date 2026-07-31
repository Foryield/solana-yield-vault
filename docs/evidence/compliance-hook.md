# Module de conformité — hook de transfert Token-2022

## 2026-07-31 — Le hook est déployé sur devnet

**Ce que ça prouve** : le programme qui décide si une part peut atterrir chez un
porteur donné existe à un identifiant vérifiable, et son instruction
d'exécution porte le discriminant que Token-2022 ira chercher.

**Cluster** : Solana **devnet** (`https://api.devnet.solana.com`),
`solana-core 4.1.2`.

| Élément | Valeur |
|---|---|
| Program ID | `EGbJBdCUK5ecUiVJ9FFiGdVEZQ15cE31zNm97RUpFK63` |
| ProgramData | `7ocu4TUSahJsD2FtX7LNV2ERZJsr81xRVaxzrQhBgA3m` |
| Autorité de mise à jour | `7DsCEFjRBQkWiEPE739QuY4CiRWXQEZbeB1F5RGRsuBP` |
| Slot de déploiement | 480231777 |
| Taille du binaire | 217 472 octets |
| Capacité du compte de données | 326 208 octets |

[Explorer](https://explorer.solana.com/address/EGbJBdCUK5ecUiVJ9FFiGdVEZQ15cE31zNm97RUpFK63?cluster=devnet)

**Signature** :
[`46KdKRGe…zH2n`](https://explorer.solana.com/tx/46KdKRGeppNoAgJPqtTWwRtQgHyn2Dnok8Lm4R1CzQnvrwpbBzo9ZhWccxRNmby55b9671Eknx51nLAs8jY3zH2n?cluster=devnet)

**Interface déployée**, lue depuis l'IDL : instructions `initialize`, `allow`,
`revoke`, `transfer_hook` ; comptes `HookConfig` et `AllowlistEntry` ; trois
erreurs typées.

**Le discriminant est le bon, vérifié indépendamment.** L'instruction
d'exécution publie `[105, 37, 101, 197, 75, 251, 102, 26]`, ce qui est
exactement `sha256("spl-transfer-hook-interface:execute")[0..8]` recalculé à
part. Sans cette égalité, Token-2022 ne trouverait pas l'instruction et le hook
serait inerte tout en paraissant déployé.

**Coût.** 2,274 SOL, pour un compte dimensionné à une fois et demie le binaire.
Le solde d'exploitation passe de 5,562 à 3,288 SOL.

Le dimensionnement diffère de celui du coffre, et c'est délibéré. Le coffre
avait été déployé à la taille exacte d'une ossature vide, ce qui avait coûté
4,017 SOL d'agrandissement quand il s'est rempli. Le hook, lui, est
fonctionnellement complet : une marge au double aurait immobilisé 3,028 SOL
pour de la place qui ne servira pas. Une fois et demie laisse de quoi absorber
une évolution sans payer d'avance ce qu'on ne consommera pas.

## Ce que cette entrée ne prouve pas

**Aucun mint n'est encore gouverné par ce hook sur devnet.** Le programme est
déployé, mais aucune configuration n'y est attachée, aucune liste
d'autorisation n'est peuplée, et aucun coffre n'a été initialisé en le
désignant.

Le comportement, lui, est éprouvé par 64 tests dans le simulateur en processus,
dont les six cas qui lèvent la réserve de méthode du spike de dérisquage : un
transfert vers un porteur autorisé aboutit, un transfert vers un non-autorisé
est refusé avec le code de la liste, le transfert hérité échoue au lieu de
contourner, la délégation n'ouvre pas de chemin parallèle, une fermeture de
compte non vide est refusée, et un compte de parts sans l'extension imposée est
impossible à ouvrir.

Attacher le hook à un mint réel et initialiser un coffre qui le désigne demande
un client capable de composer ces instructions. Ce sera une entrée distincte, et
elle nommera son cluster comme celle-ci.
