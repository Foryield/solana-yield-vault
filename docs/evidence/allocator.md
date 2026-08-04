# Allocateur - invocation croisée vers Jupiter Lend

## 2026-08-04 - Les trois programmes devnet de la venue, lus sur la chaîne

**Ce que ça prouve** : la venue est adressable depuis devnet sans rien recopier
du paquet publié par l'éditeur, qui ne connaît que le mainnet. Sans ces trois
identifiants, six des dix-huit comptes d'un retrait sont introuvables.

**Cluster** : Solana **devnet** (`https://api.devnet.solana.com`).

**Méthode, et c'est elle qui fait la preuve.** Aucun de ces identifiants n'a été
lu dans une documentation. Le compte de marché USDC désigne trois comptes dans
ses octets : ses réserves, sa position de fourniture et son modèle de taux de
récompenses. Il a suffi de demander à devnet **qui possède** ces comptes. Le
relevé est reproductible :

```
node client/scripts/releve-venue.mjs
```

| Programme | Adresse devnet | Trouvé comme |
|---|---|---|
| Prêt | `7tjE28izRUjzmxC1QNXnNwcc4N82CNYCexf3k8mw67s3` | propriétaire du compte de marché |
| Liquidité | `5uDkCoM96pwGYhAUucvCzLfm5UcjVRuxz6gH81RnRBmL` | propriétaire des réserves |
| Récompenses | `68LHLkpgjAvo6Lgd9FT6KYEX4FWn1911EohSXxHYMFjc` | propriétaire du modèle de récompenses |

**Les trois diffèrent de ceux du mainnet**, que le paquet code en dur. Un test du
client fige ces valeurs mainnet comme interdites, pour qu'une recopie tombe.

## 2026-08-04 - Les graines de l'éditeur valent aussi pour devnet

**Ce que ça prouve** : les dérivations publiées pour le mainnet s'appliquent
telles quelles à devnet, une fois les bons identifiants de programme employés.
Rien ne le garantissait.

**Méthode.** Cinq adresses ont un témoin lu sur la chaîne, indépendant de tout
calcul de notre part. Les cinq concordent avec la dérivation.

| Compte | Adresse | Témoin |
|---|---|---|
| Marché USDC | `98Uy7eonumvRbhQvP5Jt7B3WjNqpndioMF99xvR7sDVa` | compte lu sur devnet |
| Jeton de reçu | `2Wx1tTo8PkTP95NyKoFNPTtcLnYaSowDkExwbHDKAZQu` | champ du marché |
| Réserves de liquidité | `644Eh222dNe1V6sSRkYHBcdpxfjtxBBptAJ6mZujRRNo` | champ du marché |
| Position de liquidité | `B5JAZXGKaZfWsUrauprZVNQM7HwXN8AfKVTt25qtDKYV` | champ du marché |
| Modèle de récompenses | `GGtryeuwjcWoG6zg4Xi1vUJN1xRhypms4xt129BKTUxt` | champ du marché |

Les cinq autres n'ont pas de témoin dans le marché, mais **existent toutes** sur
devnet, ce qui est le seul point qui importe pour composer une transaction :

| Compte | Adresse |
|---|---|
| Administration | `DeF2BVMjWdCamK71nqBZ7uzQkLeW9MJ6C7zoCKLJXEmW` |
| Modèle de taux | `CpSRFppSpkdPw7juvRpSxwVyZMN3y8g7cHXCbrc3MBUs` |
| Liquidité | `DFHSbFzMU67yHK9yLsLBLso7aEnzrB4ZQR7KBujmSU3M` |
| Compte de réclamation | `dUnUR9XxaVWZo5FUi5DGqsMWfAzYPdtgkuiDbPLLtYX` |
| Coffre de la venue | `CWFPa1gcDqGyeTHTmdbhGjCnQv7eRfdhnBpZKFzNr1R2` |

## 2026-08-04 - Le compte de réclamation existe déjà, le préalable tombe

**Ce que ça prouve** : le retrait n'est bloqué par aucune mise en place
préalable sur cet actif.

Le plan annonçait ce compte comme un préalable d'exploitation à créer avant le
premier retrait. La lecture de sa dérivation le corrige sur deux points. Sa
graine n'est **pas le retireur** mais l'administration de la venue, malgré un nom
de graine qui dit « user » : il en existe donc **un seul par actif**, partagé.
Et il relève du **programme de liquidité**, non de celui des récompenses. Celui
de l'USDC devnet, `dUnUR9XxaVWZo5FUi5DGqsMWfAzYPdtgkuiDbPLLtYX`, existe déjà.

Le préalable reste entier pour un actif dont personne n'a jamais retiré.

## 2026-08-04 - Les deux dérivations de position concordent

**Ce que ça prouve** : le programme et le client dérivent la même autorité de
signature. Une divergence ne se verrait pas à la compilation et se traduirait
par une signature que la venue refuse sans rien nommer.

Pour le coffre USDC `SWmEZGD1QjPZZqPXBkRfVsmbZpTEd18uJ3RgMEJCwVW` et le marché
`98Uy7eonumvRbhQvP5Jt7B3WjNqpndioMF99xvR7sDVa`, les deux implémentations
rendent `F9c5aHU7k8HATVqorZgg6hUEHS9Kc2fXZUPDxGbVtueE`, bump 255. La fixture est
produite par le test Rust et relue par le test TypeScript, comme pour le coffre
et le hook.

## Ce qui reste

Le dépôt et le retrait eux-mêmes, signatures consignées. Ils exigent le
déploiement de l'allocateur sur devnet, qui n'a pas eu lieu à cette date : aucun
binaire ne répond à `BjQJMxT5m4wb6nLBnA91s446hTsj1AL9RiwxVEk2rgGr`.
