import * as THREE from 'three';

export class UI {
  constructor(app, { rootEl, overlayEl }) {
    this.app = app;
    this.rootEl = rootEl;
    this.overlayEl = overlayEl;

    this.crosshair = overlayEl.querySelector('#crosshair');
    this.hint = overlayEl.querySelector('#interaction-hint');

    this._toastEl = null;

    this.hudEl = null;
    this.objEl = null;
    this.battFill = null;
    this.invEls = {};
    this.monsterDistEl = null;

    this.filmGrainEl = null;

    this._clamp = (v,a,b)=>Math.max(a,Math.min(b,v));

    this._buildMenus();
    this.showMainMenu();
  }

  _buildMenus() {
    this.menuWrap = document.createElement('div');
    this.menuWrap.className = 'ui-panel';
    this.rootEl.appendChild(this.menuWrap);

    this.menuCard = document.createElement('div');
    this.menuCard.className = 'card';
    this.menuWrap.appendChild(this.menuCard);

    const grain = document.createElement('div');
    grain.className = 'grain';
    this.menuCard.appendChild(grain);

    const header = document.createElement('div');
    header.className = 'header';
    this.menuCard.appendChild(header);

    const brand = document.createElement('div');
    brand.className = 'brand';
    header.appendChild(brand);

    const mark = document.createElement('div');
    mark.className = 'brand-mark';
    brand.appendChild(mark);

    const titleBlock = document.createElement('div');
    titleBlock.className = 'title-block';
    brand.appendChild(titleBlock);

    const h1 = document.createElement('h1');
    h1.textContent = 'THE LAST SIGNAL';
    titleBlock.appendChild(h1);

    const p = document.createElement('p');
    p.textContent = 'Abandoned research facility • 2:17 AM';
    titleBlock.appendChild(p);

    const body = document.createElement('div');
    body.className = 'panel-body';
    this.menuCard.appendChild(body);

    // Left: main actions
    const menu = document.createElement('div');
    menu.className = 'menu';
    body.appendChild(menu);

    const h2 = document.createElement('h2');
    h2.textContent = 'Menu';
    menu.appendChild(h2);

    const btnNew = this._makeBtn('New Game', 'Start over');
    btnNew.onclick = () => {
      this.menuWrap.style.display = 'none';
      this.app.startNewGame();
      document.body.focus?.();
    };
    menu.appendChild(btnNew);

    const btnContinue = this._makeBtn('Continue', 'Load last session');
    btnContinue.onclick = () => {
      // Minimal continue: start new since save system is not fully implemented.
      this.toast('Continue is not implemented in this lightweight build. Starting a new game.');
      this.menuWrap.style.display = 'none';
      this.app.startNewGame();
    };
    menu.appendChild(btnContinue);

    const btnSettings = this._makeBtn('Settings', 'Controls & Graphics');
    btnSettings.onclick = () => this.openSettings();
    menu.appendChild(btnSettings);

    const btnCredits = this._makeBtn('Credits', 'Story, sound, dev notes');
    btnCredits.onclick = () => this.openCredits();
    menu.appendChild(btnCredits);

    // Right: help + controls
    const help = document.createElement('div');
    help.className = 'menu';
    body.appendChild(help);

    const h2b = document.createElement('h2');
    h2b.textContent = 'Controls';
    help.appendChild(h2b);

    const list = document.createElement('div');
    list.className = 'list';
    help.appendChild(list);

    list.appendChild(this._kv('Move', 'WASD'));
    list.appendChild(this._kv('Sprint', 'Shift'));
    list.appendChild(this._kv('Crouch', 'Ctrl'));
    list.appendChild(this._kv('Interact', 'E'));
    list.appendChild(this._kv('Flashlight', 'F'));
    list.appendChild(this._kv('Pause', 'Esc'));

    const bottom = document.createElement('div');
    bottom.className = 'bottom-row';
    this.menuCard.appendChild(bottom);

    const corner = document.createElement('div');
    corner.className = 'corner-help';
    corner.innerHTML = `Tip: Turn off flashlight to hide. <br/>Find the locker code to get the generator key.`;
    bottom.appendChild(corner);
  }

  _makeBtn(label, smallText) {
    const b = document.createElement('div');
    b.className = 'btn';
    b.innerHTML = `<div>${label}</div><small>${smallText}</small>`;
    b.setAttribute('role', 'button');
    b.tabIndex = 0;
    b.onkeydown = (e) => { if (e.key === 'Enter') b.onclick(); };
    return b;
  }

  _kv(k, v) {
    const d = document.createElement('div');
    d.className = 'kv';
    d.innerHTML = `<span>${k}</span><span class="mono">${v}</span>`;
    return d;
  }

  showMainMenu() {
    this.menuWrap.style.display = 'flex';
    this._ensureHUD(false);
  }

  _ensureHUD(show = true) {
    if (!this.hudEl) {
      this.hudEl = document.createElement('div');
      this.hudEl.className = 'hud';
      document.body.appendChild(this.hudEl);

      const col = document.createElement('div');
      col.className = 'hud-col';
      this.hudEl.appendChild(col);

      const obj = document.createElement('div');
      obj.className = 'hud-panel';
      col.appendChild(obj);

      const h3 = document.createElement('h3');
      h3.textContent = 'Objective';
      obj.appendChild(h3);

      this.objEl = document.createElement('div');
      this.objEl.className = 'obj';
      obj.appendChild(this.objEl);

      const batt = document.createElement('div');
      batt.className = 'hud-panel';
      col.appendChild(batt);

      const h3b = document.createElement('h3');
      h3b.textContent = 'Flashlight';
      batt.appendChild(h3b);

      const badge = document.createElement('div');
      badge.className = 'badge';
      badge.textContent = 'Battery';
      batt.appendChild(badge);

      const battWrap = document.createElement('div');
      battWrap.className = 'batt';
      batt.appendChild(battWrap);

      const bar = document.createElement('div');
      bar.className = 'batt-bar';
      battWrap.appendChild(bar);

      this.battFill = document.createElement('div');
      this.battFill.className = 'batt-fill';
      bar.appendChild(this.battFill);

      // Inventory panel
      const inv = document.createElement('div');
      inv.className = 'hud-panel';
      col.appendChild(inv);

      const h3c = document.createElement('h3');
      h3c.textContent = 'Inventory';
      inv.appendChild(h3c);

      const invGrid = document.createElement('div');
      invGrid.className = 'inv-grid';
      inv.appendChild(invGrid);

      const slot1 = this._invSlot('Batteries', '0');
      invGrid.appendChild(slot1.el);
      this.invEls.batteries = slot1.valEl;

      const slot2 = this._invSlot('Keys', '0');
      invGrid.appendChild(slot2.el);
      this.invEls.keys = slot2.valEl;

      // Monster distance
      const m = document.createElement('div');
      m.className = 'hud-panel';
      col.appendChild(m);
      const hm = document.createElement('h3');
      hm.textContent = 'Threat';
      m.appendChild(hm);
      this.monsterDistEl = document.createElement('div');
      this.monsterDistEl.className = 'obj';
      m.appendChild(this.monsterDistEl);
    }

    this.hudEl.style.display = show ? 'flex' : 'none';
  }

  _invSlot(name, initial) {
    const el = document.createElement('div');
    el.className = 'inv-slot';
    const nm = document.createElement('div');
    nm.className = 'name';
    nm.textContent = name;
    const val = document.createElement('div');
    val.className = 'num';
    val.textContent = initial;
    el.appendChild(nm);
    el.appendChild(val);
    return { el, valEl: val };
  }

  resetHUD() {
    this._ensureHUD(true);
    this.setObjective(''); 
    this.setFilmGrain(true);
    this.battFill.style.width = '100%';
    this.invEls.batteries.textContent = '0';
    this.invEls.keys.textContent = '0';
    this.monsterDistEl.textContent = '';
    this.hint.classList.remove('show');
  }

  setObjective(text) {
    this.objEl.textContent = text;
  }

  setFilmGrain(on) {
    if (!on) return;
    // grain element not strictly separated; we rely on CSS grain in menus.
  }

  showLoading(show) {
    // lightweight: no separate loading in this build
  }

  setInteractionPrompt({ show, text }) {
    if (!this.hint) return;
    if (show) {
      this.hint.textContent = text || 'Interact (E)';
      this.hint.classList.add('show');
    } else {
      this.hint.classList.remove('show');
    }
  }

  openPause(reason = 'manual') {
    this.menuWrap.style.display = 'flex';
    this._renderCenteredDialog({
      title: 'PAUSED',
      bodyLines: [
        'Hold your breath.',
        'Press Resume to return.',
        reason === 'escape' ? 'Mouse released (Esc).'
          : reason === 'auto' ? 'Tab hidden. Game paused.' : ''
      ],
      buttons: [
        { label: 'Resume', small: 'Esc', onClick: () => this.app.resumeFromPause() },
        { label: 'Restart', small: 'New game', onClick: () => this._restartFromDialog() },
        { label: 'Main Menu', small: 'Exit session', onClick: () => this._backToMenu() }
      ]
    });
  }

  closePause() {
    // Hide pause overlay by resuming
    this.menuWrap.style.display = 'none';
  }

  _restartFromDialog() {
    this.menuWrap.style.display = 'none';
    this.app.startNewGame();
  }

  _backToMenu() {
    this.menuWrap.style.display = 'flex';
    this.app.state = 'menu';
    this.showMainMenu();
    this._ensureHUD(false);
  }

  openSettings() {
    this.menuWrap.style.display = 'flex';
    this._renderSettingsDialog();
  }

  _renderSettingsDialog() {
    this._renderCenteredDialog({
      title: 'SETTINGS',
      bodyEl: this._settingsContent(),
      buttons: [
        { label: 'Back', small: 'Close', onClick: () => this.showMainMenu() }
      ],
      wide: true
    });
  }

  _settingsContent() {
    const container = document.createElement('div');
    container.className = 'menu';

    const h2 = document.createElement('h2');
    h2.textContent = 'Graphics';
    container.appendChild(h2);

    const shadowsRow = this._sliderRow('Shadows', 1, 0, 1, (v) => {
      this._tempQuality.shadows = !!v;
    });

    const fogRow = this._sliderRow('Volumetric Fog', 1, 0, 1, (v) => {
      this._tempQuality.volumetricFog = !!v;
    });

    container.appendChild(shadowsRow);
    container.appendChild(fogRow);

    const presetRow = document.createElement('div');
    presetRow.className = 'slider-row';
    const lab = document.createElement('label');
    lab.textContent = 'Quality Preset';
    presetRow.appendChild(lab);

    const select = document.createElement('select');
    select.style.flex = '1';
    select.style.background = 'rgba(12,16,30,.6)';
    select.style.border = '1px solid rgba(148,160,255,.18)';
    select.style.color = '#d7deff';
    ['Low','Medium','High'].forEach(p => {
      const opt = document.createElement('option');
      opt.value = p; opt.textContent = p;
      select.appendChild(opt);
    });

    select.onchange = () => {
      const p = select.value;
      this._tempQuality.preset = p;
      if (p === 'Low') { this._tempQuality.shadows = false; this._tempQuality.volumetricFog = true; }
      if (p === 'Medium') { this._tempQuality.shadows = true; this._tempQuality.volumetricFog = true; }
      if (p === 'High') { this._tempQuality.shadows = true; this._tempQuality.volumetricFog = true; }
      // apply immediately
      this.app.setQuality(this._tempQuality);
    };

    presetRow.appendChild(select);

    container.appendChild(presetRow);

    const h2b = document.createElement('h2');
    h2b.textContent = 'Sensitivity';
    container.appendChild(h2b);

    const sensRow = document.createElement('div');
    sensRow.className = 'slider-row';
    const lab2 = document.createElement('label'); lab2.textContent = 'Mouse';
    sensRow.appendChild(lab2);
    const range = document.createElement('input');
    range.type = 'range'; range.min='0.6'; range.max='2.2'; range.step='0.01'; range.value='1.0';
    const val = document.createElement('div');
    val.className = 'val'; val.textContent = range.value;
    range.oninput = () => { val.textContent = range.value; this.app.player.sensitivity = 0.0022 * parseFloat(range.value); };
    sensRow.appendChild(range); sensRow.appendChild(val);
    container.appendChild(sensRow);

    this._tempQuality = { ...this.app.quality };
    select.value = this.app.quality.preset ?? 'High';

    // initial apply from app quality
    const applyBtn = document.createElement('div');
    applyBtn.className = 'btn';
    applyBtn.innerHTML = `<div>Apply</div><small>Keep changes</small>`;
    applyBtn.onclick = () => {
      this.app.setQuality(this._tempQuality);
      this.toast('Settings applied.');
      this.showMainMenu();
    };
    container.appendChild(applyBtn);

    return container;
  }

  _sliderRow(label, value, min, max, onChange) {
    const row = document.createElement('div');
    row.className = 'slider-row';

    const lab = document.createElement('label');
    lab.textContent = label;
    row.appendChild(lab);

    const range = document.createElement('input');
    range.type = 'range';
    range.min = String(min);
    range.max = String(max);
    range.step = '1';
    range.value = String(value);
    const val = document.createElement('div');
    val.className = 'val';
    val.textContent = range.value;

    range.oninput = () => {
      val.textContent = range.value;
      onChange(parseInt(range.value,10));
    };

    row.appendChild(range);
    row.appendChild(val);
    return row;
  }

  openCredits() {
    this.menuWrap.style.display = 'flex';
    this._renderCenteredDialog({
      title: 'CREDITS',
      bodyLines: [
        'THE LAST SIGNAL',
        'Built with Three.js (browser-first).',
        'Monster AI: patrol → investigate → LOS chase → search.',
        'Audio: procedural fallback if assets are missing.',
        'Level: compact, dense, cinematic lighting + fog + flashlight beam.'
      ],
      buttons: [
        { label: 'Back', small: 'Close', onClick: () => this.showMainMenu() }
      ]
    });
  }

  _renderCenteredDialog({ title, bodyLines = [], bodyEl = null, buttons = [], wide = false }) {
    this.menuCard.style.width = wide ? 'min(1120px, 96vw)' : 'min(980px, 96vw)';

    // Clear old
    this.menuCard.querySelectorAll('.dialog-ui').forEach(n => n.remove());

    const dialog = document.createElement('div');
    dialog.className = 'dialog-ui';
    dialog.style.position = 'relative';
    dialog.style.zIndex = '2';
    dialog.style.padding = '18px';
    this.menuCard.appendChild(dialog);

    // Title
    const t = document.createElement('div');
    t.className = 'dialog-title';
    t.textContent = title;
    dialog.appendChild(t);

    dialog.appendChild(document.createElement('div')).style.height = '10px';

    const body = document.createElement('div');
    if (bodyEl) {
      body.appendChild(bodyEl);
    } else {
      const p = document.createElement('div');
      p.className = 'menu';
      p.style.marginTop = '10px';
      for (const line of bodyLines) {
        if (!line) continue;
        const sp = document.createElement('div');
        sp.style.padding = '6px 4px';
        sp.style.color = 'var(--text)';
        sp.style.fontSize = '14px';
        sp.textContent = line;
        p.appendChild(sp);
      }
      body.appendChild(p);
    }
    dialog.appendChild(body);

    // Buttons area
    const btnRow = document.createElement('div');
    btnRow.style.display = 'grid';
    btnRow.style.gridTemplateColumns = buttons.length > 1 ? 'repeat(3, minmax(0,1fr))' : '1fr';
    btnRow.style.gap = '10px';
    btnRow.style.marginTop = '14px';
    dialog.appendChild(btnRow);

    for (const b of buttons) {
      const el = document.createElement('div');
      el.className = 'btn';
      el.innerHTML = `<div>${b.label}</div><small>${b.small || ''}</small>`;
      el.onclick = b.onClick;
      btnRow.appendChild(el);
    }
  }

  _ensureToast() {
    if (this._toastEl) return this._toastEl;
    const el = document.createElement('div');
    el.className = 'toast';
    document.body.appendChild(el);
    this._toastEl = el;
    return el;
  }

  toast(msg) {
    const el = this._ensureToast();
    el.textContent = msg;
    el.style.opacity = '1';
    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => { el.style.opacity = '0'; }, 2600);
  }

  showNote(text) {
    // Use toast for compactness
    this.toast(text.split('\n').slice(0,3).join(' • ') + (text.split('\n').length>3 ? ' …' : ''));
    // For richer display, could open dialog, but keep minimal.
  }

  updateHUD({ flashlight, objective, inventory, batteries, monsterDistance }) {
    this.setObjective(objective);

    // Battery
    const pct = Math.max(0, Math.min(1, flashlight.battery / 100));
    this.battFill.style.width = `${Math.round(pct * 100)}%`;

    // Inventory
    this.invEls.batteries.textContent = String(batteries ?? inventory.batteries ?? 0);
    this.invEls.keys.textContent = String(inventory.keys?.length ?? 0);

    // Threat
    const d = monsterDistance;
    const label = d < 2.5 ? 'Close' : d < 7 ? 'Hunting' : d < 14 ? 'Nearby' : 'Distant';
    this.monsterDistEl.textContent = `${label} • ${d ? d.toFixed(1) : '--'}m`;
  }

  showGameOver() {
    this.menuWrap.style.display = 'flex';
    this._renderCenteredDialog({
      title: 'GAME OVER',
      bodyLines: [
        'The signal ended—so did you.',
        'Try again. This time, hide smarter.'
      ],
      buttons: [
        { label: 'Restart', small: 'New Game', onClick: () => this.app.startNewGame() },
        { label: 'Main Menu', small: 'Quit', onClick: () => this.showMainMenu() }
      ]
    });
    this._ensureHUD(false);
  }

  showEnding() {
    this.menuWrap.style.display = 'flex';
    this._renderCenteredDialog({
      title: 'YOU ESCAPED',
      bodyLines: [
        'Electricity returns.',
        'The monster follows the last signal… and misses you.',
        'Somewhere in the dark: silence.'
      ],
      buttons: [
        { label: 'Restart', small: 'Run it back', onClick: () => this.app.startNewGame() },
        { label: 'Main Menu', small: 'Back', onClick: () => this.showMainMenu() }
      ]
    });
    this._ensureHUD(false);
  }
}
