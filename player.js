import * as THREE from 'three';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export class Player {
  constructor(camera, domElement) {
    this.camera = camera;
    this.domElement = domElement;

    this.position = new THREE.Vector3();
    this.velocity = new THREE.Vector3();

    // Movement
    this.moveSpeed = 3.2;
    this.sprintSpeed = 5.2;
    this.crouchSpeed = 1.85;
    this.jumpImpulse = 0; // no jumping in this horror layout
    this.friction = 10;
    this.gravity = 18;

    this.yStanding = 1.70;
    this.yCrouch = 1.12;
    this.isCrouching = false;

    // Look
    this.yaw = 0;
    this.pitch = 0;
    this.sensitivity = 0.0022;

    this.pointerLocked = false;
    this.paused = false;

    // Flashlight
    this.flashlight = {
      enabled: true,
      battery: 100,     // percent
      drainRate: 4.6,  // % per minute baseline
      range: 16
    };

    this._setupInput();
  }

  _setupInput() {
    this.keys = new Set();

    window.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      if (['KeyW','KeyA','KeyS','KeyD','ShiftLeft','ShiftRight','ControlLeft','ControlRight','KeyE','KeyF'].includes(e.code)) {
        this.keys.add(e.code);
      }
      if (e.code === 'KeyE') {
        this._maybeInteract();
      }
      if (e.code === 'KeyF') {
        this.onToggleFlashlight?.();
      }
      if (e.code === 'ControlLeft' || e.code === 'ControlRight') {
        this.isCrouching = true;
      }
    });

    window.addEventListener('keyup', (e) => {
      if (this.keys.has(e.code)) this.keys.delete(e.code);
      if (e.code === 'ControlLeft' || e.code === 'ControlRight') this.isCrouching = false;
    });

    window.addEventListener('mousemove', (e) => {
      if (this.paused) return;
      if (document.pointerLockElement !== this.domElement) return;
      this.pointerLocked = true;

      this.yaw -= e.movementX * this.sensitivity;
      this.pitch -= e.movementY * this.sensitivity;

      this.pitch = clamp(this.pitch, -1.28, 1.05);
    });

    window.addEventListener('pointerlockchange', () => {
      this.pointerLocked = document.pointerLockElement === this.domElement;
    });
  }

  _maybeInteract() {
    if (this.paused) return;
    if (document.pointerLockElement !== this.domElement) return;
    // E action triggers UI logic through callback
    this.onInteract?.();
  }

  setPaused(v) {
    this.paused = v;
    this.velocity.set(0,0,0);
  }

  reset(spawn) {
    this.position.copy(spawn);
    this.velocity.set(0,0,0);
    this.yaw = spawn.yaw ?? 0;
    this.pitch = -0.08;

    this.camera.position.set(this.position.x, this.isCrouching ? this.yCrouch : this.yStanding, this.position.z);
    this.camera.rotation.set(this.pitch, this.yaw, 0);

    // defaults
    this.flashlight.battery = 100;
    this.flashlight.enabled = true;
  }

  setFromSave(save) {
    this.position.copy(save.position);
    this.velocity.copy(save.velocity);
    this.yaw = save.yaw;
    this.pitch = save.pitch;
    this.isCrouching = save.isCrouching;
    this.flashlight = { ...this.flashlight, ...save.flashlight };
    this.camera.position.set(this.position.x, this.isCrouching ? this.yCrouch : this.yStanding, this.position.z);
    this.camera.rotation.set(this.pitch, this.yaw, 0);
  }

  getSave() {
    return {
      position: this.position.clone(),
      velocity: this.velocity.clone(),
      yaw: this.yaw,
      pitch: this.pitch,
      isCrouching: this.isCrouching,
      flashlight: { ...this.flashlight }
    };
  }

  update(dt, world) {
    // Update camera orientation
    this.camera.rotation.set(this.pitch, this.yaw, 0);

    if (!this.pointerLocked || this.paused) {
      // still update flashlight battery drain slowly (optional)
      this._updateFlashlight(dt);
      return;
    }

    // Inputs
    const forward = (this.keys.has('KeyW') ? 1 : 0) - (this.keys.has('KeyS') ? 1 : 0);
    const side = (this.keys.has('KeyD') ? 1 : 0) - (this.keys.has('KeyA') ? 1 : 0);

    const wantsSprint = this.keys.has('ShiftLeft') || this.keys.has('ShiftRight');
    const speed = this.isCrouching ? this.crouchSpeed : (wantsSprint ? this.sprintSpeed : this.moveSpeed);

    // Compute movement in world space from yaw
    const dir = new THREE.Vector3();
    dir.x = Math.sin(this.yaw) * forward + Math.cos(this.yaw) * side;
    dir.z = -Math.cos(this.yaw) * forward + Math.sin(this.yaw) * side;

    if (dir.lengthSq() > 0) dir.normalize();

    // Apply acceleration
    const targetVx = dir.x * speed;
    const targetVz = dir.z * speed;

    // friction / smoothing
    this.velocity.x = THREE.MathUtils.lerp(this.velocity.x, targetVx, 1 - Math.exp(-dt * 12));
    this.velocity.z = THREE.MathUtils.lerp(this.velocity.z, targetVz, 1 - Math.exp(-dt * 12));

    // Gravity placeholder (floor collision handled by world)
    this.velocity.y -= this.gravity * dt;

    // Attempt move with collision
    const next = this.position.clone().addScaledVector(this.velocity, dt);
    const corrected = world.moveAndCollide(this.position, next, {
      radius: 0.28,
      heightStanding: this.yStanding,
      heightCrouch: this.yCrouch,
      isCrouching: this.isCrouching
    });

    this.position.copy(corrected.position);

    // Set camera height based on crouch
    const camY = this.isCrouching ? this.yCrouch : this.yStanding;
    this.camera.position.set(this.position.x, camY, this.position.z);

    // Battery update
    this._updateFlashlight(dt);

    // Noise strength (simple heuristic)
    const moving = Math.abs(forward) + Math.abs(side) > 0.2;
    if (moving) {
      const base = wantsSprint && !this.isCrouching ? 0.75 : (this.isCrouching ? 0.35 : 0.5);
      this.onFootstepNoise?.(base, dt);
    }
  }

  _updateFlashlight(dt) {
    if (!this.flashlight.enabled) return;
    if (this.flashlight.battery <= 0) {
      this.flashlight.enabled = false;
      return;
    }

    // drain percent per second
    const drainPerSecond = this.flashlight.drainRate / 60;
    this.flashlight.battery = Math.max(0, this.flashlight.battery - drainPerSecond * (dt * 1.0));
  }
}
