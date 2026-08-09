/* Finca Burger — countdown to the one night of the year */

// ✏️ Edita la fecha de la próxima noche aquí: (mes: 0-11, día: 1-31)
const NEXT_OPENING = { month: 11, day: 31 }; // 31 de diciembre (Nochevieja)
const OPENING_HOUR = 20; // 20:00

function getNextOpening() {
  const now = new Date();
  let target = new Date(now.getFullYear(), NEXT_OPENING.month, NEXT_OPENING.day, OPENING_HOUR, 0, 0);
  if (target <= now) {
    target = new Date(now.getFullYear() + 1, NEXT_OPENING.month, NEXT_OPENING.day, OPENING_HOUR, 0, 0);
  }
  return target;
}

function pad(n) {
  return String(n).padStart(2, "0");
}

function tick() {
  const now = new Date();
  const diff = getNextOpening() - now;

  if (diff <= 0) {
    document.querySelectorAll("[id^=countdown]").forEach((el) => {
      el.innerHTML = '<div style="background:var(--red-600)"><span>¡ES HOY!</span><small>la noche ha llegado</small></div>';
    });
    return;
  }

  const days = Math.floor(diff / 86400000);
  const hours = Math.floor((diff % 86400000) / 3600000);
  const minutes = Math.floor((diff % 3600000) / 60000);
  const seconds = Math.floor((diff % 60000) / 1000);

  const html =
    `<div><span>${pad(days)}</span><small>días</small></div>` +
    `<div><span>${pad(hours)}</span><small>horas</small></div>` +
    `<div><span>${pad(minutes)}</span><small>min</small></div>` +
    `<div><span>${pad(seconds)}</span><small>seg</small></div>`;

  document.querySelectorAll("[id^=countdown]").forEach((el) => {
    el.innerHTML = html;
  });
}

tick();
setInterval(tick, 1000);
