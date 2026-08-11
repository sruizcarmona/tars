/* Finca Burger — renders the menu from menu-data.js (single source of truth).
 * index.html loads this with IMG_BASE = "" (assets/ at site root).
 * comandes/ loads its own copy with IMG_BASE = "../".
 */
(function () {
  var IMG_BASE = window.IMG_BASE || ""; // site root: ""; comandes page: "../" (set before including)

  function renderBurgers() {
    // Site page: #menu-grid · Orders page: #burger-grid
    var grid = document.getElementById("menu-grid") || document.getElementById("burger-grid");
    if (!grid || typeof FINCA_MENU === "undefined") return;
    FINCA_MENU.burgers.forEach(function (b) {
      var card = document.createElement("article");
      card.className = "card" + (b.badge ? " card-featured" : "");
      if (b.badge) {
        var badge = document.createElement("span");
        badge.className = "badge";
        badge.textContent = b.badge;
        card.appendChild(badge);
      }
      var img = document.createElement("img");
      img.src = IMG_BASE + "assets/" + b.img;
      img.alt = b.name;
      card.appendChild(img);

      var body = document.createElement("div");
      body.className = "card-body";
      var head = document.createElement("div");
      head.className = "card-head";
      var h3 = document.createElement("h3");
      h3.textContent = b.name;
      var price = document.createElement("span");
      price.className = "price";
      price.textContent = formatPrice(b.price);
      head.appendChild(h3);
      head.appendChild(price);
      var p = document.createElement("p");
      p.textContent = b.desc;
      body.appendChild(head);
      body.appendChild(p);
      card.appendChild(body);
      grid.appendChild(card);
    });
  }

  function renderDrinks() {
    // Site page: #drinks-list · Orders page: #drink-list
    var list = document.getElementById("drinks-list") || document.getElementById("drink-list");
    if (!list || typeof FINCA_MENU === "undefined") return;
    FINCA_MENU.drinks.forEach(function (d) {
      var li = document.createElement("li");
      var span = document.createElement("span");
      span.textContent = d.name;
      var price = document.createElement("span");
      price.className = "price";
      price.textContent = formatPrice(d.price);
      li.appendChild(span);
      li.appendChild(price);
      list.appendChild(li);
    });
  }

  function renderStarters() {
    var list = document.getElementById("starters-list");
    if (!list || typeof FINCA_MENU === "undefined" || !FINCA_MENU.starters) return;
    FINCA_MENU.starters.forEach(function (s) {
      var li = document.createElement("li");
      var span = document.createElement("span");
      span.textContent = s.name;
      var price = document.createElement("span");
      price.className = "price";
      price.textContent = formatPrice(s.price);
      li.appendChild(span);
      li.appendChild(price);
      list.appendChild(li);
    });
  }

  function renderDessertsNote() {
    var el = document.getElementById("desserts-note");
    if (!el || typeof FINCA_MENU === "undefined" || !FINCA_MENU.dessertsNote) return;
    el.textContent = "🍰 Postres: " + FINCA_MENU.dessertsNote;
  }

  renderBurgers();
  renderDrinks();
  renderStarters();
  renderDessertsNote();
})();
