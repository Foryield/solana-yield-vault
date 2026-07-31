# Bootstrap — espace de travail et premier déploiement

> **Dépassé le 2026-07-31 par [`vault-core.md`](./vault-core.md).** Le
> programme déployé ici était une ossature sans instruction ; le coffre complet
> occupe désormais le même identifiant. Cette entrée reste pour ce qu'elle
> prouve : la chaîne d'outillage et le premier déploiement.

## 2026-07-31 — Ossature déployée sur devnet

**Ce que ça prouve** : la chaîne complète, de la compilation au déploiement sur
devnet, fonctionne avec les versions retenues au spike S3. Le programme est une
ossature sans instruction : il fige l'identifiant et éprouve l'outillage, il
n'implémente rien.

**Cluster** : Solana **devnet** (`https://api.devnet.solana.com`),
`solana-core 4.1.2`, jeu de fonctionnalités 3345198602.

| Élément | Valeur |
|---|---|
| Program ID | `2bkjZG8njXHQ1tdj5aRSiwjjndX1qEvjFYzBYJQjNysw` |
| ProgramData | `DiRjMuNtgHMgx6y99ZZ6kuqq8Yj2pMfbojxtFByGycX1` |
| Autorité de mise à jour | `7DsCEFjRBQkWiEPE739QuY4CiRWXQEZbeB1F5RGRsuBP` |
| Compte de métadonnées IDL | `J7nmumnvj4MKapt81gc2mQESmVPUnLewS9ei5EHwmoFU` |
| Slot de déploiement | 480182610 |
| Taille du binaire | 57 048 octets |

[Explorer](https://explorer.solana.com/address/2bkjZG8njXHQ1tdj5aRSiwjjndX1qEvjFYzBYJQjNysw?cluster=devnet)

**Signatures.** Déploiement :
[`3tci6fpw…yDTL`](https://explorer.solana.com/tx/3tci6fpwRcaNfu5yzVhH2sj87d71eB45a2vswpxq8svmBCsduqrE6go9HvoWNRT5av8jr3XejdaRKCRspEX3yDTL?cluster=devnet).
Publication de l'IDL on-chain :
[`3PVAQpQr…K4uf`](https://explorer.solana.com/tx/3PVAQpQrSRsFvg9QNG9SXYDPpghhW71jxF1munLtFR3A7KpKYou6HE7DCJ9tR4S34Zc1QyDSrywczUkbu1g9K4uf?cluster=devnet).
Ce sont les deux seules transactions touchant le compte de programme.

**Coût.** 0,403 SOL au total, dont 0,398 immobilisés en dépôt de non-expiration
sur le compte de données et le reste en frais. Nettement moins que les 0,795
estimés : `anchor deploy` dimensionne le compte de données à la taille exacte du
binaire et non au double. Conséquence à connaître : **toute croissance du
programme exigera un `solana program extend`** et le dépôt correspondant.

Conséquence effectivement payée le 31/07 : passer de l'ossature au coffre
complet a coûté 4,017 SOL d'agrandissement, cf. `vault-core.md`. Dimensionner
d'emblée avec de la marge aurait coûté la même chose, mais en une fois.

**Vérifications locales** : `cargo test` au vert (1 test, celui de
l'identifiant, généré par Anchor), `cargo fmt --check` propre,
`cargo clippy --all-targets -- -D warnings` sans avertissement.

## Notes d'exploitation

**Deux clés distinctes, à ne pas confondre.**

L'*autorité de mise à jour* (`7DsCEFjRB…suBP`) est la seule habilitée à
redéployer le programme à cette adresse. Sa clé privée vit dans
`~/.config/solana/id.json` sur le poste qui a déployé.

La *paire de clés du programme* (`target/deploy/yield_vault-keypair.json`,
non versionnée) détermine l'identifiant. Elle ne sert qu'au premier
déploiement : une fois le programme en place, les mises à jour ne dépendent
plus que de l'autorité. Elle mérite néanmoins une sauvegarde hors du poste,
faute de quoi un redéploiement à neuf à la même adresse deviendrait
impossible.

**Pour un contributeur qui rejoint le projet.** Ne pas partager la clé
ci-dessus : générer la sienne (`solana-keygen new`), l'alimenter au robinet, et
déployer ses propres instances de test, qui porteront d'autres identifiants.
L'instance devnet consignée ici reste la référence commune, et seule l'autorité
de mise à jour peut la faire évoluer.

**Piège** : le CLI Solana pointe par défaut sur `mainnet-beta`. Faire
`solana config set --url devnet` avant toute commande, sous peine de dépenser du
SOL réel.

**Robinet** : `https://faucet.solana.com`, deux requêtes par tranche de huit
heures, davantage avec une connexion GitHub. La distribution en ligne de
commande (`solana airdrop`) est bloquée en pratique, quel que soit le montant.
