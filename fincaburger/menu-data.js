/* Finca Burger — MENU DATA (single source of truth)
 * Both index.html (site) and orders/ (order pad) render from this file.
 * To update the menu: edit here, that's it.
 *
 * img paths are relative filenames; each page prepends its own base
 * ("" for the site root, "../" for orders/).
 *
 * Updated 2026-08-11: MENÚ 5è ANIVERSARI — tot a 5 € (flat price menu).
 *
 * NB: declared with `var` (not const) so it attaches to window in browsers —
 * menu-render.js reads window.FINCA_MENU.
 */
var FINCA_MENU = {
  theme: "Menú del 5è aniversari",
  note: "Tot a 5 €",
  burgers: [
    {
      id: "tipica",
      name: "La Típica",
      price: 5,
      desc: "Tomata, enciam, formatge i ceba a la planxa.",
      img: "burger-clasica.jpg",
    },
    {
      id: "spqr",
      name: "SPQR",
      price: 5,
      desc: "Xampis, pimentons, bacó, ceba a la planxa i mozzarella.",
      img: "burger-spqr.jpg",
    },
    {
      id: "ardexop",
      name: "ARDE-XOP",
      price: 5,
      desc: "Espàrrecs, ceba a la planxa, pebrots i formatge blau. Es pot afegir picant: chile, tabasco o oli picant.",
      img: "burger-ardexop.jpg",
    },
    {
      id: "estiuenca",
      name: "La Estiuenca",
      price: 5,
      desc: "Formatge, ceba a la planxa, ou fregit, espàrrecs i tomata fresca.",
      img: "burger-estiuenca.jpg",
    },
    {
      id: "wraaap",
      name: "WRAAAP especial 5è aniversari",
      price: 5,
      desc: "Salsa romesco, formatge manxec, pebrots i tortites.",
      img: "burger-wraaap.jpg",
      badge: "Especial 5è aniversari",
    },
  ],
  starters: [
    { id: "guacamole", name: "Guacamole amb nachos", price: 5 },
  ],
  drinks: [
    { id: "claritas", name: "Claritas", price: 5 },
    { id: "fanta-taronja", name: "Fanta taronja", price: 5 },
    { id: "fanta-llima", name: "Fanta llima", price: 5 },
    { id: "aigua", name: "Aigua", price: 5 },
    { id: "cervesa", name: "Cervesa amb i sense alcohol", price: 5 },
    { id: "vi", name: "Vi", price: 5 },
    { id: "sangria", name: "Sangria — especialitat de la chef Isabelina", price: 5 },
  ],
  dessertsNote: "Al final del sopar, pregunteu pel postre als cambrers de sala.",
};

/* Format a price like the site: "12 €" or "12,50 €" (comma decimals) */
function formatPrice(p) {
  return (p % 1 === 0 ? String(p) : p.toFixed(2).replace(".", ",")) + " €";
}
