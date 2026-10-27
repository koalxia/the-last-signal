import * as THREE from 'three';

const tmpV = new THREE.Vector3();

export class Interactions {
  constructor(world, player, monster) {
    this.world = world;
    this.player = player;
    this.monster = monster;

    this.interactionables = [];
    this.flashlightObj = null;
    this.flashlightBeam = null;
    this.flashlightShadow = null;

    this.inventory = {
      batteries: 0,
      keys: new Set()
    };

    this._batteryCount = 0;

    this.flashlightVisualEnabled = true;

    this._ray = new THREE.Raycaster();
    this._lastInteractTime = 0;
    this._paused = false;

    this._monsterCallbacks = {
      onSuspiciousSound: () => {},
      onPlayerNoise: () => {}
    };

    this._saveSync = {
      exitUnlocked: false
    };

    // Game state locks
    this.solved = {
      lockerOpened: false,
      generatorRestored: false,
      cabinetOpened: false,
      exitUnlocked: false
    };

    this._pendingPickupIds = new Set();

    // Hook player noise
    this.player.onFootstepNoise = (strength) => {
      this._monsterCallbacks.onPlayerNoise?.(strength);
    };
  }

  init() {
    // Collect all interactionables from the world by scanning its children with userData.type
    this.world.scene.traverse(obj => {
      if (obj.userData?.type) {
        this.interactionables.push(obj);
      }
    });

    // But in this project we didn’t store note/cabinet references in world.interactionables reliably.
    // We'll instead use world.interactionables already created.
    if (this.world.interactionables?.length) {
      this.interactionables = this.world.interactionables;
    }

    this._buildFlashlight();
    this.resetGame();
  }

  resetGame() {
    // default inventory
    this.inventory.batteries = 1; // slight forgiveness
    this.inventory.keys.clear();

    this._batteryCount = this.inventory.batteries;

    this.solved = {
      lockerOpened: false,
      generatorRestored: false,
      cabinetOpened: false,
      exitUnlocked: false
    };

    // Hide key pickups that should be hidden
    const keyGen = this.world._handles?.keyGen;
    const exitKey = this.world._handles?.exitKey;
    const cabinet = this.world._handles?.cabinet;
    if (keyGen) keyGen.visible = false;
    if (exitKey) exitKey.visible = false;
    if (cabinet) cabinet.userData.opened = false;

    // Lock batteries (already in scene; they can be collected).
    // But we’ll reset “taken” via userData.reset if present.
    for (const obj of this.interactionables) {
      const u = obj.userData;
      if (!u) continue;
      if (u.reset) u.reset();
      if (u.type === 'battery' || u.type === 'key' || u.type === 'note') {
        u.taken = false;
      }
      if (u.type === 'key' && u.hiddenByDefault) obj.visible = false;
    }

    // Ensure notes are visible
    for (const obj of this.interactionables) {
      if (obj.userData?.type === 'note') obj.visible = true;
    }
  }

  applySave(saveInteractions) {
    // Minimal: rebuild from progression flags if needed
    // For this task, we keep New Game robust and omit complex save restore.
    // Continue button could be wired, but world doesn't implement full save pipeline here.
  }

  getInventorySummary() {
    return {
      batteries: this.inventory.batteries,
      keys: Array.from(this.inventory.keys).slice(0, 4)
    };
  }

  getBatteryCount() {
    return this.inventory.batteries;
  }

  toggleFlashlight() {
    if (this.player.flashlight.battery <= 0) {
      this.player.flashlight.enabled = false;
      return;
    }
    this.player.flashlight.enabled = !this.player.flashlight.enabled;
    this.flashlightVisualEnabled = this.player.flashlight.enabled;
  }

  setMonsterCallbacks(cb) {
    this._monsterCallbacks = { ...this._monsterCallbacks, ...cb };
  }

  _buildFlashlight() {
    // Attach a cone beam to the camera
    const group = new THREE.Group();
    group.name = 'FlashlightRig';

    const cone = new THREE.Mesh(
      new THREE.ConeGeometry(0.1, 1.0, 18, 1, true),
      new THREE.MeshBasicMaterial({ color: 0x9fe8ff, transparent: true, opacity: 0.16 })
    );
    cone.name = 'FlashlightCone';

    // Add inner brighter
    const inner = new THREE.Mesh(
      new THREE.ConeGeometry(0.06, 1.0, 18, 1, true),
      new THREE.MeshBasicMaterial({ color: 0xd8f8ff, transparent: true, opacity: 0.12 })
    );

    group.add(inner, cone);
    this.flashlightBeam = { group, cone, inner };

    // Light with shadows
    const point = new THREE.PointLight(0x9fe8ff, 0.9, 22, 1.7);
    point.castShadow = false;
    group.add(point);

    // Cone “shadow” is approximated by ray-based darkening; true shadow cone is expensive.
    // We still enable renderer shadows; flashlight uses a point light w/out cast shadows.
    this.flashlightObj = { group, light: point };

    // Add to camera
    this.player.camera.add(group);
    group.position.set(0.0, 0.0, 0.0);

    // Disable initially
    group.visible = this.player.flashlight.enabled;
  }

  _updateFlashlightVisuals() {
    const enabled = this.player.flashlight.enabled && this.player.flashlight.battery > 0.01;
    if (this.flashlightObj) {
      this.flashlightObj.group.visible = enabled;
      const battery = this.player.flashlight.battery / 100;
      const range = this.player.flashlight.range * (0.5 + 0.5 * battery);
      this.flashlightObj.light.intensity = enabled ? (0.65 + 0.8 * battery) : 0;
      this.flashlightObj.light.distance = range;

      // beam length scale
      if (this.flashlightBeam?.cone) {
        this.flashlightBeam.cone.scale.set(1, range, 1);
        this.flashlightBeam.inner.scale.set(1, range, 1);
        const op = enabled ? (0.10 + 0.10 * battery) : 0;
        this.flashlightBeam.cone.material.opacity = op;
        this.flashlightBeam.inner.material.opacity = op * 0.75;
      }
    }
  }

  _findInteractable() {
    // Raycast from camera center.
    this._ray.setFromCamera(new THREE.Vector2(0, 0), this.player.camera);
    // Prefer scanning world objects with userData.type
    const candidates = this.interactionables.map(o => o);
    const hits = this._ray.intersectObjects(candidates, true);

    // Return top-level interaction object
    if (hits.length === 0) return null;

    // Find first parent with userData.type
    let obj = hits[0].object;
    while (obj && !obj.userData?.type && obj.parent) obj = obj.parent;
    if (!obj?.userData?.type) return null;

    return obj;
  }

  tryInteract() {
    const now = performance.now();
    if (now - this._lastInteractTime < 250) return;
    this._lastInteractTime = now;
    if (this._paused) return;

    const target = this._findInteractable();
    if (!target) return;

    const type = target.userData.type;
    if (!type) return;

    this._handleInteract(target, type);
  }

  _handleInteract(obj, type) {
    if (!obj.visible) return;

    // Notes always readable
    if (type === 'note') {
      if (obj.userData.taken) return;
      obj.userData.taken = true;
      this.world._setObjective(
        this.world.objective.stage,
        'A note was added to your memory. Keep searching.'
      );
      // UI shows text via event
      window.__LAST_SIGNAL__?.ui?.showNote?.(obj.userData.text);
      // Update progression for puzzle clues
      const noteId = obj.userData.id;
      if (noteId === 'NOTE_OFFICE') this._markClue('office');
      if (noteId === 'NOTE_CHART') this._markClue('chart');
      // allow repeated interactions? No: only once, but doesn’t matter for puzzle.
      return;
    }

    if (type === 'battery') {
      if (obj.userData.taken) return;
      obj.userData.taken = true;
      obj.visible = false;
      this.inventory.batteries += 1;
      this._batteryCount = this.inventory.batteries;

      // small flashlight recharge
      this.player.flashlight.battery = Math.min(100, this.player.flashlight.battery + 38);
      this.world._setObjective(this.world.objective.stage, 'Battery secured. The facility is still breathing.');
      return;
    }

    if (type === 'key') {
      if (obj.userData.taken) return;
      if (obj.visible === false) return;
      obj.userData.taken = true;
      obj.visible = false;
      this.inventory.keys.add(obj.userData.keyId);
      this.world._setObjective(this.world.objective.stage, 'Key acquired. A lock somewhere is waiting.');
      return;
    }

    if (type === 'locker') {
      // Requires both clues (multi-step puzzle)
      if (obj.userData.opened) return;
      const ok = this._clues.office && this._clues.chart;
      if (!ok) {
        window.__LAST_SIGNAL__?.ui?.toast?.('Locker code not found. Search the office and medical chart notes.');
        return;
      }
      obj.userData.opened = true;
      obj.material.emissiveIntensity = 0.35;

      // Reveal generator key
      const keyGen = this.world._handles?.keyGen;
      if (keyGen) {
        keyGen.visible = true;
      }
      this.solved.lockerOpened = true;
      this.world._setObjective(1, 'The locker yields a generator key. Restore electricity.');
      return;
    }

    if (type === 'cabinet') {
      if (obj.userData.opened) return;

      // Cabinet requires generator key
      if (!this.inventory.keys.has(obj.userData.requiredKey)) {
        window.__LAST_SIGNAL__?.ui?.toast?.('The cabinet is locked. You need the generator key.');
        return;
      }
      obj.userData.opened = true;
      obj.material.emissive = new THREE.Color(0x7bff9a);
      obj.material.emissiveIntensity = 0.55;

      // Reveal exit key
      const exitKey = this.world._handles?.exitKey;
      if (exitKey) exitKey.visible = true;

      this.solved.cabinetOpened = true;
      this.world._setObjective(2, 'Exit key found. Restore electricity, then unlock the final door.');
      return;
    }

    if (type === 'switch') {
      // Generator switch: requires generator key? (adds tension)
      const switchId = obj.userData.id;
      if (switchId !== 'SWITCH_GENERATOR') return;

      if (this.solved.generatorRestored) {
        window.__LAST_SIGNAL__?.ui?.toast?.('The generator is already alive.');
        return;
      }

      if (!this.inventory.keys.has('key_generator')) {
        window.__LAST_SIGNAL__?.ui?.toast?.('You need the generator key before you can trigger the main power.');
        return;
      }

      obj.userData.pressed = true;
      obj.material.emissiveIntensity = 0.45;

      this.world.power.generatorLeverFlipped = true;
      this.world.power.restored = true;
      this.solved.generatorRestored = true;

      // Recharge visual power
      this.world._setPowerVisuals(true);

      // Unlock exit after cabinet opened + exit key exists
      this.world._setObjective(3, 'Power restored. Return to the exit door and unlock it.');
      return;
    }
  }

  _markClue(which) {
    if (!this._clues) this._clues = { office: false, chart: false };
    this._clues[which] = true;
    // progressively update UI
    if (this._clues.office && !this._clues.chart) {
      window.__LAST_SIGNAL__?.ui?.toast?.('Office note found. A medical chart number is still missing.');
    }
    if (this._clues.chart && !this._clues.office) {
      window.__LAST_SIGNAL__?.ui?.toast?.('Chart clue found. You still need the office note.');
    }
    if (this._clues.office && this._clues.chart) {
      window.__LAST_SIGNAL__?.ui?.toast?.('Puzzle complete hints unlocked. The locker should open.');
    }
  }

  update(dt) {
    // Update flashlight visuals regardless of interactions.
    this._updateFlashlightVisuals();

    // Crosshair UI + prompt
    const target = this._findInteractable();
    const canInteract = !!target && target.visible !== false && !target.userData?.picked;

    window.__LAST_SIGNAL__?.ui?.setInteractionPrompt({
      show: canInteract && document.pointerLockElement === this.player.domElement,
      text: this._interactionText(target)
    });

    // Unlock exit logic:
    // Exit door locked by key_exit and power restored.
    // We'll unlock when player has exit key and power restored.
    if (!this.world.exit.unlocked) {
      if (this.world.power.restored && this.inventory.keys.has('key_exit')) {
        this.world.exit.unlocked = true;
        this.world._setObjective(4, 'Exit unlocked. Reach the final route and survive the last minutes.');
        if (this.world.exitDoor) {
          this.world.exitDoor.userData.locked = false;
          this.world.exitDoor.userData.open = true;
          // Hide it to allow passage
          this.world.exitDoor.visible = false;
          this.world.exitDoor.material.emissiveIntensity = 1.0;
        }
      }
    }
  }

  _interactionText(target) {
    if (!target) return '';
    const t = target.userData.type;
    const id = target.userData.id;
    if (t === 'note') return 'Read note (E)';
    if (t === 'battery') return 'Pick up battery (E)';
    if (t === 'key') return 'Pick up key (E)';
    if (t === 'locker') return 'Open locker (E)';
    if (t === 'cabinet') return 'Open cabinet (E)';
    if (t === 'switch') return 'Flip generator switch (E)';
    return 'Interact (E)';
  }

  isExitUnlocked() {
    return this.world.exit.unlocked;
  }

  playerReachedExit() {
    // Exit area near back of building
    const exitCenter = new THREE.Vector3(0, 0, -49.5);
    const d = this.player.position.distanceTo(exitCenter);
    this.world.exit.reached = d < 2.2;
    return this.world.exit.reached;
  }

  isPlayerHidden() {
    const spots = this.world.hidingSpots || [];
    if (!spots.length) return false;
    const p = this.player.position;

    // Player is “hidden” if inside any spot radius and flashlight is off (fair mechanic).
    const flashlightOff = !this.player.flashlight.enabled;
    if (!flashlightOff) return false;

    for (const s of spots) {
      const r = s.userData?.radius ?? 1.0;
      if (p.distanceTo(s.position) <= r) return true;
    }
    return false;
  }
}
