# Spikes d'ouverture — dérisquage avant écriture

Ouverture du chantier, 31 juillet 2026. Une question par spike, une méthode, un
critère de sortie, une journée maximum. Un spike qui déborde devient un chantier
et se replanifie.

Conception de référence : `2026-07-31-solana-yield-vault-design.md`.

| Version | Date | Changement |
|---|---|---|
| 1.0 | 2026-07-31 | Plan initial, 7 spikes |

Aucun programme n'est écrit avant que S1, S2 et S3 aient rendu leur verdict.
Les quatre autres peuvent se mener en parallèle.

---

## S1 — Ce qui déclenche réellement le hook de transfert

**Bloquant.** C'est le spike qui décide si le module de conformité tient.

**Question.** Quelles instructions de Token-2022 invoquent le programme de hook,
et que fait Token-2022 face à une instruction de transfert qui ne l'invoque pas ?
Si une voie de mouvement de parts existe sans passer par le hook, la liste
d'autorisation ne vaut rien.

**Méthode.** Sur un validateur local, créer un mint Token-2022 portant
l'extension de hook pointant vers un programme témoin qui journalise et refuse
tout. Puis tenter, une par une, chaque voie de mouvement plausible : le transfert
simple hérité, le transfert vérifié, le transfert avec frais, la délégation puis
le transfert par le délégataire, la fermeture de compte, le brûlage, et le
délégataire permanent si l'extension est présente. Pour chacune : le hook a-t-il
été appelé, et l'opération a-t-elle été rejetée ?

**Critère de sortie.** Un tableau exhaustif des voies de mouvement avec, pour
chacune, appel du hook oui ou non. Verdict écrit : la liste d'autorisation est
étanche, ou elle ne l'est pas et il faut une extension supplémentaire pour la
rendre étanche.

**Risque si négligé.** Écrire le hook, le déployer, le documenter, et découvrir
tard qu'un transfert hérité le contourne.

## S2 — Mesure de couverture sur des programmes Anchor

**Bloquant** pour le seuil d'intégration continue, pas pour l'écriture.

**Question.** Peut-on mesurer une couverture de lignes sur du code de programme
Solana, et à quel niveau ? Les programmes se compilent pour une cible BPF ;
`cargo-llvm-cov` mesure sur des tests compilés pour l'hôte.

**Méthode.** Sur un programme jouet, comparer trois voies : les tests unitaires
Rust compilés pour l'hôte, les tests contre un environnement de simulation en
processus, et les tests d'intégration en TypeScript contre un validateur local.
Mesurer ce que `cargo-llvm-cov` rend dans chaque cas. Vérifier au passage que le
filtre d'exclusion des fichiers de test se transpose.

**Critère de sortie.** Un chiffre reproductible sur le programme jouet et un
seuil défendable, ou le constat argumenté qu'aucun seuil de ce type n'a de sens
sur Solana, auquel cas la garantie de remplacement se définit avant d'écrire la
moindre ligne.

**Note.** Sur Soroban, le seuil n'était mordant qu'après exclusion des fichiers
de test, qui vivent dans `src/`. Vérifier si la convention Anchor pose le même
piège.

## S3 — Alignement des versions et amorçage de l'espace de travail

**Bloquant.** Rien ne se compile avant.

**Question.** Quel triplet Anchor, Agave et Rust est aligné sur le runtime devnet
du jour ?

**Méthode.** Installer `avm`, Anchor et la chaîne d'outillage Agave. Lire la
version du runtime devnet réel plutôt que la documentation : la page
d'installation d'Anchor annonce Agave 2.0.26 alors que la ligne de publication
courante est en 4.x, et marginfi, dépôt de production, épingle
`anchor_version = "1.0.2"` avec `solana_version = "3.1.13"`. Amorcer l'espace de
travail, compiler un programme vide, le déployer sur devnet, en lire
l'identifiant.

**Critère de sortie.** Un `Anchor.toml` épinglé, un programme vide déployé sur
devnet dont l'identifiant est consigné dans `docs/evidence/`, et la première
preuve du dépôt.

## S4 — Jupiter Lend en CPI

**Question.** Les quatre marchés du programme Lending devnet portent-ils bien
USDC et EURC en actif sous-jacent, et une CPI de dépôt puis de retrait
fonctionne-t-elle depuis un programme à nous ?

**Méthode.** Récupérer l'IDL du programme devnet et décoder proprement les
quatre comptes de marché, plutôt que de se fier au décodage positionnel du
relevé du 31 juillet. Puis écrire un programme jouet qui construit l'instruction
à la main, discriminateur `sha256("global:deposit")[0..8]` suivi du montant en
`u64` petit-boutiste, et l'invoque avec les dix-sept comptes. Lire au préalable
l'intégration de référence de marginfi, qui déclare les trois programmes Jupiter
Lend en localnet dans son `Anchor.toml`.

**Critère de sortie.** Un dépôt et un retrait réussis sur devnet, signatures
consignées, et la mécanique de valorisation du jeton de reçu comprise : de quel
compte se lit le taux, et comment il convertit un solde de reçu en unités
d'actif.

## S5 — Signature et diffusion Solana via DFNS

**Question.** La chaîne complète tient-elle de bout en bout, du provisionnement
du portefeuille à la confirmation d'une transaction Solana signée par le
fournisseur de garde ?

**Méthode.** Reprendre la chaîne éprouvée sur Stellar en l'adaptant :
provisionner un portefeuille sur `SolanaDevnet`, financer le compte, construire
la transaction, obtenir la signature, diffuser, confirmer. Identifier le point
d'entrée de diffusion adapté à Solana et le format attendu.

**Critère de sortie.** Une transaction Solana signée par un portefeuille DFNS,
confirmée sur devnet, signature consignée. C'est le socle du paquet
`onboarding/`.

## S6 — Trésorerie devnet et runbook de distribution

**Question.** Comment financer une série de portefeuilles de démonstration en
SOL, USDC et EURC sans buter sur les plafonds des robinets ?

**Méthode.** Mesurer les plafonds réels : distribution SOL par le RPC devnet,
robinet Circle pour USDC et EURC. Établir une clé de trésorerie, l'alimenter, et
écrire le script de distribution ainsi que le runbook de recharge.

**Critère de sortie.** Une trésorerie approvisionnée, un script de distribution
éprouvé sur trois adresses, et le coût en temps d'une recharge documenté. Ce
spike n'est pas technique, il est logistique.

## S7 — Validateur local forké du mainnet

**Question.** Peut-on cloner les comptes du mainnet nécessaires à un échange
Jupiter Swap dans un validateur local, et y exécuter une conversion USDC vers
EURC ?

**Méthode.** marginfi montre le motif en déclarant Kamino, Drift et Jupiter Lend
en programmes de localnet. Cloner le programme d'agrégation et les comptes de
pool que la route mainnet emprunte, puis rejouer la conversion hors ligne.

**Critère de sortie.** Une conversion USDC vers EURC exécutée dans le validateur
local, reproductible par une commande consignée, avec la provenance de chaque
compte cloné épinglée. C'est ce qui rend le chemin Jupiter Swap défendable sans
prétendre qu'il tourne sur devnet.

---

## Séquencement

S1, S2 et S3 d'abord, dans cet ordre, parce qu'ils conditionnent respectivement
le module de conformité, la garantie de qualité et la compilation. S4, S5, S6 et
S7 se mènent ensuite en parallèle, S4 et S7 sur la piste de la chaîne, S5 et S6
sur la piste périphérique.

Chaque spike produit une entrée dans ce document, datée, avec son verdict, ses
adresses et ses signatures. Un spike sans verdict écrit n'a pas eu lieu.
