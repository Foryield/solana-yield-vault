# Spikes d'ouverture - dérisquage avant écriture

Ouverture du chantier, 31 juillet 2026. Une question par spike, une méthode, un
critère de sortie, une journée maximum. Un spike qui déborde devient un chantier
et se replanifie.

Conception de référence : `2026-07-31-solana-yield-vault-design.md`.

| Version | Date | Changement |
|---|---|---|
| 1.5 | 2026-08-02 | S5 : la contrainte d'environnement ne peut pas se traduire par un contrôle d'URL, le fournisseur n'ayant pas d'API de bac à sable ; trois verrous à la place |
| 1.4 | 2026-08-02 | S5 : contrainte d'environnement ajoutée avant écriture, aucun identifiant de production ne s'approche de ce dépôt |
| 1.3 | 2026-07-31 | Verdict S1 : la liste d'autorisation est etanche, aucune voie de mouvement n'echappe au hook ; reserve de methode et sa levee programmee |
| 1.2 | 2026-07-31 | S3 CLOS : espace de travail amorce, ossature deployee sur devnet, cout reel et pieges d'exploitation consignes |
| 1.1 | 2026-07-31 | Verdict S2 (la couverture ne porte que sur la logique pure côté hôte, le chemin BPF rend zéro) et verdict partiel S3 (versions tranchées contre le réseau, déploiement devnet restant) |
| 1.0 | 2026-07-31 | Plan initial, 7 spikes |

Aucun programme n'est écrit avant que S1, S2 et S3 aient rendu leur verdict.
Les quatre autres peuvent se mener en parallèle.

---

## S1 - Ce qui déclenche réellement le hook de transfert

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

### Verdict - 2026-07-31

**La liste d'autorisation est étanche. Aucune voie de mouvement n'échappe au
hook.** L'architecture du module de conformité tient, §3.2 de la conception n'est
pas à reprendre.

Établi par lecture du processeur de Token-2022, dépôt `solana-program/token-2022`
épinglé au commit `c572e1d7830f611bc75c4c009e6c9e29ae09f48f` (30 juillet 2026),
crate `spl-token-2022` 11.0.0.

**Le transfert vérifié invoque le hook.** `program/src/processor.rs`, dans
`process_transfer` : le programme récupère l'identifiant du hook depuis le mint,
pose les drapeaux de transfert en cours sur les deux comptes, appelle
`spl_transfer_hook_interface::onchain::invoke_execute`, puis retire les drapeaux.
C'est le seul point d'invocation du chemin ordinaire.

**Le transfert hérité ne contourne rien : il échoue.** Le chemin sans mint tombe
dans une branche qui teste l'extension `TransferHookAccount` sur le compte
source et refuse avec `TokenError::MintRequiredForTransfer`. Un `Transfer` à
l'ancienne sur un mint à hook ne passe donc pas en silence, il est rejeté.

**Et l'extension ne peut pas être esquivée**, ce qui était le vrai risque :
ouvrir un compte dépourvu de `TransferHookAccount` pour retomber dans la branche
permissive. Impossible. Dans `_process_initialize_account`, le programme calcule
la taille requise depuis les extensions du mint, **rejette** un compte trop
petit en `InvalidAccountData`, puis **écrit lui-même** chaque extension requise
via `try_for_each_required_init_account_extension`. La table de correspondance,
dans `interface/src/extension/mod.rs`, fonction `required_init_account_extensions`,
associe explicitement `ExtensionType::TransferHook` à
`ExtensionType::TransferHookAccount`. Le porteur du compte ne choisit pas.

**Les transferts confidentiels n'y échappent pas non plus.** C'était la surface
la plus inquiétante, parce qu'elle emprunte un processeur entièrement distinct :
`program/src/extension/confidential_transfer/processor.rs` invoque le hook selon
le même motif, avec le même encadrement par les drapeaux de transfert en cours.

**Ni la destruction ni la fermeture de compte ne déplacent de valeur vers un
tiers.** La destruction réduit l'offre sans destinataire. La fermeture refuse un
solde non nul (`TokenError::NonNativeHasBalance`). Le délégataire, permanent ou
ordinaire, emprunte le même `process_transfer` : c'est une variante d'autorité,
pas un chemin parallèle, donc le hook s'applique.

### Réserve de méthode, et sa levée programmée

Le plan prescrivait une épreuve sur validateur local. La réponse a été obtenue
par lecture de la source, ce qui est d'une nature différente : un test prouve un
chemin, la source les prouve tous, mais elle ne prouve pas que le binaire
déployé correspond à cette source.

Décision prise le 31/07 : ne pas monter de harnais jetable, et transformer
l'épreuve empirique en **tests permanents du hook**, écrits avec lui. Les mêmes
voies sont couvertes, par une suite qui reste et protège d'une régression, au
lieu d'un montage abandonné après usage. Le coût marginal est nul, ces tests
devant exister de toute façon.

Ce que cette suite devra couvrir, pour que la réserve soit effectivement levée
et non oubliée :

1. transfert vérifié vers une adresse autorisée : le hook est appelé, le
   transfert aboutit ;
2. transfert vérifié vers une adresse non autorisée : le hook refuse, la
   transaction est annulée ;
3. transfert hérité sur le mint des parts : échec attendu, et vérifier que le
   code d'erreur est bien celui du mint manquant, pas un succès silencieux ;
4. transfert par délégataire vers une adresse non autorisée : refusé ;
5. fermeture d'un compte au solde non nul : refusée ;
6. tentative d'ouverture d'un compte de parts sans l'extension requise : la
   taille calculée doit la rendre impossible.

Le point 3 est le témoin qui compte : c'est celui qui échouerait en silence si
une version future de Token-2022 assouplissait la garde.

## S2 - Mesure de couverture sur des programmes Anchor

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

### Verdict - 2026-07-31

**Une couverture est mesurable, mais uniquement sur de la logique pure
compilée côté hôte. Le chemin BPF ne rend rien du tout.**

Mesuré sur un programme témoin issu de `anchor init` en 1.1.2, avec
`cargo-llvm-cov 0.8.7`.

L'ossature par défaut d'Anchor 1.1.2 ne teste plus en TypeScript avec Mocha
mais en **Rust avec LiteSVM** (`[scripts] test = "cargo test"`,
`litesvm 0.10.0` en dépendance de développement). Le test charge le `.so`
compilé et l'exécute en BPF. Résultat mesuré sur un test qui passe et exerce
les deux instructions du programme :

```
instructions/increment.rs    12 lignes    0.00%
instructions/initialize.rs   13 lignes    0.00%
lib.rs                        6 lignes    0.00%
```

Zéro. C'est structurel et non accidentel : le code instrumenté côté hôte n'est
jamais exécuté, la logique tournant dans la machine virtuelle BPF.

Contre-épreuve dans le même programme : un module de logique pure ajouté sous
`src/`, une math de parts avec ses gardes, couvert par cinq tests unitaires
`#[cfg(test)]` compilés côté hôte :

```
shares.rs                    30 lignes  100.00%   (6/6 fonctions, 97,50 % de régions)
```

**Conséquence pour l'architecture**, à répercuter en §3.1 de la conception :
l'arithmétique de parts, la valorisation, les arrondis et les gardes vivent
dans des fonctions pures testées côté hôte ; les gestionnaires Anchor se
réduisent à du câblage, exercé par LiteSVM mais non mesuré. Un seuil de
couverture ne porte que sur le premier ensemble, et c'est défendable : il
couvre la partie où un défaut coûte cher, le câblage restant couvert par des
tests de comportement.

Position plus saine que celle de Soroban, où il avait fallu exclure les
fichiers de test pour que le seuil morde encore. Ici la frontière est
naturelle. Le piège Soroban ne se reproduit pas : les tests d'intégration
vivent sous `tests/`, hors du périmètre mesuré, et les tests unitaires
`#[cfg(test)]` d'un module pur n'en gonflent pas artificiellement le
dénominateur.

**Piège d'outillage rencontré, et sa correction.** `cargo-llvm-cov` échoue
d'emblée sur l'ossature générée, avec un message qui ne nomme pas la cause :

```
error: couldn't read .../target/llvm-cov-target/tmp/../deploy/scaffold1.so:
No such file or directory
```

L'ossature code le chemin du binaire en dur à la compilation :

```rust
include_bytes!(concat!(env!("CARGO_TARGET_TMPDIR"), "/../deploy/prog.so"))
```

Or `cargo-llvm-cov` redirige le répertoire cible vers
`target/llvm-cov-target`, donc `CARGO_TARGET_TMPDIR` devient
`target/llvm-cov-target/tmp` et `../deploy` désigne un répertoire vide, quand
`anchor build` écrit toujours dans `<workspace>/target/deploy`.

Correction retenue, **vérifiée** : lecture à l'exécution plutôt qu'à la
compilation, les deux emplacements essayés dans l'ordre. `include_bytes!` ne
peut pas être rendu conditionnel, la macro exigeant un chemin littéral connu à
la compilation. L'assistant doit vivre sous `tests/common/mod.rs` et non sous
`src/` : `CARGO_TARGET_TMPDIR` n'est défini que pour les cibles de test
d'intégration, et la bibliothèque ne compile pas si elle y fait appel.

```rust
pub fn program_binary(name: &str) -> Vec<u8> {
    let tmp = PathBuf::from(env!("CARGO_TARGET_TMPDIR"));
    let file = format!("{name}.so");
    // 1. cargo test     : <ws>/target/tmp/../deploy
    // 2. cargo llvm-cov : <ws>/target/llvm-cov-target/tmp/../../deploy
    let candidates = [
        tmp.join("..").join("deploy").join(&file),
        tmp.join("..").join("..").join("deploy").join(&file),
    ];
    for path in &candidates {
        if let Ok(bytes) = std::fs::read(path) {
            return bytes;
        }
    }
    panic!("binaire {file} introuvable. Lancer `anchor build` d'abord. \
            Chemins essayes : {}",
        candidates.iter().map(|p| p.display().to_string())
            .collect::<Vec<_>>().join(", "));
}
```

Vérifié en supprimant toute copie manuelle du `.so` : `cargo test` et
`cargo llvm-cov` passent tous deux, sans intervention. À appliquer dès
l'amorçage de l'espace de travail.

## S3 - Alignement des versions et amorçage de l'espace de travail

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

### Verdict partiel - 2026-07-31

**Versions tranchées contre le réseau. Reste le déploiement devnet.**

Le runtime devnet annonce `solana-core 4.1.2`, le mainnet 4.1.0, tous deux sur
le jeu de fonctionnalités 3345198602. Agave **4.1.2** installé, et le contrôle
qui compte est concluant : le CLI rend `feat:c763ae0a`, soit exactement ces
3345198602 en hexadécimal. Même version et même état de fonctionnalités que le
réseau visé, pas seulement le même numéro.

La réserve sur la documentation était fondée, et au-delà de ce qui était
supposé : la page d'installation d'Anchor annonce Agave 2.0.26, **deux versions
majeures de retard**. La suivre installe une chaîne inutilisable.

Anchor **1.1.2**, dernière version stable (26 juin 2026), installée en binaire
précompilé `aarch64-apple-darwin`, empreinte SHA-256
`64e64a741d7a8f09b055efe5d44e90059cf4e7ddd225aee95354958505af7f4a`. marginfi
épingle encore Anchor 1.0.2 avec Solana 3.1.13 : leur pin est en retard sur le
réseau et ne sert donc pas de référence, contrairement à ce que la conception
supposait.

Rust : `anchor init` génère un `rust-toolchain.toml` épinglé sur le canal
1.89.0, avec `edition = "2021"` dans le `Cargo.toml` d'espace de travail.

Chaîne éprouvée de bout en bout sur le programme témoin : `anchor build` produit
le `.so` et l'IDL, `cargo test` passe, `cargo llvm-cov` mesure (après la
correction consignée en S2).

### Verdict - S3 CLOS le 2026-07-31

Espace de travail amorcé et ossature déployée sur devnet. Identifiant, adresses,
signatures et coût dans [`docs/evidence/bootstrap.md`](../evidence/bootstrap.md).
`cargo test`, `cargo fmt --check` et `cargo clippy -- -D warnings` au vert.

Trois acquis d'exploitation à retenir au-delà du spike.

Le coût réel du déploiement est de **0,403 SOL** pour un binaire de 57 Ko,
contre 0,795 estimés : `anchor deploy` dimensionne le compte de données à la
taille exacte du binaire, pas au double comme le suppose le calcul de dépôt
courant. En contrepartie, toute croissance du programme exigera un
`solana program extend` et le dépôt correspondant. À budgéter pour le vrai
coffre, nettement plus gros.

`anchor build` **réécrit `Anchor.toml`** et efface les commentaires placés entre
les sections. Les garder en tête de fichier, sans quoi la justification des
versions disparaît au premier build.

La distribution en ligne de commande (`solana airdrop`) est bloquée en pratique
sur devnet, à 2 comme à 0,5 SOL. Le robinet web reste la seule voie, deux
requêtes par tranche de huit heures. Ce plafond est le vrai résultat de S6 par
anticipation, et il contraint le rythme des déploiements.

## S4 - Jupiter Lend en CPI

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

## S5 - Signature et diffusion Solana via DFNS

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

**Contrainte ajoutée le 2026-08-02, avant d'écrire une ligne.** Ce spike est le
premier moment où ce dépôt public touchera des identifiants d'un fournisseur de
garde. C'est donc le moment où le mauvais compte peut entrer, et un contrôle a
justement trouvé des identifiants de **production** employés là où ils n'avaient
rien à faire, sur un chantier voisin. On ne recommence pas.

- **Environnement de test uniquement.** Aucun identifiant de production ne
  s'approche de ce dépôt, ni de son environnement de construction, ni de son
  hébergement. Un portefeuille de démonstration sur un réseau de test ne
  justifie jamais un compte qui tient de la valeur réelle.
- **Rien dans le dépôt.** Les identifiants se lisent depuis l'environnement,
  comme le fait déjà `ops/src/config.ts`, et le dépôt n'en porte que les noms.
  Le contrôle de fuite avant publication doit les nommer.
- **Jamais côté navigateur.** La signature par un fournisseur de garde est un
  geste de dorsal. La démonstration web signe avec le portefeuille du visiteur
  et n'a aucune raison de connaître ces identifiants : un export statique
  n'ayant pas de serveur, tout ce qu'il reçoit devient public.
- **La preuve nomme son environnement**, comme elle nomme déjà son cluster.

Si le spike ne peut aboutir qu'avec un compte de production, il n'aboutit pas :
c'est un résultat, et il se consigne comme tel.

**Correction du 2026-08-02, avant écriture également.** « Environnement de
test » ne peut pas se traduire par un contrôle d'URL, contrairement à ce que
supposait la rédaction ci-dessus. Le fournisseur de garde **n'a pas d'API de bac
à sable distincte** : un seul hôte sert le mainnet et les réseaux de test, et
l'hôte historiquement présenté comme celui du bac à sable est déprécié. Un
paquet qui aurait refusé tout hôte sauf ce dernier aurait refusé le seul qui
existe, tout en se croyant protégé.

Ce qui sépare réellement la production du reste tient en trois verrous, et le
paquet les prend tous les trois : un **compte de service dédié** à cette
démonstration et cadré à ses seules opérations ; le **réseau**, `SolanaDevnet`
étant la seule valeur acceptée, tout autre refusée à la lecture de la
configuration ; la **résidence des identifiants**, hors du dépôt, sans repli, et
sous test de non-régression. Le second est le seul des trois qu'un programme
puisse vérifier lui-même, et c'est lui qui remplace le contrôle d'URL
impossible.

Détail et suite dans
[`2026-08-02-paquet-provisionnement-plan.md`](./2026-08-02-paquet-provisionnement-plan.md).

## S6 - Trésorerie devnet et runbook de distribution

**Question.** Comment financer une série de portefeuilles de démonstration en
SOL, USDC et EURC sans buter sur les plafonds des robinets ?

**Méthode.** Mesurer les plafonds réels : distribution SOL par le RPC devnet,
robinet Circle pour USDC et EURC. Établir une clé de trésorerie, l'alimenter, et
écrire le script de distribution ainsi que le runbook de recharge.

**Critère de sortie.** Une trésorerie approvisionnée, un script de distribution
éprouvé sur trois adresses, et le coût en temps d'une recharge documenté. Ce
spike n'est pas technique, il est logistique.

## S7 - Validateur local forké du mainnet

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
