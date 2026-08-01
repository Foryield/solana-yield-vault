# Module de conformité - hook de transfert Token-2022

## 2026-07-31 - Le hook est déployé sur devnet

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

## 2026-08-01 - La liste d'autorisation décide, contre le réseau

**Ce que ça prouve** : le binaire déployé applique bien la liste. Un transfert
de parts vers un porteur autorisé aboutit, un transfert vers un porteur qui ne
l'est pas est refusé avec le code de la liste, et une autorisation retirée
referme la porte. **Les deux entrées précédentes réservaient ce point**, le
contrôle d'éligibilité n'étant éprouvé qu'en simulateur : la réserve est levée.

**Cluster** : Solana **devnet** (`https://api.devnet.solana.com`).

Le transfert entre porteurs est la seule surface où ce contrôle se voit. Ni le
dépôt ni le retrait ne l'invoquent, parce qu'une frappe et une destruction ne
sont pas des transferts, ce que l'entrée `depot-retrait-devnet.md` avait déjà
constaté sans le chercher.

### Les acteurs

| Élément | Adresse |
|---|---|
| Mint des parts, six décimales | `4R5iTggafNoLwo4KDQsPS8981eqeFw35gUB2JDm6Q5ps` |
| Porteur **B**, autorisé puis révoqué | `Dz7mzmQS9YDvDMu9faWms41rfcyUM3vZDRXu9ZNhLgKr` |
| Compte de parts de B | `GWhwgyrBFtbScXDHD44XhCYnVTsMcT56wxxiTNeXnR9u` |
| Porteur **C**, jamais autorisé | `BeBQQqjuUFU1qjJayMg46CWuaKw7oTJ5R4UfoVLVKohL` |
| Compte de parts de C | `2AyhZhKKV5KSF1Hxt2KAED4yU7JjyUKN5o65Seq81trp` |
| Entrée de liste de B, depuis fermée | `GKh4kviKM5gGxmB73THxPN9TbZ2yqYwo8XkHTEspcFBK` |

### La séquence

| Geste | Effet mesuré | Signature |
|---|---|---|
| Dépôt de 2 USDC | 2 000 000 parts émises, au pair | [`3pHCVgKL…ywqW`](https://explorer.solana.com/tx/3pHCVgKLD3HESnnRCCHprWxdhDhkEv2fDCqQWiqrMLz1xS3N4eF86hc48ZazvyHhoHHbH4Jy8cMhHUfogjsQywqW?cluster=devnet) |
| Autorisation de B | entrée de liste créée | [`31fxWAkk…oYzU`](https://explorer.solana.com/tx/31fxWAkkFv3tLxeMPr3JW3mVEQXUkoisfLiu1xvjoNuu7QcmmFfLZx6u8amgAk7zEnqskXDKsw9dAgBmPPBkoYzU?cluster=devnet) |
| Compte de parts de B | créé et payé par l'émetteur | [`45AwqP8P…qxyH`](https://explorer.solana.com/tx/45AwqP8PC2DZi4jLX7n3HQc3JqKmtp4APHRFM6nxaCyEMt4jojLJVGy1DV6om7bVRjMfvRoitXVFsj75e5JpqxyH?cluster=devnet) |
| **Transfert de 500 000 parts vers B** | **abouti** : source 1 500 000, B 500 000 | [`3cJ33jus…VpCC`](https://explorer.solana.com/tx/3cJ33jusZAMsexxjnaXdx4HZLkKvhGfADjAsb2r1VRo6Ny4YcYsMN39CrM56erpWAwaRi6cHohPgcnSEniGPVpCC?cluster=devnet) |
| Compte de parts de C | créé, à zéro | [`2qmnyWGg…9Nvm`](https://explorer.solana.com/tx/2qmnyWGgMsG3HPkDBPaMZUwTaCnbYVvR6GFMnUF767qDsuCkK3fkJT3mv19T1s5nh2XYBtQLdCTvjtreFeaD9Nvm?cluster=devnet) |
| **Transfert de 500 000 parts vers C** | **refusé**, code 6001 | aucune, rejeté à la simulation |
| Révocation de B | entrée fermée, dépôt rendu | [`4Bk55tPw…pA61`](https://explorer.solana.com/tx/4Bk55tPwdba5SbQ57cp45W9NBqXys7XFbzkQPNvxAtZ8y4rRosE4x1BhXHUu69yfN3aRqSEQFKvLWEtKWdoJpA61?cluster=devnet) |
| **Transfert de 100 000 parts vers B** | **refusé**, même code 6001 | aucune, rejeté à la simulation |

### Le refus vient de la liste, et rien d'autre

Un refus dont on ne lit pas le code ne prouve rien : une règle appliquée et un
accident de composition échouent de la même façon vu du dehors. Les journaux du
réseau nomment le refus :

```
Program TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb invoke [1]
Program log: Instruction: TransferChecked
Program EGbJBdCUK5ecUiVJ9FFiGdVEZQ15cE31zNm97RUpFK63 invoke [2]
Program log: Instruction: TransferHook
Program log: AnchorError thrown in programs/compliance-hook/src/instructions/execute.rs:73.
  Error Code: NotAllowed. Error Number: 6001.
  Error Message: Le destinataire n'est pas sur la liste d'autorisation.
```

Token-2022 invoque le hook au deuxième niveau, de lui-même, sans qu'aucune
instruction ne le lui demande. C'est exactement le chemin que le spike de
dérisquage avait établi par lecture de la source, et qui n'avait jamais été
emprunté contre le réseau.

Le compte de parts de C **existe et reste à zéro**. Sans lui, le transfert
aurait échoué pour compte manquant et n'aurait rien prouvé du tout.

**La dernière réserve du plan du hook tombe ici.** Ce n'est pas nous qui
désignons l'entrée de liste à consulter : Token-2022 la dérive lui-même depuis
les données du compte de destination, et rien en simulateur ne pouvait montrer
qu'il vise la bonne. Deux destinataires, la même composition d'instruction, deux
verdicts opposés : une dérivation qui viserait à côté les aurait refusés tous
les deux.

### Trois choses que la séquence a établies en passant

**Un destinataire n'a besoin ni de clé disponible ni de SOL.** B et C sont
restés à zéro SOL du début à la fin. Seul le propriétaire de la source signe, et
le compte de parts du destinataire est payé par qui l'envoie. Le point de
reprise annonçait le contraire ; c'est corrigé.

**La révocation n'est pas une confiscation.** B conserve ses 500 000 parts après
avoir été retiré de la liste. La liste porte sur la RÉCEPTION, pas sur la
détention : un porteur devenu inéligible garde ce qu'il a et ne peut plus rien
recevoir. C'est le comportement voulu, il est désormais mesuré.

**La révocation mord immédiatement.** Le second refus vise un porteur autorisé
quelques secondes plus tôt, qui avait effectivement reçu des parts. Il ne s'agit
donc pas de l'absence initiale d'une entrée, mais bien de sa fermeture.

### Coût

0,004243 SOL de l'autorisation au dernier refus, dépôts de non-expiration
compris : solde d'exploitation 23,261210 → 23,256967 SOL. Le dépôt de 2 USDC qui
ouvre la séquence a coûté 0,000005 SOL de frais, et les deux refus rien du tout,
puisqu'ils sont rejetés avant l'envoi.

Un compte de parts pèse 2,11 mSOL, une entrée de liste 1,18, rendus à la
révocation.

### Ce que cette entrée ne prouve pas

Le transfert **sortant d'un porteur révoqué vers un tiers éligible** n'est pas
exercé. Le hook ne regarde que le destinataire, donc il devrait aboutir ; le
vérifier demanderait de faire signer B, ce que rien n'exige aujourd'hui.

Le contrôle n'est exercé que sur le coffre USDC. Le coffre EURC a son propre
mint de parts et sa propre configuration, gouvernés par le même programme : rien
ne distingue les deux cas, mais rien ne l'a mesuré non plus.
