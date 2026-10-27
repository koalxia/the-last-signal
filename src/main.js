import * as THREE from 'three';
import { Player } from './player.js';
import { World } from './world.js';
import { Monster } from './monster.js';
import { Interactions } from './interactions.js';
import { AudioSystem } from './audio.js';
import { UI } from './ui.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export class GameApp {
  constructor() {
    this.clock = new THREE.Clock();

    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    document.body.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.FogExp2(0x070b14, 0.028);

    this.camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.05, 180);
    this.camera.position.set(0, 1.7, 0);

    this.world = new World(this.scene, this.camera);
    this.player = new Player(this.camera, this.renderer.domElement);
    this.monster = new Monster(this.scene, this.world);
    this.interactions = new Interactions(this.world, this.player, this.monster);
    this.audio = new AudioSystem(this.scene);
    this.ui = new UI(this, {
      rootEl: document.getElementById('app-root'),
      overlayEl: document.getElementById('game-overlay')
    });

    this._bindEvents();

    this.quality = {
      preset: 'High',
      shadows: true,
      volumetricFog: true,
      filmGrain: true
    };

    this.state = 'menu'; // menu | playing | paused | gameover | ending
    this._lastFrame = performance.now();

    this._initEnvironment();
    this._initSystems();
    this._animate();
  }

  _bindEvents() {
    window.addEventListener('resize', () => this._onResize());
    window.addEventListener('visibilitychange', () => {
      if (document.hidden) this.pause('auto');
    });

    document.addEventListener('pointerlockchange', () => {
      if (document.pointerLockElement !== this.renderer.domElement) {
        if (this.state === 'playing') this.pause('escape');
      }
    });

    window.addEventListener('keydown', (e) => {
      if (e.code === 'Escape') {
        if (this.state === 'playing') this.pause('escape');
        return;
      }
    });
  }

  _initEnvironment() {
    // Cinematic tonemapping + subtle contrast
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.02;

    // Two key lights: red emergency + cool ambient
    this.world.buildCinematicLights(this.scene);

    // Volume-ish fog
    this.world.setFogEnabled(true);

    // Sunless night sky placeholder
    this.scene.background = new THREE.Color(0x050711);
  }

  _initSystems() {
    this.world.initLevel();
    this.interactions.init();
    this.audio.init();

    this.player.onInteract = () => {
      this.interactions.tryInteract();
    };

    this.player.onToggleFlashlight = () => {
      this.interactions.toggleFlashlight();
    };

    this.player.onPauseRequest = () => {
      if (this.state === 'playing') this.pause('escape');
    };

    this.monster.onGameOver = () => {
      this.setGameOver();
    };

    // Monster hears footsteps + investigation cues
    this.interactions.setMonsterCallbacks({
      onSuspiciousSound: (pos, strength) => this.monster.hear(pos, strength),
      onPlayerNoise: (strength) => this.monster.hear(this.player.position.clone(), strength)
    });

    this.player.reset(this.world.getPlayerSpawn());
    this.monster.reset(this.world.getMonsterSpawn());
  }

  setQuality(opts = {}) {
    Object.assign(this.quality, opts);
    this.renderer.shadowMap.enabled = !!this.quality.shadows;
    this.world.setFogEnabled(!!this.quality.volumetricFog);
    this.ui.setFilmGrain(!!this.quality.filmGrain);
  }

  startNewGame() {
    this.state = 'playing';
    this.ui.showLoading(false);

    // Reset world + player + monster + UI trackers
    this.world.reset();
    this.interactions.resetGame();
    this.audio.reset();

    this.player.reset(this.world.getPlayerSpawn());
    this.monster.reset(this.world.getMonsterSpawn());

    this.ui.resetHUD();
    this.ui.setObjective(this.world.getObjectiveText());

    this.audio.resumeAmbience();
    this._requestPointerLock();
  }

  continueGame() {
    this.state = 'playing';
    this.ui.showLoading(false);

    this.player.setFromSave(this.world.saveState.player);
    this.monster.setFromSave(this.world.saveState.monster);
    this.interactions.applySave(this.world.saveState.interactions);
    this.audio.applySave(this.world.saveState.audio);

    this.ui.resetHUD();
    this.ui.setObjective(this.world.getObjectiveText());
    this.audio.resumeAmbience();
    this._requestPointerLock();
  }

  _requestPointerLock() {
    if (this.state !== 'playing') return;
    this.renderer.domElement.requestPointerLock?.();
  }

  pause(reason = 'manual') {
    if (this.state !== 'playing') return;
    this.state = 'paused';
    this.player.setPaused(true);
    this.ui.openPause(reason);
    this.audio.pauseAmbience();
    if (document.pointerLockElement === this.renderer.domElement) {
      document.exitPointerLock?.();
    }
  }

  resumeFromPause() {
    if (this.state !== 'paused') return;
    this.state = 'playing';
    this.player.setPaused(false);
    this.ui.closePause();
    this.audio.resumeAmbience();
    this._requestPointerLock();
  }

  setGameOver() {
    if (this.state !== 'playing') return;
    this.state = 'gameover';
    this.player.setPaused(true);
    this.ui.showGameOver();
    this.audio.stopCombat();
    if (document.pointerLockElement === this.renderer.domElement) document.exitPointerLock?.();
  }

  setEnding() {
    if (this.state !== 'playing') return;
    this.state = 'ending';
    this.player.setPaused(true);
    this.ui.showEnding();
    this.audio.stopCombat();
    if (document.pointerLockElement === this.renderer.domElement) document.exitPointerLock?.();
  }

  _onResize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  }

  _animate() {
    requestAnimationFrame(() => this._animate());
    const dt = clamp(this.clock.getDelta(), 0, 0.033);
    this._lastFrame = performance.now();

    if (this.state === 'playing') {
      this.player.update(dt, this.world);
      this.world.update(dt);
      this.monster.update(dt, this.player, this.world, this.interactions);
      this.interactions.update(dt);

      this.audio.update(this.player, this.monster, dt);
      this.ui.updateHUD({
        flashlight: this.player.flashlight,
        objective: this.world.getObjectiveText(),
        inventory: this.interactions.getInventorySummary(),
        batteries: this.interactions.getBatteryCount(),
        monsterDistance: this.monster.getDistanceToPlayer(this.player.position)
      });

      // Escape / ending checks
      if (this.interactions.isExitUnlocked() && this.interactions.playerReachedExit()) {
        this.setEnding();
      }
    }

    // render always for smooth pause/menu visuals
    this.renderer.render(this.scene, this.camera);
  }
}

const app = new GameApp();
window.__LAST_SIGNAL__ = app; // for UI buttons to call safely
export { app };
