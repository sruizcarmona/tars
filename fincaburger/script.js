/* Finca Burger — compte enrere cap a l'única nit de l'any */

// ✏️ La pròxima nit: dimarts 11 d'agost de 2026 a les 20:00 (hora local, CEST = UTC+2)
const OPENING_DATE = "2026-08-11T20:00:00+02:00";

function pad(n) {
  return String(n).padStart(2, "0");
}

function tick() {
  const target = new Date(OPENING_DATE);
  const now = new Date();
  const diff = target - now;

  if (diff <= 0) {
    document.querySelectorAll("[id^=countdown]").forEach((el) => {
      el.innerHTML = '<div style="background:var(--red-600)"><span>ÉS ARA!</span><small>la nit ha arribat</small></div>';
    });
    return;
  }

  const days = Math.floor(diff / 86400000);
  const hours = Math.floor((diff % 86400000) / 3600000);
  const minutes = Math.floor((diff % 3600000) / 60000);
  const seconds = Math.floor((diff % 60000) / 1000);

  const html =
    `<div><span>${pad(days)}</span><small>dies</small></div>` +
    `<div><span>${pad(hours)}</span><small>hores</small></div>` +
    `<div><span>${pad(minutes)}</span><small>min</small></div>` +
    `<div><span>${pad(seconds)}</span><small>seg</small></div>`;

  document.querySelectorAll("[id^=countdown]").forEach((el) => {
    el.innerHTML = html;
  });
}

tick();
setInterval(tick, 1000);
