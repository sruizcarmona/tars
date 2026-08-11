/* Finca Burger — MENU DATA (single source of truth)
 * Both index.html (site) and orders/ (order pad) render from this file.
 * To update the menu: edit here, that's it.
 *
 * img paths are relative filenames; each page prepends its own base
 * ("" for the site root, "../" for orders/).
 */
const FINCA_MENU = {
  burgers: [
    {
      id: "estiuenca",
      name: "La Estiuenca",
      price: 12.5,
      desc: "Hamburguesa d'estiu: pollastre a la brasa, tomàquet, enciam i allioli casolà.",
      img: "burger-estiuenca.jpg",
    },
    {
      id: "spqr",
      name: "SPQR",
      price: 13,
      desc: "Provola fosa, pebrera roja torrada i pa de pagès. Senatus Populusque… Finca.",
      img: "burger-spqr.jpg",
    },
    {
      id: "tipica",
      name: "La Típica",
      price: 12,
      desc: "180 g de carn de la terra, formatge fos, tomàquet, enciam i ceba. Pa de burger, amb patates fregides.",
      img: "burger-clasica.jpg",
    },
    {
      id: "ultrachop",
      name: "Ultrachop",
      price: 14.5,
      desc: "Doble carn picada, formatge fos, cogombrets i salsa especial. Sense trellat, sense penediment.",
      img: "burger-ultrachop.jpg",
    },
    {
      id: "bacon",
      name: "La Bacon Finca",
      price: 13.5,
      desc: "Doble smash, bacó cruixent, formatge fos i ceba caramel·litzada.",
      img: "burger-bacon.jpg",
    },
    {
      id: "abuela",
      name: "La de la Abuela",
      price: 14,
      desc: "Ou ferrat, creïlles de l'horta, ceba caramel·litzada i el secret de l'àvia.",
      img: "burger-especial.jpg",
      badge: "Especial de la nit",
    },
  ],
  drinks: [
    { id: "cervesa", name: "Cervesa artesana de Castelló", price: 3.5 },
    { id: "limonada", name: "Limonada casolana de l'àvia", price: 3 },
    { id: "vi", name: "Vi de la terra", price: 2.5 },
    { id: "orxata", name: "Orxata de xufa", price: 3.5 },
    { id: "cava", name: "Cava o vermut", price: 4 },
    { id: "aigua", name: "Aigua / refrescos", price: 2 },
    { id: "cafe", name: "Cafè / infusions", price: 1.8 },
  ],
};

/* Format a price like the site: "12 €" or "12,50 €" (comma decimals) */
function formatPrice(p) {
  return (p % 1 === 0 ? String(p) : p.toFixed(2).replace(".", ",")) + " €";
}
