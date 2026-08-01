# Démonstration web - une page publique que quiconque peut essayer

## 2026-08-01 - La démonstration est en ligne

**Ce que ça prouve** : le coffre n'exige plus de cloner le dépôt ni de tenir une
clé locale. N'importe qui, depuis un navigateur et un portefeuille, peut
déposer, retirer et transférer des parts, et voir le contrôle d'éligibilité
refuser un transfert.

**Cluster** : Solana **devnet**. **URL** : <https://solana.for-yield.com>.

| Élément | Valeur |
|---|---|
| Hébergement | Render, service statique `foryield-solana-demo` |
| Blueprint | `render.yaml`, à la racine du dépôt |
| Construction | `npm ci --prefix client && npm ci --prefix web && npm run build --prefix web` |
| Publication | `web/out`, export statique Next.js |
| Domaine | CNAME chez Cloudflare, sans proxy |
| Point d'accès | dédié, restreint à son domaine d'origine |

Pull requests : [#24](https://github.com/Foryield/solana-yield-vault/pull/24)
la page, [#25](https://github.com/Foryield/solana-yield-vault/pull/25) le
blueprint, [#26](https://github.com/Foryield/solana-yield-vault/pull/26) la
forme, [#27](https://github.com/Foryield/solana-yield-vault/pull/27) le point
d'accès.

## Ce que le déploiement a appris, et qu'aucun raisonnement n'avait donné

**Render installe les dépendances de sa racine de construction AVANT d'exécuter
la commande de construction.** Avec `rootDir: web`, cette installation
automatique déclenchait le script `prepare` du paquet client, lié en `file:`,
alors que ses propres outils n'étaient pas encore posés. La construction
s'arrêtait sur « Cannot find type definition file for 'node' », qui ne nomme
rien de la vraie cause. La commande du blueprint avait pourtant été rejouée
depuis un arbre vierge : répéter sa propre commande ne répète pas ce que la
plateforme fait avant elle.

**Un sous-domaine demande deux gestes, pas un.** Le CNAME chez Cloudflare ne
suffit pas : le domaine doit aussi être déclaré sur le service Render, qui sert
plusieurs sites derrière la même adresse et n'accepte un hôte qu'après
l'avoir enregistré. Sans cette déclaration, Cloudflare rend un 403 « DNS points
to prohibited IP » qui désigne le DNS alors que le DNS est juste.

**Le point d'accès public de devnet ne tient pas une page publique.** Il
plafonne à 100 requêtes par tranche de 10 secondes et par IP, 40 pour un même
appel, et la documentation Solana dit qu'il n'est pas destiné aux applications.
Quelques rechargements suffisent à le franchir : constaté en vérifiant la page,
qui est passée en lecture impossible et y est restée.

## Le point d'accès dédié, mesuré

Le paquet servi porte l'URL du point d'accès dédié et **aucune occurrence** du
point d'accès public. Soixante appels `getAccountInfo` consécutifs contre cette
URL, avec l'origine de la page : soixante réponses 200, là où le point d'accès
public en refuse au-delà de quarante par tranche de dix secondes.

Sa clé n'est **pas dans ce dépôt** et n'y entrera pas : le blueprint la déclare
`sync: false`, ce qui la fait saisir au tableau de bord de l'hébergeur et
ignorer à chaque synchronisation. Un export statique n'ayant aucun serveur pour
la cacher, elle finit dans le paquet servi, ce qui a été vérifié plutôt que
supposé ; c'est sa **restriction au domaine d'origine** qui la protège, et rien
d'autre.

## Ce que cette entrée ne prouve pas

**La signature des trois gestes depuis la page n'a pas été exercée par nous.**
Elle demande une extension de portefeuille, que l'outillage de vérification
n'a pas. La composition des instructions, elle, est celle du paquet client,
éprouvée par ses propres tests et par la preuve du transfert contre le réseau.

**L'écran une fois connecté n'a pas été regardé.** Le reste de la page l'a été,
et trois défauts y ont été trouvés que la lecture du code n'aurait pas donnés :
un bouton large comme son texte parce que son conteneur est déclaré en ligne,
le même deux fois trop haut faute d'avoir neutralisé une hauteur de ligne, et
un libellé anglais au milieu d'une page française.
