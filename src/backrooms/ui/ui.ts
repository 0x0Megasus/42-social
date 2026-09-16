export type Stats = {
  score: number;
  kills: number;
  headshots: number;
  wave: number;
  accuracy: number;
  timeSurvived: number;
};

const CSS = `
#ui { position: absolute; inset: 0; pointer-events: none; font-family: 'Courier New', ui-monospace, monospace; color: #e8dcb2; z-index: 10; user-select: none; overflow: hidden; }
#ui .hidden { display: none !important; }

#hud { position: absolute; inset: 0; opacity: 0; transition: opacity 0.4s; text-shadow: 0 0 6px rgba(232,220,178,0.35); }
#hud.on { opacity: 1; }

.hud-tl { position: absolute; top: 18px; left: 22px; font-size: 13px; letter-spacing: 0.12em; }
.hud-tr { position: absolute; top: 18px; right: 22px; text-align: right; font-size: 13px; letter-spacing: 0.12em; }
.rec-row { display: flex; align-items: center; gap: 8px; }
.rec-dot { width: 10px; height: 10px; border-radius: 50%; background: #ff3b30; box-shadow: 0 0 8px #ff3b30; animation: recblink 1.2s steps(2) infinite; }
@keyframes recblink { 50% { opacity: 0.15; } }
.hud-dim { opacity: 0.55; font-size: 11px; }

#minimap { margin-top: 10px; border: 1px solid rgba(232,220,178,0.35); background: rgba(5,4,3,0.55); image-rendering: pixelated; border-radius: 2px; }

.hud-bl { position: absolute; bottom: 22px; left: 24px; width: 240px; }
.bar-label { font-size: 10px; letter-spacing: 0.3em; opacity: 0.6; margin-bottom: 3px; display: flex; justify-content: space-between; }
.bar { height: 10px; background: rgba(232,220,178,0.12); border: 1px solid rgba(232,220,178,0.3); margin-bottom: 8px; position: relative; overflow: hidden; }
.bar i { position: absolute; inset: 0; transform-origin: left; background: #c8b46a; transition: transform 0.15s; }
#hpbar i { background: linear-gradient(90deg, #b8452f, #d86a3a); box-shadow: 0 0 10px rgba(216,106,58,0.5); }
#stbar i { background: #7a9c6a; }
.bar-seg { position: absolute; inset: 0; background: repeating-linear-gradient(90deg, transparent 0 22px, rgba(5,4,3,0.7) 22px 24px); }

.hud-br { position: absolute; bottom: 18px; right: 24px; text-align: right; }
#ammoBig { font-size: 44px; font-weight: bold; letter-spacing: 0.05em; line-height: 1; }
#ammoBig small { font-size: 18px; opacity: 0.55; }
#weaponName { font-size: 12px; letter-spacing: 0.35em; opacity: 0.7; margin-top: 2px; }
#reloadHint { font-size: 11px; color: #d86a3a; letter-spacing: 0.2em; margin-top: 4px; visibility: hidden; }
#reloadHint.on { visibility: visible; animation: recblink 0.8s steps(2) infinite; }

#xh { position: absolute; left: 50%; top: 50%; width: 0; height: 0; }
.xh-l { position: absolute; background: rgba(232,220,178,0.85); box-shadow: 0 0 3px rgba(0,0,0,0.8); }
.xh-h { width: 9px; height: 1.5px; top: -0.75px; }
.xh-v { width: 1.5px; height: 9px; left: -0.75px; }
#xh .l1 { left: 6px; top: -0.75px; }
#xh .l2 { left: -15px; top: -0.75px; }
#xh .l3 { left: -0.75px; top: 6px; }
#xh .l4 { left: -0.75px; top: -15px; }
#xh .dot { position: absolute; width: 2.5px; height: 2.5px; left: -1.25px; top: -1.25px; background: rgba(232,220,178,0.9); border-radius: 50%; }
#hitmark { position: absolute; left: 50%; top: 50%; transform: translate(-50%,-50%) rotate(45deg); font-size: 0; opacity: 0; }
#hitmark span { display: inline-block; width: 3px; height: 11px; background: #ff6b4a; margin: 0 3px; }
#hitmark.head span { background: #ffd23a; }
#hitmark.show { animation: hitpop 0.25s ease-out; }
@keyframes hitpop { 0% { opacity: 1; transform: translate(-50%,-50%) rotate(45deg) scale(1.25);} 100% { opacity: 0; transform: translate(-50%,-50%) rotate(45deg) scale(0.85);} }

#banner { position: absolute; top: 16%; left: 0; right: 0; text-align: center; font-size: 26px; letter-spacing: 0.5em; opacity: 0; }
#banner.show { animation: bannerIn 2.8s ease-out; }
@keyframes bannerIn { 0% { opacity: 0; letter-spacing: 0.9em; } 12% { opacity: 1; letter-spacing: 0.5em; } 80% { opacity: 1; } 100% { opacity: 0; } }
#subbanner { position: absolute; top: calc(16% + 38px); left: 0; right: 0; text-align: center; font-size: 12px; letter-spacing: 0.4em; opacity: 0.65; }
#feed { position: absolute; left: 24px; top: 38%; display: flex; flex-direction: column; gap: 4px; }
.feed-item { font-size: 12px; letter-spacing: 0.15em; background: rgba(5,4,3,0.45); border-left: 2px solid #c8b46a; padding: 3px 8px; animation: feedin 3.2s forwards; }
.feed-item.hs { border-left-color: #ffd23a; color: #ffd23a; }
@keyframes feedin { 0% { opacity: 0; transform: translateX(-8px);} 8% { opacity: 1; transform: none;} 75% { opacity: 1; } 100% { opacity: 0; } }

#interact { position: absolute; left: 50%; bottom: 26%; transform: translateX(-50%); text-align: center; opacity: 0; transition: opacity 0.2s; }
#interact.on { opacity: 1; }
#interact .key { border: 1px solid #e8dcb2; padding: 2px 8px; font-size: 12px; letter-spacing: 0.2em; margin-right: 8px; }
#interact .iprogress { width: 180px; height: 3px; background: rgba(232,220,178,0.2); margin: 8px auto 0; }
#interact .iprogress i { display: block; height: 100%; width: 0%; background: #9cc46a; box-shadow: 0 0 8px #9cc46a; }

#dmgflash { position: absolute; inset: 0; background: radial-gradient(ellipse at center, transparent 40%, rgba(180,30,10,0.55) 100%); opacity: 0; }
#dmgflash.show { animation: dmg 0.5s ease-out; }
@keyframes dmg { 0% { opacity: 1; } 100% { opacity: 0; } }

.menu { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; flex-direction: column; pointer-events: auto; background: radial-gradient(ellipse at center, rgba(5,4,3,0.25) 0%, rgba(5,4,3,0.88) 100%); backdrop-filter: blur(2px); }
.title { font-size: clamp(34px, 7vw, 72px); letter-spacing: 0.3em; color: #d8c56a; text-shadow: 0 0 24px rgba(216,197,106,0.35); position: relative; }
.title .glitch { position: absolute; inset: 0; color: #ff6b4a; opacity: 0; animation: glitch 4.5s infinite; clip-path: inset(30% 0 40% 0); }
@keyframes glitch { 0%, 93%, 100% { opacity: 0; transform: none; } 94% { opacity: 0.8; transform: translateX(3px); } 96% { opacity: 0.6; transform: translateX(-4px); } 98% { opacity: 0.8; transform: translateX(2px); } }
.subtitle { margin-top: 6px; font-size: 13px; letter-spacing: 0.7em; opacity: 0.6; }
.mbtns { margin-top: 44px; display: flex; flex-direction: column; gap: 14px; align-items: center; }
.mbtn { pointer-events: auto; cursor: pointer; background: transparent; color: #e8dcb2; border: 1px solid rgba(232,220,178,0.4); padding: 12px 42px; font-family: inherit; font-size: 15px; letter-spacing: 0.35em; transition: all 0.15s; position: relative; }
.mbtn:hover { background: rgba(216,197,106,0.12); border-color: #d8c56a; color: #ffe9a8; box-shadow: 0 0 18px rgba(216,197,106,0.25); letter-spacing: 0.42em; }
.mbtn.primary { border-color: #d8c56a; color: #ffe9a8; }
.mbtn.danger:hover { border-color: #ff6b4a; color: #ff6b4a; box-shadow: 0 0 18px rgba(255,107,74,0.2); background: rgba(255,107,74,0.08); }
.hintline { margin-top: 26px; font-size: 11px; letter-spacing: 0.25em; opacity: 0.4; }
.creds { position: absolute; bottom: 18px; font-size: 10px; letter-spacing: 0.3em; opacity: 0.3; }

.panel { background: rgba(8,7,4,0.92); border: 1px solid rgba(232,220,178,0.3); padding: 30px 40px; min-width: 340px; }
.panel h2 { margin: 0 0 22px; font-size: 15px; letter-spacing: 0.5em; opacity: 0.85; text-align: center; }
.setrow { display: flex; align-items: center; justify-content: space-between; gap: 18px; margin-bottom: 18px; font-size: 12px; letter-spacing: 0.15em; }
.setrow input[type=range] { pointer-events: auto; width: 150px; accent-color: #d8c56a; }
.setrow .val { width: 40px; text-align: right; opacity: 0.7; }
.toggle { pointer-events: auto; cursor: pointer; border: 1px solid rgba(232,220,178,0.4); padding: 3px 12px; letter-spacing: 0.2em; }
.toggle.on { background: rgba(216,197,106,0.2); border-color: #d8c56a; color: #ffe9a8; }

.howto { display: grid; grid-template-columns: auto auto; gap: 7px 20px; font-size: 13px; letter-spacing: 0.1em; margin-top: 8px; }
.howto .k { color: #ffd23a; text-align: right; }

.endstats { margin-top: 26px; display: grid; grid-template-columns: auto auto; gap: 8px 34px; font-size: 14px; letter-spacing: 0.18em; }
.endstats .v { color: #ffd23a; text-align: right; }
.endtitle.dead { color: #ff6b4a; text-shadow: 0 0 30px rgba(255,107,74,0.4); }
.endtitle.win { color: #9cc46a; text-shadow: 0 0 30px rgba(156,196,106,0.4); }
.endsub { margin-top: 10px; font-size: 12px; letter-spacing: 0.4em; opacity: 0.6; }
`;

export type UICallbacks = {
  onStart: () => void;
  onResume: () => void;
  onRestart: () => void;
  onQuit: () => void;
  onSettings: (s: { sens: number; vol: number; fx: boolean }) => void;
};

export class UI {
  root: HTMLElement;
  hud: HTMLElement;
  minimap: HTMLCanvasElement;
  private styleEl: HTMLStyleElement;
  private hpFill: HTMLElement;
  private stFill: HTMLElement;
  private ammoBig: HTMLElement;
  private weaponName: HTMLElement;
  private reloadHint: HTMLElement;
  private waveLabel: HTMLElement;
  private zLeftLabel: HTMLElement;
  private recTimer: HTMLElement;
  private banner: HTMLElement;
  private subbanner: HTMLElement;
  private feed: HTMLElement;
  private hitmark: HTMLElement;
  private dmgflash: HTMLElement;
  private interact: HTMLElement;
  private interactBar: HTMLElement;
  private menuMain: HTMLElement;
  private menuPause: HTMLElement;
  private menuHow: HTMLElement;
  private menuSettings: HTMLElement;
  private menuEnd: HTMLElement;
  private endTitle: HTMLElement;
  private endSub: HTMLElement;
  private endStats: HTMLElement;
  private sensInput: HTMLInputElement;
  private volInput: HTMLInputElement;
  private fxToggle: HTMLElement;
  private sensVal = 1.0;
  private volVal = 0.8;
  private fxOn = true;
  private settingsReturn: 'main' | 'pause' = 'main';
  private cb: UICallbacks;

  constructor(parent: HTMLElement, cb: UICallbacks) {
    this.cb = cb;

    const style = document.createElement('style');
    style.dataset.backrooms = 'true';
    style.textContent = CSS;
    document.head.appendChild(style);
    this.styleEl = style;

    const root = document.createElement('div');
    root.id = 'ui';
    root.innerHTML = `
      <div id="hud">
        <div class="hud-tl">
          <div class="rec-row"><span class="rec-dot"></span><span>REC</span><span id="recTimer">00:00</span></div>
          <div class="hud-dim">SP&nbsp; <span id="scoreLabel">0</span></div>
        </div>
        <div class="hud-tr">
          <div>WAVE <span id="waveLabel">1/6</span></div>
          <div class="hud-dim">HOSTILES <span id="zLeftLabel">0</span></div>
          <canvas id="minimap" width="150" height="150"></canvas>
        </div>
        <div class="hud-bl">
          <div class="bar-label"><span>VITALS</span><span id="hpNum">100</span></div>
          <div class="bar" id="hpbar"><i></i><span class="bar-seg"></span></div>
          <div class="bar-label"><span>STAMINA</span></div>
          <div class="bar" id="stbar"><i></i><span class="bar-seg"></span></div>
        </div>
        <div class="hud-br">
          <div id="ammoBig">12<small> / 12</small></div>
          <div id="weaponName">M1911</div>
          <div id="reloadHint">PRESS R — RELOAD</div>
        </div>
        <div id="xh">
          <span class="xh-l xh-h l1"></span><span class="xh-l xh-h l2"></span>
          <span class="xh-l xh-v l3"></span><span class="xh-l xh-v l4"></span>
          <span class="dot"></span>
        </div>
        <div id="hitmark"><span></span><span></span></div>
        <div id="banner"></div>
        <div id="subbanner"></div>
        <div id="feed"></div>
        <div id="interact"><span class="key">HOLD E</span><span>FORCE THE EXIT</span><div class="iprogress"><i></i></div></div>
        <div id="dmgflash"></div>
      </div>

      <div class="menu" id="menuMain">
        <div class="title">BACKROOMS<span class="glitch">BACKROOMS</span></div>
        <div class="subtitle">N O - C L I P</div>
        <div class="mbtns">
          <button class="mbtn primary" id="btnStart">ENTER THE BACKROOMS</button>
          <button class="mbtn" id="btnHow">HOW TO SURVIVE</button>
          <button class="mbtn" id="btnSettings">SETTINGS</button>
        </div>
        <div class="hintline">CLICK TO LOCK CURSOR · ESC TO PAUSE</div>
        <div class="creds">SURVIVE 6 WAVES · FIND THE EXIT · MUHROW33 BUILD</div>
      </div>

      <div class="menu hidden" id="menuHow">
        <div class="panel">
          <h2>HOW TO SURVIVE</h2>
          <div class="howto">
            <span class="k">W A S D</span><span>move</span>
            <span class="k">MOUSE</span><span>look</span>
            <span class="k">LMB</span><span>fire</span>
            <span class="k">1 / 2 / 3</span><span>pistol / SMG / shotgun</span>
            <span class="k">R</span><span>reload</span>
            <span class="k">SHIFT</span><span>sprint (stamina)</span>
            <span class="k">ESC</span><span>pause</span>
          </div>
          <div class="hintline">HEADSHOTS DEAL 2.5× · SHAMBLERS SHAMBLE · RUNNERS RUN · BRUTES BRUTE</div>
          <div class="mbtns"><button class="mbtn" id="btnHowBack">BACK</button></div>
        </div>
      </div>

      <div class="menu hidden" id="menuSettings">
        <div class="panel">
          <h2>SETTINGS</h2>
          <div class="setrow"><span>SENSITIVITY</span><input type="range" id="setSens" min="0.2" max="2.5" step="0.05"><span class="val" id="sensVal">1.0</span></div>
          <div class="setrow"><span>VOLUME</span><input type="range" id="setVol" min="0" max="1" step="0.05"><span class="val" id="volVal">80%</span></div>
          <div class="setrow"><span>POST-FX GRADE</span><span class="toggle on" id="setFx">ON</span></div>
          <div class="mbtns"><button class="mbtn" id="btnSetBack">BACK</button></div>
        </div>
      </div>

      <div class="menu hidden" id="menuPause">
        <div class="title" style="font-size: clamp(22px, 4vw, 40px);">PAUSED</div>
        <div class="mbtns">
          <button class="mbtn primary" id="btnResume">RESUME</button>
          <button class="mbtn" id="btnPauseSettings">SETTINGS</button>
          <button class="mbtn" id="btnRestart">RESTART RUN</button>
          <button class="mbtn danger" id="btnQuit">ABANDON REALITY</button>
        </div>
      </div>

      <div class="menu hidden" id="menuEnd">
        <div class="title endtitle" id="endTitle">YOU DIED</div>
        <div class="endsub" id="endSub"></div>
        <div class="endstats" id="endStats"></div>
        <div class="mbtns">
          <button class="mbtn primary" id="btnRetry">RUN IT BACK</button>
          <button class="mbtn" id="btnEndQuit">MAIN MENU</button>
        </div>
      </div>
    `;
    parent.appendChild(root);
    this.root = root;

    this.hud = root.querySelector('#hud')!;
    this.minimap = root.querySelector('#minimap')!;
    this.hpFill = root.querySelector('#hpbar i')!;
    this.stFill = root.querySelector('#stbar i')!;
    this.ammoBig = root.querySelector('#ammoBig')!;
    this.weaponName = root.querySelector('#weaponName')!;
    this.reloadHint = root.querySelector('#reloadHint')!;
    this.waveLabel = root.querySelector('#waveLabel')!;
    this.zLeftLabel = root.querySelector('#zLeftLabel')!;
    this.recTimer = root.querySelector('#recTimer')!;
    this.banner = root.querySelector('#banner')!;
    this.subbanner = root.querySelector('#subbanner')!;
    this.feed = root.querySelector('#feed')!;
    this.hitmark = root.querySelector('#hitmark')!;
    this.dmgflash = root.querySelector('#dmgflash')!;
    this.interact = root.querySelector('#interact')!;
    this.interactBar = root.querySelector('#interact .iprogress i')!;
    this.menuMain = root.querySelector('#menuMain')!;
    this.menuHow = root.querySelector('#menuHow')!;
    this.menuSettings = root.querySelector('#menuSettings')!;
    this.menuPause = root.querySelector('#menuPause')!;
    this.menuEnd = root.querySelector('#menuEnd')!;
    this.endTitle = root.querySelector('#endTitle')!;
    this.endSub = root.querySelector('#endSub')!;
    this.endStats = root.querySelector('#endStats')!;
    this.sensInput = root.querySelector('#setSens')!;
    this.volInput = root.querySelector('#setVol')!;
    this.fxToggle = root.querySelector('#setFx')!;
    this.sensValEl = root.querySelector('#sensVal')!;
    this.volValEl = root.querySelector('#volVal')!;
    this.scoreLabel = root.querySelector('#scoreLabel')!;

    const click = (id: string, fn: () => void) => {
      const b = root.querySelector(id)!;
      b.addEventListener('click', () => {
        this.cb.onSettings({ sens: this.sensVal, vol: this.volVal, fx: this.fxOn });
        fn();
      });
    };
    click('#btnStart', () => this.cb.onStart());
    click('#btnHow', () => this.show('how'));
    click('#btnHowBack', () => this.show('main'));
    click('#btnSettings', () => {
      this.settingsReturn = 'main';
      this.show('settings');
    });
    click('#btnResume', () => this.cb.onResume());
    click('#btnPauseSettings', () => {
      this.settingsReturn = 'pause';
      this.show('settings');
    });
    click('#btnSetBack', () => this.show(this.settingsReturn));
    click('#btnRestart', () => this.cb.onRestart());
    click('#btnQuit', () => this.cb.onQuit());
    click('#btnRetry', () => this.cb.onRestart());
    click('#btnEndQuit', () => this.cb.onQuit());

    this.sensInput.addEventListener('input', () => {
      this.sensVal = parseFloat(this.sensInput.value);
      this.sensValEl.textContent = this.sensVal.toFixed(2);
      this.cb.onSettings({ sens: this.sensVal, vol: this.volVal, fx: this.fxOn });
    });
    this.volInput.addEventListener('input', () => {
      this.volVal = parseFloat(this.volInput.value);
      this.volValEl.textContent = Math.round(this.volVal * 100) + '%';
      this.cb.onSettings({ sens: this.sensVal, vol: this.volVal, fx: this.fxOn });
    });
    this.fxToggle.addEventListener('click', () => {
      this.fxOn = !this.fxOn;
      this.fxToggle.textContent = this.fxOn ? 'ON' : 'OFF';
      this.fxToggle.classList.toggle('on', this.fxOn);
      this.cb.onSettings({ sens: this.sensVal, vol: this.volVal, fx: this.fxOn });
    });
    this.sensInput.value = String(this.sensVal);
    this.volInput.value = String(this.volVal);
  }

  private scoreLabel: HTMLElement;
  private sensValEl: HTMLElement;
  private volValEl: HTMLElement;

  show(which: 'main' | 'how' | 'settings' | 'pause' | 'end' | 'none'): void {
    this.menuMain.classList.toggle('hidden', which !== 'main');
    this.menuHow.classList.toggle('hidden', which !== 'how');
    this.menuSettings.classList.toggle('hidden', which !== 'settings');
    this.menuPause.classList.toggle('hidden', which !== 'pause');
    this.menuEnd.classList.toggle('hidden', which !== 'end');
  }

  setHudVisible(v: boolean): void {
    this.hud.classList.toggle('on', v);
  }

  setHealth(hp: number, max: number): void {
    const t = Math.max(0, hp / max);
    this.hpFill.style.transform = `scaleX(${t})`;
    const num = this.root.querySelector('#hpNum')!;
    num.textContent = String(Math.ceil(hp));
  }

  setStamina(st: number): void {
    this.stFill.style.transform = `scaleX(${Math.max(0, Math.min(1, st / 100))})`;
  }

  setAmmo(ammo: number, mag: number, name: string, reloading: boolean): void {
    this.ammoBig.innerHTML = `${ammo}<small> / ${mag}</small>`;
    this.weaponName.textContent = name;
    this.reloadHint.classList.toggle('on', ammo === 0 && !reloading);
  }

  setScore(score: number): void {
    this.scoreLabel.textContent = String(score);
  }

  setWave(cur: number, total: number, left: number): void {
    this.waveLabel.textContent = `${cur}/${total}`;
    this.zLeftLabel.textContent = String(left);
  }

  setRecTime(t: number): void {
    const m = Math.floor(t / 60);
    const s = Math.floor(t % 60);
    this.recTimer.textContent = `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }

  showBanner(text: string, sub = ''): void {
    this.banner.textContent = text;
    this.subbanner.textContent = sub;
    this.banner.classList.remove('show');
    void this.banner.offsetWidth;
    this.banner.classList.add('show');
  }

  addFeed(text: string, headshot = false): void {
    const el = document.createElement('div');
    el.className = 'feed-item' + (headshot ? ' hs' : '');
    el.textContent = text;
    this.feed.appendChild(el);
    setTimeout(() => el.remove(), 3200);
    while (this.feed.children.length > 6) this.feed.firstChild?.remove();
  }

  hitmarker(headshot: boolean): void {
    this.hitmark.classList.toggle('head', headshot);
    this.hitmark.classList.remove('show');
    void this.hitmark.offsetWidth;
    this.hitmark.classList.add('show');
  }

  damageFlash(): void {
    this.dmgflash.classList.remove('show');
    void this.dmgflash.offsetWidth;
    this.dmgflash.classList.add('show');
  }

  setInteract(visible: boolean, progress: number): void {
    this.interact.classList.toggle('on', visible);
    this.interactBar.style.width = `${Math.min(100, progress * 100)}%`;
  }

  showEnd(win: boolean, stats: Stats): void {
    this.endTitle.textContent = win ? 'YOU FOUND THE EXIT' : 'YOU NO-CLIPPED OUT';
    this.endTitle.classList.toggle('win', win);
    this.endTitle.classList.toggle('dead', !win);
    this.endSub.textContent = win ? 'REALITY RE-ACQUIRED' : 'THE HUM CONTINUES WITHOUT YOU';
    const acc = Math.round(stats.accuracy * 100);
    this.endStats.innerHTML = `
      <span>SCORE</span><span class="v">${stats.score}</span>
      <span>WAVE REACHED</span><span class="v">${stats.wave} / 6</span>
      <span>KILLS</span><span class="v">${stats.kills}</span>
      <span>HEADSHOTS</span><span class="v">${stats.headshots}</span>
      <span>ACCURACY</span><span class="v">${acc}%</span>
      <span>TIME</span><span class="v">${Math.floor(stats.timeSurvived / 60)}m ${Math.floor(stats.timeSurvived % 60)}s</span>
    `;
    this.show('end');
  }

  destroy(): void {
    try {
      this.root.remove();
    } catch {
    }
    try {
      this.styleEl.remove();
    } catch {
    }
  }
}
