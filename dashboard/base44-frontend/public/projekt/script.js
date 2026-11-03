// Keine Daten werden abgerufen. Die Demo zeigt ausschließlich den Zustand der Oberfläche.
const sections = [...document.querySelectorAll('main > section')];
const navLinks = [...document.querySelectorAll('nav a')];
const previous = document.querySelector('#previous');
const next = document.querySelector('#next');
let activeSection = 0;
function updateNavigation(index) {
  activeSection = index;
  document.querySelector('#section-count').textContent = `${String(index + 1).padStart(2, '0')} / 05`;
  previous.disabled = index === 0;
  next.disabled = index === sections.length - 1;
  navLinks.forEach((link, i) => {
    if (i === index) link.setAttribute('aria-current', 'location');
    else link.removeAttribute('aria-current');
  });
}
function move(direction) {
  const index = Math.max(0, Math.min(sections.length - 1, activeSection + direction));
  sections[index].scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
  updateNavigation(index);
}
previous.addEventListener('click', () => move(-1));
next.addEventListener('click', () => move(1));
let scrollQueued = false;
window.addEventListener('scroll', () => {
  if (scrollQueued) return;
  scrollQueued = true;
  requestAnimationFrame(() => {
    const boundary = document.querySelector('.header').getBoundingClientRect().height + 90;
    let current = 0;
    sections.forEach((section, index) => { if (section.getBoundingClientRect().top <= boundary) current = index; });
    updateNavigation(current);
    scrollQueued = false;
  });
}, { passive: true });
document.addEventListener('keydown', event => {
  if (event.target.closest('input, select, textarea, button, a') || event.altKey || event.ctrlKey || event.metaKey) return;
  if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
    event.preventDefault();
    move(event.key === 'ArrowRight' ? 1 : -1);
  }
});
const fullscreen = document.querySelector('#fullscreen');
if (!document.documentElement.requestFullscreen) fullscreen.hidden = true;
fullscreen.addEventListener('click', async () => {
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else await document.documentElement.requestFullscreen();
  } catch {
    fullscreen.textContent = 'Vollbild nicht verfügbar';
  }
});
document.addEventListener('fullscreenchange', () => {
  fullscreen.textContent = document.fullscreenElement ? 'Vollbild beenden ↙' : 'Vollbild ↗';
});
const room = document.querySelector('#room');
const metric = document.querySelector('#metric');
function updateDemo() {
  document.querySelector('#demo-selection').textContent = `${room.value} · ${metric.value}`;
  document.querySelector('#demo-message').textContent = 'Keine Messdaten hinterlegt.';
}
room.addEventListener('change', updateDemo);
metric.addEventListener('change', updateDemo);
document.querySelector('#demo-button').addEventListener('click', () => {
  document.querySelector('#demo-message').textContent = `Für ${room.value} sind keine Daten zur Messgröße „${metric.value}“ verbunden. Die Raumbezeichnung ist ein Beispiel.`;
});
updateNavigation(0);
