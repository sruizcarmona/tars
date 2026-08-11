# Finca Burger 🍔🔥

Web de mostra per a **Finca Burger** — restaurant familiar a la zona rural de Castelló.
Només obren **una nit a l'any**. Aquesta web és la seua carta, la seua història i el seu compte enrere.

## Estructura

```
fincaburger/
├── index.html      → pàgina principal
├── styles.css      → tema roig
├── script.js       → compte enrere (una nit a l'any)
├── menu-data.js    → dades del menú (font única: web + comandes)
├── menu-render.js  → pinta el menú a la pàgina principal
├── comandes/       → taulell de comandes per als cambrers (localStorage)
└── assets/         → logo + fotos generades
```

## Canviar la data de "La Nit"

En `script.js`:

```js
const OPENING_DATE = "2026-08-11T20:00:00+02:00";
```

## Publicació

Accesible via GitHub Pages en:
`https://sruizcarmona.github.io/tars/fincaburger/`

## Crèdits

- Logo: proporcionat pel client
- Fotos de les hamburgueses i la finca: generades amb IA (mostra)
