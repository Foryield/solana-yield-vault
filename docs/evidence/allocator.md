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

## 2026-08-04 - Dépôt et retrait Jupiter Lend depuis notre programme, S4 clos

**Ce que ça prouve** : l'allocateur place et reprend de l'actif sur une venue de
rendement tierce, en invocation croisée, signant par son autorité de position.
C'était le critère de sortie du spike S4 et de l'étape 1 du plan.

**Cluster** : Solana **devnet** (`https://api.devnet.solana.com`).

| Élément | Adresse |
|---|---|
| Allocateur | `BjQJMxT5m4wb6nLBnA91s446hTsj1AL9RiwxVEk2rgGr` |
| Autorité de position | `F9c5aHU7k8HATVqorZgg6hUEHS9Kc2fXZUPDxGbVtueE` |
| Actif de la position | `Byr3csRSNu1GJpBqaVfiWcTzdQ69tDkZcjEQcdvTZtci` |
| Jetons de reçu de la position | `6eCACA5DDU9udAugxFFi4A2ZYXHdLjBQnM6W5XMbttyM` |
| Opérateur | `7DsCEFjRBQkWiEPE739QuY4CiRWXQEZbeB1F5RGRsuBP` |

**Signatures**, dans l'ordre du parcours :

| Geste | Signature |
|---|---|
| Comptes de jeton de la position | [`GnccYfgA…x5Jn`](https://explorer.solana.com/tx/GnccYfgAr2CyU6szfGeo99KaY1Qmbq2Pb94CZsKn6ZRaVor3iXiCjMBns9QYX6v7CQzabB7dUQL7rvksagMx5Jn?cluster=devnet) |
| Dotation, 5 USDC | [`s5x7MGH5…CoVU`](https://explorer.solana.com/tx/s5x7MGH5c2FnNVQvqPt7Mh7fpnAkCYkdN27nycUDbHDhfsX5d7nJfwgmWSfgywG2mc9WxLvrAd3Y6JMndC1CoVU?cluster=devnet) |
| **Dépôt, 2 USDC** | [`JHvfJME7…yyTH`](https://explorer.solana.com/tx/JHvfJME77D6cRBYx4PXSShjWc8QNbt5oHsgy5gcvkuYzFmVMzduG5ejPSXnucCKc5Jvx8RrgzDguM1pDyZ8yyTH?cluster=devnet) |
| **Retrait, 1 USDC** | [`5xT1mim9…xQcQU`](https://explorer.solana.com/tx/5xT1mim9H7b4oXZQXxdthPPLq8rtsdSHZHm6DN7xU1BjAc4jfBhJyK9KQudzz65UM8qwQgb3wTsFQyzmZemxQcQU?cluster=devnet) |

**Ce que les journaux montrent, et qui ne se déduisait pas.** Le dépôt exécute
`DepositWithMinAmountOut` et le retrait `WithdrawWithMaxSharesBurn` : ce sont
bien les variantes bornées qui tournent, pas les nues. Le dépôt a rendu
1 979 614 jetons de reçu pour 2 USDC ; le retrait a brûlé 989 808 jetons pour
1 USDC, sous un plafond de 1 000 000.

**Coût.** 1,23 SOL de déploiement, 0,000005 SOL par transaction. Solde
d'exploitation 23,242 → 21,912 SOL, extension du compte de programme comprise.

## 2026-08-04 - L'adaptateur, son plafond et son chemin d'urgence, éprouvés

**Ce que ça prouve** : les gardes de l'étape 2 mordent réellement, et aucune
n'est un commentaire. Chacune a été mise en échec volontairement.

**Cluster** : Solana **devnet**.

| Élément | Adresse |
|---|---|
| Configuration de l'allocateur | `Dd4Fn5nzFXFp35h4t5LmPAb1CyXaEPeMgXWs6Tkq6S8u` |
| Administrateur | `7DsCEFjRBQkWiEPE739QuY4CiRWXQEZbeB1F5RGRsuBP` |

| Geste | Résultat | Signature |
|---|---|---|
| Configuration | administrateur figé | [`4g2k6sCA…3KVH`](https://explorer.solana.com/tx/4g2k6sCA5FxHEbJpG3zu9iLxuWTWmKnGq113R5C5Fr2XhoDKNd331K9V7SuB9gZCdHs5UD9H3S5PPLMFfJZh3KVH?cluster=devnet) |
| Ouverture, plafond 3 USDC | actif et jeton de reçu **lus dans le marché** | [`q29rc4ug…fYxU`](https://explorer.solana.com/tx/q29rc4ugzzcw5Gon3dos8DqnErT76TPz7GAY7VxVqPU1X1co6WXi3wcyUH7Lb5TMk4VXWC3r8abR9Kr5wmtfYxU?cluster=devnet) |
| Dépôt de 1 USDC | accepté, sous le plafond | [`29eZKcVP…3W8n`](https://explorer.solana.com/tx/29eZKcVPBGj9GE8p2Vk97aBpuYjmaQyCajqhiSKFoiVisewtFeFaK1D8QPCwSWj94ZZtESgoH1VutsoHR7wB3W8n?cluster=devnet) |
| Retrait pendant suspension | **accepté**, comme voulu | [`5v3LJQtU…yZJ2`](https://explorer.solana.com/tx/5v3LJQtUVAZ71PJ7zPQGvj28wNL8RqFofGiBseD5NXCLtJnj4aUFGao9pR6uXQARUFXndWUhiNBEwmzt4egEyZJ2?cluster=devnet) |
| **Rachat intégral d'urgence** | position vidée | [`2cF1Ztsc…s6qe`](https://explorer.solana.com/tx/2cF1ZtscsrmCU3md95i41yyVbZ2BkS6cpgTdWkQTtzKZsbXQBFvhkAR3d5vU6n3b2ienXag88dz5nnShgTjMs6qe?cluster=devnet) |

**Les deux refus, provoqués exprès.** Un dépôt de 2 USDC qui aurait porté la
valorisation à environ 4 USDC pour un plafond de 3 a été rejeté sur
`PlafondDepasse` (6013), et les soldes sont restés inchangés : la transaction
étant atomique, le refus annule l'invocation croisée qui l'avait précédé. Un
dépôt pendant suspension a été rejeté sur `PositionSuspendue` (6010).

**Le rachat intégral se lit dans ses journaux** : `RedeemWithMinAmountOut` puis
`rachat integral de 1880632 parts contre 1899998 unites`. La valorisation
calculée hors chaîne avant l'appel annonçait 1 899 998, à l'unité près. Le solde
de jetons de reçu est tombé à zéro, ce que le programme vérifie lui-même.

**Un risque qui ne s'est pas matérialisé, et qu'il fallait lever.** La position
porte désormais des données tout en restant le signataire des invocations
croisées. Rien ne garantissait que la venue accepte comme signataire en écriture
une adresse dérivée appartenant à un autre programme. Elle l'accepte.

**Coût du parcours.** Sur 5 USDC dotés au départ, la position en retrouve
4 999 998 après un dépôt de 2, un dépôt de 1, un retrait de 1, un retrait de 0,1
et un rachat intégral. Deux unités minimales perdues en arrondis sur cinq
mouvements, soit un dix-millionième.

## 2026-08-04 - Trois mesures que seul le réseau pouvait rendre

**L'horodatage de rafraîchissement tombe sur l'horloge de la transaction.**
Journalisé et non exigé, faute de l'avoir mesuré : `marche rafraichi a
1785853332, horloge 1785853332`. Les deux valeurs sont égales, sur les deux
transactions. Le contrôle peut donc être durci à l'étape 2, sur une mesure et
non sur une supposition.

**La venue applique la formule simplifiée, pas la conversion en deux temps.** Le
journal du dépôt dit « ecart favorable de 1 parts au-dela du plancher ». Aux
prix de la transaction, lus dans son propre événement de taux, la conversion en
deux temps rend 1 979 613 et la division simple 1 979 614. La venue a émis
1 979 614.

C'est l'inverse de ce que le plan supposait, et la conséquence est directe : le
plancher a tenu parce qu'il **minore**, mais l'égalité stricte que le plan avait
écartée aurait **refusé ce dépôt**. La décision était bonne, la prémisse était
fausse. Une mesure, un montant, un marché : cela ne prouve pas leur formule,
cela réfute l'hypothèse.

**Le signataire d'une invocation croisée doit être déclaré en écriture chez
l'appelant.** Premier essai arrêté sur « writable privilege escalated », qui
nomme le compte et pas la cause : la venue attend son signataire en écriture, et
une invocation croisée ne peut pas élever un droit qu'elle n'a pas reçu. Aucun
test hors ligne n'aurait pu le trouver, la simulation d'une invocation croisée
demandant le binaire du tiers.
