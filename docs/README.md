# Documentation — point d'entrée

Ce dossier contient les documents de travail du projet. Ils sont en français ;
le code, ses commentaires et les documents racine sont en anglais.

## Par où commencer

1. [Conception](./plans/2026-07-31-solana-yield-vault-design.md) — ce qu'on
   construit, pourquoi, et l'inventaire devnet sur lequel ça repose. C'est le
   document de référence : toute décision d'architecture y est tracée avec les
   alternatives écartées.
1. Plans d'exécution par chantier :
   [le coffre](./plans/2026-07-31-coffre-implementation.md) (clos) et
   [le module de conformité](./plans/2026-07-31-hook-conformite-plan.md)
   (ouvert).
2. [Spikes d'ouverture](./plans/2026-07-31-spikes-ouverture.md) — les sept
   questions à trancher avant d'écrire du programme.
3. [Journal de preuves](./evidence/) — vide pour l'instant, il se remplit au fil
   des déploiements et des transactions.

Les règles de travail (plan avant code, tout par PR, preuve le jour même) sont
dans [`CONTRIBUTING.md`](../CONTRIBUTING.md) à la racine.

## État des spikes

| Spike | Sujet | Bloquant | État |
|---|---|---|---|
| S1 | Ce qui déclenche réellement le hook de transfert | oui | **rendu** (31/07) |
| S2 | Mesure de couverture sur cible BPF | oui | **rendu** (31/07) |
| S3 | Alignement des versions et amorçage | oui | **clos** (31/07) |
| S4 | Jupiter Lend en CPI | non | à faire |
| S5 | Signature et diffusion Solana via DFNS | non | à faire |
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

**Les trois spikes bloquants ont rendu. L'écriture des programmes peut
commencer.**

S1 conclut que la liste d'autorisation est étanche : aucune voie de mouvement
n'échappe au hook, ni le transfert hérité, ni les transferts confidentiels, ni
la délégation. L'architecture du module de conformité tient telle que conçue.
Une réserve de méthode subsiste et sa levée est programmée : la preuve vient de
la lecture de la source de Token-2022, et l'épreuve empirique prendra la forme
de tests permanents écrits avec le hook, dont la liste est arrêtée dans le
verdict.

Restent S4 à S7, non bloquants, à mener en parallèle de l'écriture. S6 a déjà
livré son résultat par anticipation : la distribution en ligne de commande est
inutilisable sur devnet, le robinet web plafonne à deux requêtes par tranche de
huit heures, et ce plafond contraint le rythme des déploiements.

Chaque spike inscrit son verdict, ses adresses et ses signatures directement
dans le document de spikes, daté. Un spike sans verdict écrit n'a pas eu lieu.

## Où en est le code

Le coffre est **complet et déployé sur devnet** : dépôt, parts proportionnelles,
retrait, coupe-circuit. 45 tests, arithmétique pure couverte à 100 %, quatre
contrôles d'intégration continue obligatoires. Preuves dans
[`evidence/vault-core.md`](./evidence/vault-core.md).

Réserve écrite dans cette preuve et qu'il faut connaître : aucun coffre n'est
encore initialisé sur devnet, et aucun dépôt n'y a été exécuté. Le comportement
est éprouvé dans le simulateur, pas contre le réseau.

Le module de conformité est **écrit et déployé** lui aussi : liste
d'autorisation par PDA, garde interdisant l'appel hors transfert, et les six cas
du spike S1 éprouvés contre de vrais transferts. Preuves dans
[`evidence/compliance-hook.md`](./evidence/compliance-hook.md).

## Ce qui n'est pas encore là

Aucun mint n'est gouverné par le hook sur devnet, aucun coffre n'y est
initialisé, aucun dépôt n'y a été exécuté. Tout est éprouvé dans le simulateur.
Lever cette réserve demande un client capable de composer les instructions,
c'est-à-dire la démonstration web, qui n'existe pas.

Restent aussi le paquet d'onboarding, l'allocateur, le schéma d'événements et
les spikes S4 à S7.
