/**
 * Program IDL in camelCase format in order to be used in JS/TS.
 *
 * Note that this is only a type helper and is not the actual IDL. The original
 * IDL can be found at `target/idl/allocator.json`.
 */
export type Allocator = {
  "address": "11111111111111111111111111111111",
  "metadata": {
    "name": "allocator",
    "version": "0.1.0",
    "spec": "0.1.0",
    "description": "Allocateur : place l'actif d'un coffre sur des venues de rendement"
  },
  "instructions": [
    {
      "name": "deposerJupiterLend",
      "docs": [
        "Depose `actif` unites sur Jupiter Lend depuis la position du coffre.",
        "",
        "Le plancher n'est PAS un argument : il est calcule sur la chaine, apres",
        "rafraichissement des prix, par le module d'arithmetique deja mesure",
        "contre le marche reel. Le faire venir de l'exterieur laisserait un",
        "appelant desarmer la protection en passant zero."
      ],
      "discriminator": [
        189,
        7,
        174,
        6,
        15,
        144,
        8,
        23
      ],
      "accounts": [
        {
          "name": "operateur",
          "docs": [
            "Declencheur. L'etape 1 ne lui demande que de signer la transaction ;",
            "l'etape 2 attachera une autorite verifiee a la position."
          ],
          "signer": true
        },
        {
          "name": "coffre",
          "docs": [
            "Coffre servi. Employe UNIQUEMENT comme graine de la position : aucune",
            "donnee n'en est lue, ce qui evite de lier l'allocateur a la disposition",
            "du compte de coffre."
          ]
        },
        {
          "name": "marche",
          "docs": [
            "Compte de marche de la venue, decode par `lire_marche` APRES le",
            "rafraichissement des prix."
          ],
          "writable": true
        },
        {
          "name": "position",
          "docs": [
            "Autorite de signature de la position, une par couple coffre et marche.",
            "Sans donnees a l'etape 1 : elle signe et detient, elle ne raconte rien.",
            "",
            "DECLAREE MUTABLE, ET C'EST OBLIGATOIRE plutot que prudent. La venue",
            "attend son signataire en ECRITURE, son IDL le declarant `writable`. Une",
            "invocation croisee ne peut jamais accorder plus de droits qu'elle n'en a",
            "recus : sans `mut` ici, le programme demande une elevation et l'execution",
            "s'arrete sur « writable privilege escalated », qui nomme le compte mais",
            "pas la cause. Constate sur devnet le 04/08, pas deduit.",
            "",
            "graines, donc un compte etranger ne peut pas se presenter ici."
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  111,
                  115,
                  105,
                  116,
                  105,
                  111,
                  110
                ]
              },
              {
                "kind": "account",
                "path": "coffre"
              },
              {
                "kind": "account",
                "path": "marche"
              }
            ]
          }
        },
        {
          "name": "actifDeLaPosition",
          "docs": [
            "Actif detenu par la position, source du depot."
          ],
          "writable": true
        },
        {
          "name": "recuDeLaPosition",
          "docs": [
            "Jetons de recu detenus par la position, destination du depot. C'est le",
            "solde de CE compte qui mesure ce que la venue a reellement emis."
          ],
          "writable": true
        },
        {
          "name": "actif"
        },
        {
          "name": "jetonDeRecu",
          "writable": true
        },
        {
          "name": "administration"
        },
        {
          "name": "reservesDeLiquidite",
          "writable": true
        },
        {
          "name": "positionDeLiquidite",
          "writable": true
        },
        {
          "name": "modeleDeTaux"
        },
        {
          "name": "coffreDeLaVenue",
          "writable": true
        },
        {
          "name": "liquidite",
          "writable": true
        },
        {
          "name": "programmeDeLiquidite",
          "writable": true
        },
        {
          "name": "modeleDeRecompenses"
        },
        {
          "name": "programmeDePret"
        },
        {
          "name": "programmeDeJeton"
        },
        {
          "name": "programmeDeCompteAssocie"
        },
        {
          "name": "programmeSysteme"
        }
      ],
      "args": [
        {
          "name": "actif",
          "type": "u64"
        }
      ]
    },
    {
      "name": "retirerJupiterLend",
      "docs": [
        "Retire `actif` unites de Jupiter Lend en brulant au plus",
        "`parts_maximales` jetons de recu.",
        "",
        "Le plafond, LUI, est un argument, et l'asymetrie avec le depot est",
        "argumentee dans l'en-tete du gestionnaire : la conversion inverse n'a",
        "jamais ete mesuree, et une borne deduite plutot que mesuree ferait",
        "echouer tous les retraits."
      ],
      "discriminator": [
        159,
        47,
        138,
        61,
        195,
        82,
        120,
        225
      ],
      "accounts": [
        {
          "name": "operateur",
          "signer": true
        },
        {
          "name": "coffre"
        },
        {
          "name": "marche",
          "writable": true
        },
        {
          "name": "position",
          "docs": [
            "Mutable pour la meme raison qu'au depot : la venue attend son signataire",
            "en ecriture, et une invocation croisee ne peut pas elever un droit",
            "qu'elle n'a pas recu.",
            "",
            "graines."
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  111,
                  115,
                  105,
                  116,
                  105,
                  111,
                  110
                ]
              },
              {
                "kind": "account",
                "path": "coffre"
              },
              {
                "kind": "account",
                "path": "marche"
              }
            ]
          }
        },
        {
          "name": "actifDeLaPosition",
          "docs": [
            "Actif detenu par la position, destination du retrait."
          ],
          "writable": true
        },
        {
          "name": "recuDeLaPosition",
          "docs": [
            "Jetons de recu detenus par la position, source du retrait."
          ],
          "writable": true
        },
        {
          "name": "actif"
        },
        {
          "name": "jetonDeRecu",
          "writable": true
        },
        {
          "name": "administration"
        },
        {
          "name": "reservesDeLiquidite",
          "writable": true
        },
        {
          "name": "positionDeLiquidite",
          "writable": true
        },
        {
          "name": "modeleDeTaux"
        },
        {
          "name": "coffreDeLaVenue",
          "writable": true
        },
        {
          "name": "compteDeReclamation",
          "docs": [
            "COMPTE DE RECLAMATION, propre au retrait. Adresse derivee du programme",
            "de recompenses que rien ne cree automatiquement : elle doit exister",
            "AVANT le premier retrait. C'est un prealable d'exploitation."
          ],
          "writable": true
        },
        {
          "name": "liquidite",
          "writable": true
        },
        {
          "name": "programmeDeLiquidite",
          "writable": true
        },
        {
          "name": "modeleDeRecompenses"
        },
        {
          "name": "programmeDePret"
        },
        {
          "name": "programmeDeJeton"
        },
        {
          "name": "programmeDeCompteAssocie"
        },
        {
          "name": "programmeSysteme"
        }
      ],
      "args": [
        {
          "name": "actif",
          "type": "u64"
        },
        {
          "name": "partsMaximales",
          "type": "u64"
        }
      ]
    }
  ],
  "errors": [
    {
      "code": 6000,
      "name": "marcheTailleInattendue",
      "msg": "Le compte de marche n'a pas la taille attendue"
    },
    {
      "code": 6001,
      "name": "marcheDiscriminateurInattendu",
      "msg": "Le compte de marche porte un autre discriminateur"
    },
    {
      "code": 6002,
      "name": "marcheActifEtranger",
      "msg": "Le marche ne porte pas l'actif annonce"
    },
    {
      "code": 6003,
      "name": "marcheJetonEtranger",
      "msg": "Le marche ne porte pas le jeton de recu annonce"
    },
    {
      "code": 6004,
      "name": "montantNul",
      "msg": "Le montant depose doit etre positif"
    },
    {
      "code": 6005,
      "name": "prixNul",
      "msg": "Un prix d'echange du marche vaut zero"
    },
    {
      "code": 6006,
      "name": "debordement",
      "msg": "Debordement arithmetique"
    },
    {
      "code": 6007,
      "name": "partsInsuffisantes",
      "msg": "La venue a emis moins de parts que la conversion n'en promettait"
    },
    {
      "code": 6008,
      "name": "actifInsuffisant",
      "msg": "La venue a rendu moins d'actif que le retrait n'en demandait"
    },
    {
      "code": 6009,
      "name": "partsBruleesExcessives",
      "msg": "La venue a brule plus de parts que le plafond ne l'autorisait"
    },
    {
      "code": 6010,
      "name": "actifPreleveExcessif",
      "msg": "La venue a preleve plus d'actif que le depot n'en offrait"
    },
    {
      "code": 6011,
      "name": "soldeIncoherent",
      "msg": "Le solde d'un compte de la position a varie dans le sens que l'operation interdit"
    }
  ]
};
