import { Game } from './game';

const boot = document.getElementById('boot')!;
const bar = document.getElementById('bootbar')!;
const warn = boot.querySelector('.warn') as HTMLElement;

const app = document.getElementById('app')!;
const game = new Game(app);

// release the boot overlay as soon as the menu is interactive
let released = false;
const release = () => {
  if (released) return;
  released = true;
  boot.classList.add('done');
  boot.style.pointerEvents = 'none';
  setTimeout(() => boot.remove(), 800);
};

// real asset progress → boot bar
const WARNINGS = ['SIGNAL FOUND — 60Hz HUM DETECTED', 'LOADING WEAPONRY…', 'CALIBRATING HORDES…', 'DO NOT NO-CLIP YET'];
let flip = 0;
void game
  .loadAssets((loaded, total) => {
    const t = total > 0 ? loaded / total : 1;
    bar.style.width = `${Math.round(t * 100)}%`;
    const w = WARNINGS[Math.min(WARNINGS.length - 1, Math.floor(t * WARNINGS.length))];
    if (w !== WARNINGS[flip]) {
      flip = WARNINGS.indexOf(w);
      warn.textContent = w;
    }
  })
  .then(() => {
    bar.style.width = '100%';
    setTimeout(release, 250);
  });

// absolute fallback: never trap the player behind the boot screen
setTimeout(release, 2500);
// also release on any interaction (assets keep loading in background)
window.addEventListener('pointerdown', release, { once: true });
window.addEventListener('keydown', release, { once: true });
