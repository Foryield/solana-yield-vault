/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Export statique : la page est entierement cote client, aucun rendu
  // serveur. Produit un dossier `out/` deployable tel quel, ce que le
  // blueprint Render publie.
  output: "export",
  images: { unoptimized: true },

  // `Buffer` est une globale de Node, absente du navigateur, et webpack 5 ne
  // la comble plus d'office. La bibliotheque de composition s'en sert des le
  // chargement de son module (les graines de derivation sont des `Buffer`),
  // donc un calage pose a l'execution arriverait trop tard : il faut que le
  // paquet soit injecte a la CONSTRUCTION. Sans cela, la page se construit
  // sans broncher et tombe en « Buffer is not defined » au premier rendu.
  //
  // L'instance de webpack est celle que Next fournit : il embarque la sienne,
  // et l'importer en direct exigerait une dependance qui n'aurait aucune autre
  // raison d'etre la.
  webpack: (config, { isServer, webpack }) => {
    if (!isServer) {
      config.plugins.push(
        new webpack.ProvidePlugin({ Buffer: ["buffer", "Buffer"] }),
      );
    }
    return config;
  },
};

export default nextConfig;
