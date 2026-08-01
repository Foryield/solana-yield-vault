"use client";

import dynamic from "next/dynamic";

/**
 * Le contenu est monte UNIQUEMENT dans le navigateur.
 *
 * L'export statique pre-rend les composants client a la construction, sur un
 * Node ou il n'y a ni portefeuille ni stockage local. Charger l'application a
 * l'execution seule evite d'avoir a garder chaque acces au navigateur derriere
 * une condition, et supprime d'un coup la classe entiere des erreurs
 * d'hydratation.
 */
const Application = dynamic(() => import("./application"), {
  ssr: false,
  loading: () => (
    <div className="shell">
      <div className="card">
        <div className="title">Chargement</div>
      </div>
    </div>
  ),
});

export default function Page() {
  return <Application />;
}
