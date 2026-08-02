# Paquet de provisionnement sans portefeuille - plan

Chantier ouvert le 2 août 2026. Point 1 du point de reprise, et réalisation du
spike S5 : la chaîne complète, du provisionnement d'un portefeuille chez le
fournisseur de garde jusqu'à une transaction confirmée sur devnet.

| Version | Date | Changement |
|---|---|---|
| 1.0 | 2026-08-02 | Plan initial : cinq briques, garde-fou S5 reformulé, financement par trésorerie |

Conception de référence : `2026-07-31-solana-yield-vault-design.md`, §3.5.
Spike : `2026-07-31-spikes-ouverture.md`, S5.

---

## Ce que ce paquet ajoute, et à qui

Tout ce que ce dépôt sait faire aujourd'hui suppose que l'utilisateur tient une
clé. La ligne de commande signe avec un fichier local ; la démonstration web
signe avec une extension de navigateur. Les deux supposent une phrase de
récupération quelque part.

Le paquet de provisionnement retire cette supposition : le portefeuille est
créé par un fournisseur de garde à partir d'un identifiant, il signe sur
demande, et l'utilisateur ne manipule ni extension ni phrase. C'est le parcours
qu'un dorsal appellerait pour un utilisateur qui n'a jamais entendu parler de
Solana.

Chaque brique est une commande autonome qui imprime **une ligne JSON** sur la
sortie standard, ses erreurs sur la sortie d'erreur, et se laisse appeler en
sous-processus depuis n'importe quel dorsal, quel que soit son langage. C'est
la forme retenue sur le dépôt Stellar et elle a fait ses preuves.

## Le garde-fou S5, reformulé parce qu'il était inapplicable tel qu'écrit

Le spike S5 pose depuis le 02/08 une contrainte d'environnement : **aucun
identifiant de production ne s'approche de ce dépôt**. Elle reste entière. En
revanche, la façon de la faire respecter que l'on imaginait est fausse, et il
vaut mieux le dire avant d'écrire une ligne que de le découvrir après.

**Le fournisseur de garde n'a pas d'URL de bac à sable distincte.** Une seule
API sert le mainnet et les réseaux de test, et l'hôte historiquement présenté
comme celui du bac à sable est déprécié. Vérifié dans la configuration de
référence du dorsal, qui porte l'avertissement en toutes lettres. Il n'existe
donc **aucun contrôle d'URL** capable de séparer la production du reste : le
paquet aurait refusé un hôte qui n'existe plus, et se serait cru protégé.

Ce qui sépare réellement la production du reste, ce sont trois choses, et le
paquet les prend toutes les trois comme verrous :

1. **Le compte de service.** Un compte dédié à cette démonstration, cadré aux
   seules opérations dont les briques ont besoin, distinct de ceux qui servent
   un dorsal. Le paquet ne peut pas le vérifier lui-même, mais il le nomme
   comme préalable et sa création est un geste d'exploitation consigné.
2. **Le réseau.** `SolanaDevnet` est la seule valeur acceptée. Toute autre,
   y compris le mainnet, est refusée à la lecture de la configuration, avant
   le moindre appel. Un réseau de test est vérifiable dans le code ; c'est ce
   verrou qui remplace le contrôle d'URL impossible.
3. **La résidence des identifiants.** Rien dans le dépôt. Le fichier de
   configuration est résolu **hors** de l'arbre de travail, sans repli vers un
   fichier local, et un test de non-régression échoue si le chemin par défaut
   résout un jour à l'intérieur du dépôt. Ce dispositif n'est pas inventé ici :
   il corrige sur ce dépôt-ci, avant l'accident, ce qu'un dépôt voisin a dû
   corriger après.

Et la règle de sortie du spike ne bouge pas : si la chaîne ne peut aboutir
qu'avec un compte de production, elle n'aboutit pas, et c'est un résultat.

## Cinq briques, pas quatre

La conception en annonçait quatre, par transposition du dépôt Stellar. Solana
en impose une cinquième, pour une raison qui n'est pas un détail.

Sur Stellar, un portefeuille neuf est créé et financé par un robinet appelable
en une requête. Sur Solana, la distribution en ligne de commande est bloquée en
pratique sur devnet (constat du spike S3) et le robinet de l'émetteur de l'actif
plafonne à deux demandes par tranche de huit heures, par adresse, via une page
web. **Aucun robinet n'est appelable par programme pour un portefeuille neuf.**

Le financement vient donc de la clé de trésorerie, ce que la conception avait
anticipé sans en tirer la conséquence : c'est une brique, pas une note de bas de
page.

| Brique | Ce qu'elle fait | Ce qui signe |
|---|---|---|
| `provisionner` | Crée le portefeuille sur `SolanaDevnet` | le fournisseur de garde |
| `financer` | Dote l'adresse en SOL, en actif, et ouvre ses deux comptes de jeton | la clé de trésorerie, localement |
| `enveloppe` | Compose le dépôt et rend la transaction non signée | rien |
| `diffuser` | Fait signer et diffuser, puis attend la confirmation on-chain | le fournisseur de garde |
| `parcours` | Enchaîne les quatre depuis un seul identifiant | les deux, chacun son tour |

## Deux approches pour les frais, et pourquoi la plus simple gagne

Le portefeuille créé est vide, et une transaction Solana exige un payeur de
frais qui signe.

**(A) Le portefeuille du fournisseur paie ses propres frais.** La trésorerie lui
transfère un peu de SOL avant tout geste. Un seul signataire par transaction,
donc le point d'entrée de diffusion du fournisseur suffit : il signe et diffuse
en un appel. Fichiers touchés : les cinq briques, rien d'autre.

**(B) La trésorerie paie les frais, le portefeuille signe le dépôt.** Deux
signataires sur une même transaction. Le point d'entrée de diffusion ne convient
plus, puisqu'il signe et diffuse d'un bloc : il faudrait demander une signature
seule, l'assembler avec la nôtre, puis diffuser nous-mêmes. L'utilisateur n'a
alors jamais besoin de SOL, ce qui est la forme d'un vrai parcours de
production.

**(A) est retenue.** La question de S5 est « la chaîne tient-elle de bout en
bout ? » : y répondre en empruntant le chemin nominal du fournisseur, celui que
sa documentation décrit et que le dépôt Stellar a déjà éprouvé, isole ce qui est
mesuré. (B) ajoute un assemblage de signatures hors ligne, donc une seconde
source d'échec, dans le spike qui doit précisément dire si la première marche.
Et (A) donne un portefeuille qui détient réellement du SOL, ce qui est le
comportement d'un portefeuille sous garde, pas un artifice de démonstration.

(B) reste la forme visée le jour où le parcours passe à l'échelle, et le point
de reprise le notera : financer chaque utilisateur en SOL ne tient pas au delà
de la démonstration.

## Deux approches pour les comptes de jeton, et la même logique

Déposer exige deux comptes associés : celui de l'actif, qui doit contenir les
fonds, et celui des parts, qui recevra la frappe.

**(A) La brique `financer` les ouvre toutes les deux**, aux frais de la
trésorerie. Transférer l'actif à l'adresse exige de toute façon que son compte
existe : la brique doit donc déjà savoir en ouvrir un. Ouvrir le second au même
moment ne coûte qu'une instruction.

**(B) L'enveloppe ouvre le compte de parts**, comme le fait la démonstration
web, où le visiteur paie sa propre location.

**(A) est retenue**, pour une raison de fenêtre de validité : une empreinte de
bloc Solana expire en quelques dizaines de secondes, et le fournisseur de garde
documente lui-même une contrainte de quatre-vingt-dix secondes entre
construction et diffusion. Tout ce qui peut être fait avant, sans le
fournisseur, doit l'être : l'enveloppe se réduit alors à la seule instruction de
dépôt, construite au dernier moment.

Le compte de parts est ouvert par le programme dédié, qui calcule sa taille
depuis les extensions imposées par le mint. Aucune taille n'est calculée à la
main, et c'est ce qui rend l'ouverture correcte face à un jeton Token-2022 à
crochet.

## Ce qui ne demande aucun compte, et ce qui en demande un

La séparation est nette, et elle est le seul moyen de bâtir le paquet avant que
le compte de service existe.

Composition de l'enveloppe, lecture de la configuration, refus d'un réseau non
conforme, résolution du fichier d'identifiants, orchestration du parcours,
formatage des sorties JSON, codes de sortie : **tout cela se teste hors ligne**,
sans le moindre identifiant, et c'est ce que la CI exécutera. Le dépôt Stellar
tient la même ligne et ses tests passent sans configuration.

Ne demandent un compte que les appels réels au fournisseur, c'est-à-dire la
preuve finale : un portefeuille créé, une transaction signée, confirmée sur
devnet, sa signature consignée dans `docs/evidence/`.

## Fichiers

Le paquet vit sous `onboarding/`, nom retenu par la conception et par le dépôt
Stellar, pour qu'un lecteur qui compare les deux y retrouve la même forme.

`onboarding/package.json`, `tsconfig.json`, `.env.example`, `README.md`.

`onboarding/src/env.ts` : résolution du fichier d'identifiants hors du dépôt,
sans repli. `config.ts` : lecture stricte, refus de tout réseau autre que celui
de test. `dfns.ts` : construction du client du fournisseur. Puis une brique par
fichier, `provisionner.ts`, `financer.ts`, `enveloppe.ts`, `diffuser.ts`,
`parcours.ts`, et leurs commandes sous `src/cli/`.

`onboarding/test/` : un fichier par module. Les briques qui appellent le réseau
reçoivent leurs dépendances en argument, ce qui les rend testables sans réseau ;
c'est déjà la forme de l'orchestrateur du dépôt Stellar.

`.github/workflows/ci.yml` : un septième contrôle, `onboarding`, qui installe le
paquet client puis celui-ci, vérifie les types et exécute les tests.

## Vérification

```
cd onboarding && npx tsc --noEmit && npm test
```

Puis les contrôles inchangés du dépôt, et le contrôle de fuite avant
publication, qui doit désormais nommer aussi les variables d'identifiants.

La preuve on-chain vient après, et elle nommera son cluster et son
environnement, comme le garde-fou l'exige.

## Gestes qui ne sont pas les miens

Créer le compte de service dédié à cette démonstration, cadré, chez le
fournisseur de garde. Son API refuse cette création à un compte de service : il
faut passer par la console. Puis déposer ses valeurs dans le fichier
d'identifiants, hors du dépôt, en droits restreints.

Sans ce geste, le paquet se construit, se teste et se relit entièrement. Il ne
peut simplement pas rendre sa preuve.
