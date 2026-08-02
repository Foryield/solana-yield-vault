# Documentation - point d'entrée

Ce dossier contient les documents de travail du projet. Ils sont en français,
comme les commentaires du code ; les documents racine sont en anglais.

**Reprise de travail** : lire d'abord
[le point de reprise du 01/08](./plans/2026-08-01-point-de-reprise.md). Il dit
ce qui reste, dans quel ordre, et ce qu'il ne faut pas redécouvrir.

## Par où commencer

1. [Conception](./plans/2026-07-31-solana-yield-vault-design.md) - ce qu'on
   construit, pourquoi, et l'inventaire devnet sur lequel ça repose. C'est le
   document de référence : toute décision d'architecture y est tracée avec les
   alternatives écartées.
1. Plans d'exécution par chantier :
   [le coffre](./plans/2026-07-31-coffre-implementation.md) (clos),
   [le module de conformité](./plans/2026-07-31-hook-conformite-plan.md) (clos),
   [le client et la démonstration](./plans/2026-07-31-client-et-demonstration-plan.md)
   (clos) et
   [le paquet de provisionnement](./plans/2026-08-02-paquet-provisionnement-plan.md)
   (clos) et [l'allocateur](./plans/2026-08-02-allocateur-plan.md) (ouvert).
2. [Spikes d'ouverture](./plans/2026-07-31-spikes-ouverture.md) - les sept
   questions à trancher avant d'écrire du programme.
3. [Journal de preuves](./evidence/) - une entrée par livrable, chaque preuve
   consignée le jour où elle est produite.

Les règles de travail (plan avant code, tout par PR, preuve le jour même) sont
dans [`CONTRIBUTING.md`](../CONTRIBUTING.md) à la racine.

## État des spikes

| Spike | Sujet | Bloquant | État |
|---|---|---|---|
| S1 | Ce qui déclenche réellement le hook de transfert | oui | **rendu** (31/07) |
| S2 | Mesure de couverture sur cible BPF | oui | **rendu** (31/07) |
| S3 | Alignement des versions et amorçage | oui | **clos** (31/07) |
| S4 | Jupiter Lend en CPI | non | **partiel** (02/08) : marchés décodés par l'IDL, CPI restante |
| S5 | Signature et diffusion Solana via DFNS | non | **clos** (02/08) |
| S6 | Trésorerie devnet et runbook de distribution | non | à faire |
| S7 | Validateur local forké du mainnet | non | à faire |

S1, S2 et S3 sont ordonnés et conditionnent tout le reste. Les quatre autres
sont indépendants entre eux et se mènent en parallèle une fois les trois
premiers rendus.

Deux acquis du 31/07, détaillés dans le document de spikes. La couverture ne
se mesure que sur de la logique pure compilée côté hôte : le chemin BPF, que
LiteSVM emprunte, rend zéro pour cent. L'arithmétique du coffre doit donc
vivre dans des fonctions pures, et la conception a été amendée en ce sens. Les
versions sont par ailleurs tranchées contre le réseau, Agave 4.1.2 et Anchor
1.1.2, la documentation d'Anchor ayant deux versions majeures de retard.

S3 est clos : l'espace de travail est amorcé et une ossature de programme est
déployée sur devnet, identifiant et signatures consignés dans
[`evidence/bootstrap.md`](./evidence/bootstrap.md), qui porte aussi les notes
d'exploitation utiles à un contributeur (clés, robinet, piège du CLI pointant
par défaut sur `mainnet-beta`).

**Les trois spikes bloquants ont rendu, et les programmes qu'ils conditionnaient
sont écrits, déployés et exercés contre le réseau.**

S1 conclut que la liste d'autorisation est étanche : aucune voie de mouvement
n'échappe au hook, ni le transfert hérité, ni les transferts confidentiels, ni
la délégation. L'architecture du module de conformité tient telle que conçue. Sa
réserve de méthode est **levée** : la réponse venait de la lecture de la source
de Token-2022, et l'épreuve empirique a pris la forme de tests permanents écrits
avec le hook, puis d'un transfert réellement refusé sur devnet.

Restent S4, S6 et S7, non bloquants. S4 a rendu son premier volet le 02/08 : les quatre marchés Jupiter Lend devnet sont décodés par l'IDL de l'éditeur, USDC et EURC en sont deux, et la valorisation se lit dans le marché même. S6 a déjà
livré son résultat par anticipation : la distribution en ligne de commande est
inutilisable sur devnet, le robinet web plafonne à deux requêtes par tranche de
huit heures, et ce plafond contraint le rythme des déploiements.

Chaque spike inscrit son verdict, ses adresses et ses signatures directement
dans le document de spikes, daté. Un spike sans verdict écrit n'a pas eu lieu.

## Où en est le code

Le coffre est **complet et déployé sur devnet** : dépôt, parts proportionnelles,
retrait, coupe-circuit. Arithmétique pure couverte à 100 %. Preuves dans
[`evidence/vault-core.md`](./evidence/vault-core.md).

Le module de conformité est **écrit et déployé** lui aussi : liste
d'autorisation par PDA, garde interdisant l'appel hors transfert, et les six cas
du spike S1 éprouvés contre de vrais transferts. Preuves dans
[`evidence/compliance-hook.md`](./evidence/compliance-hook.md).

Deux **instances vivantes** existent sur devnet depuis le 01/08, sur l'USDC et
l'EURC de Circle, leurs mints de parts gouvernés par le hook. Adresses et
signatures dans [`evidence/devnet-instance.md`](./evidence/devnet-instance.md).

**Le cycle complet est prouvé contre le réseau** depuis le 01/08 : dépôt, parts
proportionnelles, retrait partiel, retrait intégral, sur les deux actifs.
Signatures dans
[`evidence/depot-retrait-devnet.md`](./evidence/depot-retrait-devnet.md).

**Le transfert de parts entre porteurs l'est également**, et c'est la seule
surface où le contrôle d'éligibilité se voit : un transfert vers un porteur
autorisé aboutit, un transfert vers un porteur qui ne l'est pas est refusé avec
le code de la liste, et une révocation referme la porte.

**Une surface publique existe** depuis le 01/08 :
<https://solana.for-yield.com>, où déposer, retirer et transférer se font depuis
un portefeuille de navigateur, sans rien cloner. Ce que son déploiement a appris
est consigné dans
[`evidence/demonstration-web.md`](./evidence/demonstration-web.md).

## Ce qui n'est pas encore là

L'**allocateur** et le **schéma d'événements de conformité** sont conçus et non
écrits. Restent aussi les spikes S4, S6 et S7.
