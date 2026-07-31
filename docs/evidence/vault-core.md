# Coffre — dépôt, parts, retrait, pause

## 2026-07-31 — Le coffre complet est déployé sur devnet

**Ce que ça prouve** : le programme déployé à l'identifiant vérifiable porte
désormais les quatre instructions du coffre, et non plus l'ossature vide du
premier déploiement.

**Cluster** : Solana **devnet** (`https://api.devnet.solana.com`),
`solana-core 4.1.2`.

| Élément | Valeur |
|---|---|
| Program ID | `2bkjZG8njXHQ1tdj5aRSiwjjndX1qEvjFYzBYJQjNysw` |
| ProgramData | `DiRjMuNtgHMgx6y99ZZ6kuqq8Yj2pMfbojxtFByGycX1` |
| Autorité de mise à jour | `7DsCEFjRBQkWiEPE739QuY4CiRWXQEZbeB1F5RGRsuBP` |
| Slot de déploiement | 480216831 |
| Taille du binaire | 317 128 octets |
| Capacité du compte de données | 634 256 octets |

[Explorer](https://explorer.solana.com/address/2bkjZG8njXHQ1tdj5aRSiwjjndX1qEvjFYzBYJQjNysw?cluster=devnet)

**Interface déployée**, lue depuis l'IDL publié on-chain : instructions
`initialize`, `deposit`, `withdraw`, `set_paused` ; compte `Vault` ; huit
erreurs typées.

**Signatures.**

Agrandissement du compte de données :
[`5iMxHq4K…g29u`](https://explorer.solana.com/tx/5iMxHq4KjWFSvxkRrjoXXmdQWM8hGkdhZJcwT2KQz3tmjNMNkkyUgY4AHgix47xtpgZR6kAs9ScrLgF89WyRg29u?cluster=devnet)
— le compte passe de 57 048 à 634 256 octets, son dépôt de non-expiration de
0,398 à 4,416 SOL.

Déploiement :
[`5hLbedUv…JEc8`](https://explorer.solana.com/tx/5hLbedUv18WWy75xLGbnt78a12Qohz4WonhzUsdsz2JZ44gikj4n79LRiSiC8VJ69UbwsRFCVYBKpku7avrtJEc8?cluster=devnet)

Mise à jour de l'IDL on-chain :
[`3eJjrctN…sZii`](https://explorer.solana.com/tx/3eJjrctNGkDesiBrtMPA5ZfRtd6YLGqquJ56LAqnVd3sudEA7DzeDP43WJijxYcqAu8926S8mzQNk66wxaoVsZii?cluster=devnet)

**Coût.** 4,036 SOL au total, dont 4,017 pour l'agrandissement et le reste en
frais et en tampon d'écriture restitué. Le solde d'exploitation passe de 9,597
à 5,562 SOL. Le dépôt de non-expiration n'est pas dépensé : il reste immobilisé
dans le compte et se récupère à la fermeture du programme.

**Pourquoi un agrandissement était nécessaire.** Le premier déploiement avait
dimensionné le compte à la taille exacte de l'ossature, 57 048 octets :
`anchor deploy` ne prévoit aucune marge. Le binaire complet en fait 317 128, et
un programme ne peut pas dépasser la capacité de son compte de données. Le
compte a donc été porté au double du binaire actuel, pour que les instructions
à venir n'imposent pas de recommencer.

## Ce que cette entrée ne prouve pas

Le programme est déployé et son interface est publique, mais **aucun coffre
n'est encore initialisé sur devnet** et aucun dépôt n'y a été exécuté. Le
comportement est éprouvé par 45 tests dans le simulateur en processus, pas
encore contre le réseau.

Prouver le parcours sur devnet demande un client capable de composer les
instructions, ce qui relève de la démonstration web. Ce sera une entrée
distincte, et elle nommera son cluster comme celle-ci.
