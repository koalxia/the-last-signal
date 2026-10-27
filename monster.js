import * as THREE from 'three';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

function smoothDamp(current, target, lambda, dt) {
  // Simple critically damped smoothing
  const t = 1 - Math.exp(-lambda * dt);
  return current + (target - current) * t;
}

function hasLineOfSight(raycaster, from, to, objects) {
  const dir = to.clone().sub(from);
  const dist = dir.length();
  if (dist < 0.001) return true;

  raycaster.set(from, dir.clone().normalize());
  raycaster.far = dist - 0.02;
  const hits = raycaster.intersectObjects(objects, true);
  return hits.length === 0;
}

export class Monster {
  constructor(scene, world) {
    this.scene = scene;
    this.world = world;

    this.model = new THREE.Group();
    this.scene.add(this.model);

    this.raycaster = new THREE.Raycaster();
    this.losObjects = [];

    // Anim-like motion
    this.speedPatrol = 1.35;
    this.speedChase = 2.45;
    this.speedSearch = 1.9;

    this.state = 'patrol'; // patrol | investigate | chase | search | hide
    this.timer = 0;
    this.lastSeenTime = 0;
    this.lastKnownPos = new THREE.Vector3();
    this.stun = 0;

    this.sightRange = 18;
    this.sightFov = Math.cos(THREE.MathUtils.degToRad(42)); // half angle

    this.hearingRange = 28;
    this.investigateTarget = new THREE.Vector3();

    this.searchPoints = [];
    this.searchIndex = 0;

    this.onGameOver = () => {};

    this._buildCreature();
    this._setupNavGrid();
    this.reset(new THREE.Vector3(10, 0, -12));
  }

  _buildCreature() {
    // Original “Unreal-ish” creature silhouette using layered geometry
    // (Not a skinned model—still fully interactive and unsettling.)
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0x0b0f1f, roughness: 0.75, metalness: 0.25, emissive: 0x050000, emissiveIntensity: 0.15 });
    const skinMat = new THREE.MeshStandardMaterial({ color: 0x0a0d18, roughness: 0.95, metalness: 0.1 });

    const spine = new THREE.Mesh(new THREE.CapsuleGeometry(0.35, 0.9, 10, 18), bodyMat);
    spine.position.y = 0.95;

    const hump = new THREE.Mesh(new THREE.SphereGeometry(0.38, 14, 14), bodyMat);
    hump.position.y = 1.45;

    const head = new THREE.Mesh(new THREE.SphereGeometry(0.22, 12, 12), skinMat);
    head.position.set(0, 1.75, -0.42);

    const jaw = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.1, 0.25), skinMat);
    jaw.position.set(0.04, 1.7, -0.62);

    const eyeGlow = new THREE.Mesh(new THREE.SphereGeometry(0.03, 8, 8), new THREE.MeshStandardMaterial({
      color: 0xff2b2b, emissive: 0xff2b2b, emissiveIntensity: 4.0, roughness: 0.4, metalness: 0.1
    }));
    eyeGlow.position.set(0.08, 1.78, -0.55);

    const tail = new THREE.Mesh(new THREE.CapsuleGeometry(0.14, 0.55, 10, 14), skinMat);
    tail.rotation.z = 0.2;
    tail.position.set(0.02, 1.05, 0.3);

    // Legs
    const legMat = new THREE.MeshStandardMaterial({ color: 0x060913, roughness: 0.95, metalness: 0.08 });
    const makeLeg = (x, zOff) => {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.12, 0.55, 8), legMat);
      leg.position.set(x, 0.7, zOff);
      return leg;
    };

    const legs = new THREE.Group();
    const l1 = makeLeg(-0.18, -0.05);
    const l2 = makeLeg(0.18, -0.05);
    const l3 = makeLeg(-0.22, 0.18);
    const l4 = makeLeg(0.22, 0.18);
    legs.add(l1, l2, l3, l4);

    this.model.add(spine, hump, head, jaw, eyeGlow, tail, legs);
    this.model.traverse(obj => {
      if (obj.isMesh) {
        obj.castShadow = true;
        obj.receiveShadow = false;
      }
    });
  }

  _setupNavGrid() {
    // Grid navigation around the interior.
    // World is bounded roughly by x [-9,9], z [-45..-2].
    this.nav = {
      cell: 1.0,
      xMin: -8,
      xMax: 8,
      zMin: -46,
      zMax: -1,
      w: 0,
      h: 0,
      blocks: new Set()
    };

    this.nav.w = Math.floor((this.nav.xMax - this.nav.xMin) / this.nav.cell);
    this.nav.h = Math.floor((this.nav.zMax - this.nav.zMin) / this.nav.cell);

    // Mark blocks by sampling world colliders AABBs.
    // Approx: use world.staticColliders as boxes.
    const blocks = this.nav.blocks;
    for (let ix = 0; ix < this.nav.w; ix++) {
      for (let iz = 0; iz < this.nav.h; iz++) {
        const x = this.nav.xMin + ix * this.nav.cell + this.nav.cell/2;
        const z = this.nav.zMin + iz * this.nav.cell + this.nav.cell/2;
        const y = 1.2;
        // collision check with AABB
        let blocked = false;
        for (const box of this.world.staticColliders) {
          if (x >= box.min.x && x <= box.max.x && z >= box.min.z && z <= box.max.z) {
            if (box.max.y > y && box.min.y < y + 1.8) {
              blocked = true; break;
            }
          }
        }
        // also allow doors by leaving space; our collision is approximate anyway
        if (blocked) blocks.add(`${ix},${iz}`);
      }
    }
  }

  reset(pos) {
    this.position = pos.clone();
    this.velocity = new THREE.Vector3();
    this.model.position.set(this.position.x, 0, this.position.z);

    // Patrol points around facility
    this.patrolPoints = [
      new THREE.Vector3(6, 0, -12),
      new THREE.Vector3(0, 0, -18),
      new THREE.Vector3(-6, 0, -26),
      new THREE.Vector3(6, 0, -33),
      new THREE.Vector3(-2, 0, -38)
    ];
    this.patrolIndex = 0;

    this.state = 'patrol';
    this.timer = 0;
    this.lastKnownPos.copy(this.position);
    this.searchPoints = [];
    this.searchIndex = 0;

    // eye glow
    this._setEye(false);
  }

  _setEye(awake) {
    this.model.traverse(obj => {
      if (obj.isMesh && obj.material?.emissive?.getHex && obj.material.emissive.getHex() === 0xff2b2b) {
        obj.material.emissiveIntensity = awake ? 5.2 : 1.2;
      }
    });
  }

  getDistanceToPlayer(playerPos) {
    return playerPos.distanceTo(this.position);
  }

  hear(pos, strength = 1) {
    const d = pos.distanceTo(this.position);
    if (d > this.hearingRange) return;

    this.lastKnownPos.copy(pos);
    if (this.state === 'patrol' || this.state === 'search' || this.state === 'investigate') {
      this.state = 'investigate';
      this.timer = 1.8 + strength * 1.2;
      this.investigateTarget.copy(pos);
      this._setEye(true);
    }
  }

  update(dt, player, world, interactions) {
    // Determine if player is hiding
    const isHidden = interactions?.isPlayerHidden?.() ?? false;

    // Unhide if flashlight is off? (Fairness: hiding works against investigation but not when monster sees directly)
    // Line-of-sight:
    const toPlayer = player.position.clone().sub(this.position);
    const dist = toPlayer.length();
    const forward = new THREE.Vector3(Math.sin(this.model.rotation.y), 0, Math.cos(this.model.rotation.y));
    const dir = toPlayer.clone().normalize();

    let canSee = false;
    if (dist < this.sightRange) {
      const dot = forward.dot(dir);
      if (dot > this.sightFov) {
        // LOS test: approximate objects list from world (only walls group not stored)
        // We'll just raycast against a broad set: scene children meshes.
        // Performance ok for a single ray.
        const objects = world.sceneChildrenForRay ?? (world.sceneChildrenForRay = world.sceneChildrenForRayBuild?.() ?? []);
        if (objects.length === 0 && !world._rayCacheBuilt) {
          world._rayCacheBuilt = true;
          world.sceneChildrenForRay = [];
          world.scene.traverse(o => { if (o.isMesh) world.sceneChildrenForRay.push(o); });
        }
        const objs = world.sceneChildrenForRay;

        this.raycaster.set(this.position.clone().add(new THREE.Vector3(0,1.6,0)), dir.clone(), 0, dist - 0.2);
        const hits = this.raycaster.intersectObjects(objs, true);
        canSee = hits.length === 0;
      }
    }

    if (canSee) {
      this.lastSeenTime += dt;
      this.state = isHidden ? 'search' : 'chase';
      this.lastKnownPos.copy(player.position);
      this._setEye(true);
    } else {
      if (this.state === 'chase') {
        // lost sight: transition to search
        this.state = 'search';
        this.timer = 4.0;
      }
      if (this.state === 'investigate' || this.state === 'search' || this.state === 'patrol') {
        this.lastSeenTime = 0;
      }
    }

    // Behavior
    if (this.stun > 0) {
      this.stun -= dt;
      this._stepTowards(this.position.clone(), 0, dt);
      return;
    }

    if (this.state === 'patrol') {
      this.timer -= dt;
      if (this.timer <= 0) {
        this.patrolIndex = (this.patrolIndex + 1) % this.patrolPoints.length;
        this.timer = 3.2 + Math.random() * 2.5;
      }
      const target = this.patrolPoints[this.patrolIndex];
      this._moveNav(target, dt, this.speedPatrol);
    }

    if (this.state === 'investigate') {
      this.timer -= dt;
      this._moveNav(this.investigateTarget, dt, this.speedSearch);
      if (this.timer <= 0) {
        this.state = 'search';
        this.timer = 2.8;
        // create nearby spiral points
        this.searchPoints = this._makeSearchRing(this.lastKnownPos);
        this.searchIndex = 0;
      }
    }

    if (this.state === 'chase') {
      this._moveNav(player.position, dt, this.speedChase);
      this._face(player.position, dt, 14);

      // Game over if too close
      if (dist < 1.05) {
        this.onGameOver?.();
      }
      // If player hidden while close, allow escape by slight grace.
      if (isHidden && dist < 2.2) {
        this.state = 'search';
        this.timer = 1.6;
      }
    }

    if (this.state === 'search') {
      this.timer -= dt;

      if (this.searchPoints.length === 0) {
        this.searchPoints = this._makeSearchRing(this.lastKnownPos);
        this.searchIndex = 0;
      }

      const target = this.searchPoints[this.searchIndex] || this.lastKnownPos;
      this._moveNav(target, dt, this.speedSearch);

      // rotate/search
      this._face(target.clone(), dt, 9);

      if (target.distanceTo(this.position) < 0.75) {
        this.searchIndex++;
      }
      if (this.timer <= 0) {
        this.state = 'patrol';
        this.timer = 3.0 + Math.random()*2.0;
      }
    }

    // Animate legs visually
    this._animateMotion(dt, player, isHidden);
  }

  _makeSearchRing(center) {
    const pts = [];
    for (let i=0;i<6;i++){
      const a = (i/6) * Math.PI*2;
      const r = 1.6 + Math.random()*1.2;
      const x = center.x + Math.cos(a)*r;
      const z = center.z + Math.sin(a)*r;
      pts.push(new THREE.Vector3(x, 0, z));
    }
    // ensure center last
    pts.push(center.clone());
    return pts;
  }

  _face(target, dt, rate) {
    const dir = target.clone().sub(this.position);
    dir.y = 0;
    if (dir.lengthSq() < 1e-4) return;
    const ang = Math.atan2(dir.x, dir.z);
    this.model.rotation.y = smoothDamp(this.model.rotation.y, ang, rate, dt);
  }

  _animateMotion(dt, player, isHidden) {
    // Leg swing + breathing
    const t = performance.now() * 0.001;
    const speed = this.state === 'chase' ? 2.2 : this.state === 'patrol' ? 1.1 : 1.6;
    const swing = Math.sin(t*speed) * 0.65;

    this.model.traverse(obj => {
      if (!obj.isMesh) return;
      if (obj.geometry?.type === 'CylinderGeometry') {
        const idx = obj.position.x < 0 ? -1 : 1;
        obj.rotation.x = swing * (0.25 + (idx*0.1));
        obj.rotation.z = swing * 0.08;
      }
    });

    const bob = isHidden ? 0.05 : (0.08 + (this.state === 'chase' ? 0.06 : 0.03));
    this.model.position.y = bob * Math.sin(t * (isHidden ? 2.0 : 2.7));
  }

  _stepTowards(target, speed, dt) {
    const to = target.clone().sub(this.position);
    to.y = 0;
    const d = to.length();
    if (d < 0.001) return;
    const dir = to.normalize();
    const step = Math.min(d, speed * dt);
    this.position.addScaledVector(dir, step);
    this.model.position.set(this.position.x, 0, this.position.z);
  }

  _moveNav(target, dt, speed) {
    // A* path on grid, computed occasionally to avoid heavy CPU.
    if (!this._path || this._pathTarget?.distanceTo(target) > 1.0 || this._pathIndex >= this._path.length) {
      this._pathTarget = target.clone();
      this._path = this._aStarPath(this.position, target);
      this._pathIndex = 0;
    }

    const path = this._path || [];
    if (path.length === 0) {
      this._stepTowards(target, speed, dt);
      this._face(target, dt, 12);
      return;
    }

    while (this._pathIndex < path.length && path[this._pathIndex].distanceTo(this.position) < 0.6) {
      this._pathIndex++;
    }
    const next = path[this._pathIndex] || target;
    this._stepTowards(next, speed, dt);
    this._face(next, dt, 12);
  }

  _worldToGrid(pos) {
    const ix = Math.floor((pos.x - this.nav.xMin) / this.nav.cell);
    const iz = Math.floor((pos.z - this.nav.zMin) / this.nav.cell);
    return { ix, iz };
  }

  _gridToWorld(ix, iz) {
    return new THREE.Vector3(
      this.nav.xMin + ix * this.nav.cell + this.nav.cell/2,
      0,
      this.nav.zMin + iz * this.nav.cell + this.nav.cell/2
    );
  }

  _isBlocked(ix, iz) {
    if (ix < 0 || iz < 0 || ix >= this.nav.w || iz >= this.nav.h) return true;
    return this.nav.blocks.has(`${ix},${iz}`);
  }

  _aStarPath(start, goal) {
    const s = this._worldToGrid(start);
    const g = this._worldToGrid(goal);

    const startKey = `${s.ix},${s.iz}`;
    const goalKey = `${g.ix},${g.iz}`;

    if (this._isBlocked(g.ix, g.iz)) return [];

    const open = new Set([startKey]);
    const came = new Map();
    const gScore = new Map();
    gScore.set(startKey, 0);

    const fScore = new Map();
    fScore.set(startKey, this._heuristic(s.ix, s.iz, g.ix, g.iz));

    const dirs = [
      [1,0],[-1,0],[0,1],[0,-1],
      [1,1],[1,-1],[-1,1],[-1,-1]
    ];

    while (open.size > 0) {
      let currentKey = null;
      let bestF = Infinity;
      for (const k of open) {
        const f = fScore.get(k) ?? Infinity;
        if (f < bestF) { bestF = f; currentKey = k; }
      }

      if (currentKey === goalKey) {
        return this._reconstruct(came, currentKey).map(([ix,iz]) => this._gridToWorld(ix,iz));
      }

      open.delete(currentKey);
      const [cx, cz] = currentKey.split(',').map(Number);

      for (const [dx, dz] of dirs) {
        const nx = cx + dx, nz = cz + dz;
        if (this._isBlocked(nx, nz)) continue;

        const nk = `${nx},${nz}`;
        const tentative = (gScore.get(currentKey) ?? Infinity) + Math.hypot(dx, dz);

        if (tentative < (gScore.get(nk) ?? Infinity)) {
          came.set(nk, currentKey);
          gScore.set(nk, tentative);
          fScore.set(nk, tentative + this._heuristic(nx, nz, g.ix, g.iz));
          open.add(nk);
        }
      }
    }

    return [];
  }

  _heuristic(ix, iz, gx, gz) {
    return Math.abs(ix - gx) + Math.abs(iz - gz);
  }

  _reconstruct(came, currentKey) {
    const out = [];
    let ck = currentKey;
    while (came.has(ck)) {
      const [ix,iz] = ck.split(',').map(Number);
      out.push([ix,iz]);
      ck = came.get(ck);
    }
    const [sx,sz] = ck.split(',').map(Number);
    out.push([sx,sz]);
    out.reverse();
    return out;
  }
}
