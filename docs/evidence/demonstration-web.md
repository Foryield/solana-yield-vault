# Démonstration web - une page publique que quiconque peut essayer

## 2026-08-02 - Les gestes sont signés depuis la page, et un bug de confirmation est corrigé

**Ce que ça prouve** : dépôt et retrait ont été signés depuis la page avec
Phantom, et sont passés sur devnet. Les deux points qui attendaient un
portefeuille sont donc levés, l'écran connecté avec eux.

**Et ce que ça a révélé** : l'interface se figeait après la signature, puis
affichait « Signature ... has expired: block height exceeded », alors que la
transaction était confirmée depuis longtemps et que les soldes bougeaient bien.
Signalé sur les deux gestes, capture à l'appui, avec la transaction
`59M24QFnim65hrQ5kxo5ViHqV2pFwERK1eUf3JPpmZza1rYXzzdPA9CqFQzVotavV25wqG9pNLtGCNjyW8vYf9Cb`.

**La cause, mesurée et non supposée.** La page confirmait par
`connection.confirmTransaction`, qui s'abonne à `signatureSubscribe` par
WebSocket. Le point d'accès dédié accepte la connexion WebSocket mais **refuse
les abonnements** :

```
signatureSubscribe -> {"code":-32601,"message":"Method 'signatureSubscribe' not found"}
slotSubscribe      -> {"code":-32601,"message":"Method 'slotSubscribe' not found"}
```

La notification n'arrivait donc jamais. Au bout de la fenêtre de validité du
bloc, web3.js déclarait la signature expirée : un message faux sur les deux
plans, puisque rien n'avait expiré et que tout avait réussi.

**C'était une régression de notre fait.** Le point d'accès public de devnet sert
les abonnements ; le point d'accès dédié adopté le 01/08 pour échapper à sa
limite de débit ne les sert pas. Le remède a introduit le mal, et personne ne
pouvait le voir : il ne se manifeste qu'après une signature, c'est-à-dire
exactement le geste qu'aucune vérification automatique ne pouvait faire.

**La correction** : confirmation par sondage HTTP de `getSignatureStatuses`, la
méthode que la ligne de commande de provisionnement emploie déjà. L'expiration
se juge désormais sur la **hauteur de bloc**, seul critère qui distingue une
transaction perdue d'une transaction lente. En cas d'échec on-chain, les
journaux sont récupérés par `getTransaction` pour que le motif du refus reste
lisible, ce que le statut seul ne porte pas.

**La sonde a été étendue** au même moment. Elle vérifiait que le coffre se lit ;
elle vérifie maintenant aussi que `getSignatureStatuses` répond, c'est-à-dire la
capacité dont dépend réellement l'affichage. Une sonde qui n'exerce pas la
dépendance ne la protège pas.

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
