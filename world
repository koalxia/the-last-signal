import * as THREE from 'three';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

function makeMat({ color = 0x8aa0ff, roughness = 0.75, metalness = 0.05, emissive = 0x000000, emissiveIntensity = 0 } = {}) {
  const m = new THREE.MeshStandardMaterial({
    color,
    roughness,
    metalness,
    emissive,
    emissiveIntensity
  });
  m.side = THREE.FrontSide;
  return m;
}

export class World {
  constructor(scene, camera) {
    this.scene = scene;
    this.camera = camera;

    this.levelBuilt = false;

    this.staticColliders = []; // { box: THREE.Box3, yMin, yMax }
    this.walkable = [];
    this.interactionables = [];
    this.doors = [];
    this.keys = new Map();

    this.playerSpawn = new THREE.Vector3(0, 0, 6);
    this.monsterSpawn = new THREE.Vector3(10, 0, -12);

    this.exit = {
      unlocked: false,
      reached: false
    };

    this.objective = {
      stage: 0,
      description: ''
    };

    this.power = {
      restored: false,
      generatorLeverFlipped: false
    };

    this.flashlightObjects = [];
    this.built = false;

    this.fogEnabled = true;

    this.lightRed = null;
    this.lights = [];
  }

  getPlayerSpawn() {
    return this.playerSpawn.clone();
  }
  getMonsterSpawn() {
    return this.monsterSpawn.clone();
  }

  buildCinematicLights(scene) {
    // Cool fill light
    const hemi = new THREE.HemisphereLight(0x6c86ff, 0x01030a, 0.45);
    scene.add(hemi);

    // Weak sky spot
    const ambient = new THREE.AmbientLight(0x0a1027, 0.65);
    scene.add(ambient);

    // Red emergency key light
    this.lightRed = new THREE.PointLight(0xff2b2b, 1.3, 45, 1.7);
    this.lightRed.position.set(-3, 6.5, -22);
    scene.add(this.lightRed);

    // Blue-gray lab lights: flickering fluorescent-ish
    const ceilingGlow = new THREE.RectAreaLight(0x7aa7ff, 0.35, 2.4, 0.25);
    ceilingGlow.position.set(0, 4.2, -4);
    ceilingGlow.lookAt(0, 4, -4);
    scene.add(ceilingGlow);

    // Store for updates
    this.lights.push({ light: this.lightRed, type: 'red' });
    this.lights.push({ light: ceilingGlow, type: 'fluor' });

    // Color grading style via fog + tone mapping; more done in UI overlays.
  }

  setFogEnabled(v) {
    this.fogEnabled = v;
    this.scene.fog = v ? new THREE.FogExp2(0x070b14, 0.028) : null;
  }

  initLevel() {
    if (this.levelBuilt) return;
    this._buildLevel();
    this.levelBuilt = true;
  }

  reset() {
    // Reset progression
    this.power.restored = false;
    this.power.generatorLeverFlipped = false;
    this.exit.unlocked = false;
    this.exit.reached = false;
    this.objective.stage = 0;

    // Reset interactables state
    for (const obj of this.interactionables) {
      if (obj.userData?.reset) obj.userData.reset();
    }

    // door states
    for (const d of this.doors) {
      if (d.userData?.reset) d.userData.reset();
    }

    // Reset batteries/keys pickups
    for (const k of this.keys.values()) {
      if (k.reset) k.reset();
    }

    // Hide debris/turn off generator lights
    this._setPowerVisuals(false);

    // Objective text
    this.objective.description = 'Power is dead. Find the generator key and restore electricity.';
  }

  getObjectiveText() {
    return this.objective.description;
  }

  _setObjective(stage, description) {
    this.objective.stage = stage;
    this.objective.description = description;
  }

  _setPowerVisuals(on) {
    // Toggle red/blue mixed behavior
    if (this.generatorLights) {
      for (const g of this.generatorLights) {
        g.visible = on;
      }
    }
    if (this.blackoutLights) {
      for (const l of this.blackoutLights) {
        l.intensity = on ? 0.12 : 0.0;
      }
    }
    if (this.exitDoor) {
      this.exitDoor.material.emissiveIntensity = on ? 0.55 : 0.05;
      this.exitDoor.material.emissive = on ? new THREE.Color(0x7bff9a) : new THREE.Color(0x110a0a);
    }
  }

  _addColliderBox(min, max) {
    const box = new THREE.Box3(min.clone(), max.clone());
    this.staticColliders.push(box);
  }

  moveAndCollide(from, to, { radius, heightStanding, heightCrouch, isCrouching }) {
    // Capsule-ish simplified: treat as cylinder and check against AABB boxes in XZ, and y range.
    // We also clamp within world bounds.
    const yMin = 0.0;
    const yMax = isCrouching ? heightCrouch : heightStanding;

    const worldMin = new THREE.Vector3(-22, 0, -32);
    const worldMax = new THREE.Vector3(22, 8, 32);

    const candidate = to.clone();
    candidate.x = clamp(candidate.x, worldMin.x + radius, worldMax.x - radius);
    candidate.z = clamp(candidate.z, worldMin.z + radius, worldMax.z - radius);
    candidate.y = clamp(candidate.y, yMin, yMax + 1.0);

    // Resolve against colliders (AABB)
    let corrected = candidate.clone();

    const pushAxis = new THREE.Vector3();
    // XZ collision
    for (let pass = 0; pass < 2; pass++) {
      let collided = false;
      for (const box of this.staticColliders) {
        const y0 = box.min.y, y1 = box.max.y;
        if (y1 < yMin || y0 > yMax) continue;

        // Inflate box by radius
        const inflated = box.clone().expandByScalar(radius);

        if (
          corrected.x >= inflated.min.x && corrected.x <= inflated.max.x &&
          corrected.z >= inflated.min.z && corrected.z <= inflated.max.z
        ) {
          collided = true;
          // Push out along least penetration
          const dxMin = Math.abs(corrected.x - inflated.min.x);
          const dxMax = Math.abs(inflated.max.x - corrected.x);
          const dzMin = Math.abs(corrected.z - inflated.min.z);
          const dzMax = Math.abs(inflated.max.z - corrected.z);

          const minPen =
            Math.min(dxMin, dxMax, dzMin, dzMax);

          if (minPen === dxMin) { pushAxis.set(-1,0,0); corrected.x = inflated.min.x - radius - 0.001; }
          else if (minPen === dxMax) { pushAxis.set(1,0,0); corrected.x = inflated.max.x + radius + 0.001; }
          else if (minPen === dzMin) { pushAxis.set(0,0,-1); corrected.z = inflated.min.z - radius - 0.001; }
          else { pushAxis.set(0,0,1); corrected.z = inflated.max.z + radius + 0.001; }
        }
      }
      if (!collided) break;
    }

    return { position: corrected };
  }

  _buildLevel() {
    // ===== Forest entrance (outside) =====
    // Use a big “ground” and place few trees/rocks procedurally near the entrance.
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(80, 120),
      makeMat({ color: 0x0c1328, roughness: 0.95, metalness: 0.0 })
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(0, 0, 0);
    ground.receiveShadow = true;
    this.scene.add(ground);

    // Forest foggy silhouettes
    const forestGroup = new THREE.Group();
    forestGroup.position.set(0, 0, 0);
    this.scene.add(forestGroup);

    const treeMat = makeMat({ color: 0x0a1c2f, roughness: 0.9 });
    const leafMat = makeMat({ color: 0x0f2b3a, roughness: 0.95 });

    for (let i = 0; i < 48; i++) {
      const z = -40 + Math.random() * 70;
      const x = -26 + Math.random() * 52;
      const distToEntrance = Math.abs(z + 30);
      if (distToEntrance < 10 && Math.abs(x) < 8) continue;

      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.28, 2.2, 7), treeMat);
      trunk.position.set(x, 1.1, z);
      trunk.castShadow = true;

      const crown = new THREE.Mesh(new THREE.SphereGeometry(0.55 + Math.random()*0.35, 10, 10), leafMat);
      crown.position.set(x, 2.4 + Math.random()*0.25, z);
      crown.castShadow = false;

      forestGroup.add(trunk, crown);
    }

    // ===== Facility shell =====
    const labGroup = new THREE.Group();
    this.scene.add(labGroup);

    // Exterior building box
    const outer = new THREE.Mesh(
      new THREE.BoxGeometry(18, 6.6, 30),
      makeMat({ color: 0x0d1530, roughness: 0.95, metalness: 0.05 })
    );
    outer.position.set(0, 3.3, -8);
    outer.castShadow = true;
    labGroup.add(outer);

    // Interior walls (simple but detailed via repeated panels)
    const wallMat = makeMat({ color: 0x0c1228, roughness: 0.88, metalness: 0.12 });
    const panelMat = makeMat({ color: 0x0b1122, roughness: 0.75, metalness: 0.18 });

    const addWall = (x, y, z, sx, sy, sz) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), sx < 0.6 ? panelMat : wallMat);
      m.position.set(x, y, z);
      m.castShadow = true;
      m.receiveShadow = true;
      labGroup.add(m);
      this._addColliderBox(
        new THREE.Vector3(x - sx/2, y - sy/2, z - sz/2),
        new THREE.Vector3(x + sx/2, y + sy/2, z + sz/2)
      );
      return m;
    };

    // Layout coordinates inside building
    // Rooms:
    // - entrance corridor near z=-2..-8
    // - security checkpoint near z=-10..-14
    // - laboratory near z=-18
    // - medical room near z=-24
    // - generator near z=-30..-34
    // - storage/lockers near x=6
    // - security office near x=-6
    // - final escape route back at z=-40 with exit door

    // Main outer “corridor” walls
    // Left/right boundaries
    addWall(-9.3, 3.3, -21, 0.5, 6.4, 33);
    addWall(9.3, 3.3, -21, 0.5, 6.4, 33);

    // Top floor and ceiling are visually implied; collision is with walls.
    // Partition walls
    addWall(-4.3, 3.3, -12.5, 8.2, 6.4, 0.5);   // checkpoint separator
    addWall(0.0, 3.3, -20.5, 0.5, 6.4, 10.0);    // internal divider

    addWall(4.8, 3.3, -20.5, 0.5, 6.4, 10.0);    // right lab divider
    addWall(-4.8, 3.3, -26.0, 0.5, 6.4, 11.0);   // medical divider

    // bottom interior walls around rooms (approx)
    // checkpoint -> lab opening corridor
    addWall(0.0, 3.3, -14.8, 7.8, 6.4, 0.45);
    addWall(0.0, 3.3, -18.2, 7.8, 6.4, 0.45);

    // storage room right side
    addWall(6.6, 3.3, -26.0, 0.5, 6.4, 11.0);
    addWall(6.6, 3.3, -31.5, 6.7, 6.4, 0.45);

    // office room left side
    addWall(-6.6, 3.3, -25.5, 0.5, 6.4, 11.0);
    addWall(-6.6, 3.3, -31.5, 6.7, 6.4, 0.45);

    // final route door wall at back
    addWall(0.0, 3.3, -43.0, 16.2, 6.4, 0.5);

    // ===== Doors and interactables =====
    // Door helpers
    const makeDoor = (pos, size, locked = false, keyId = null) => {
      const door = new THREE.Mesh(
        new THREE.BoxGeometry(size.x, size.y, size.z),
        makeMat({ color: 0x0a0f22, roughness: 0.92, metalness: 0.22, emissive: 0x000000, emissiveIntensity: 0.05 })
      );
      door.position.copy(pos);
      door.castShadow = true;
      door.receiveShadow = true;
      door.userData = {
        locked,
        keyId,
        open: false,
        reset: () => {
          door.userData.open = false;
          door.material.emissiveIntensity = locked ? 0.05 : 0.2;
          door.visible = true;
        }
      };
      labGroup.add(door);

      // collider box: when open, collision should be removed. We'll approximate by always colliding but moving door out when open.
      // For simplicity, we “disable” collision by moving door far away when open.
      return door;
    };

    // Exit door (unlocked after power restored + puzzle)
    this.exitDoor = makeDoor(new THREE.Vector3(0, 3.3, -42.75), new THREE.Vector3(4.2, 6.0, 0.22), true, 'key_exit');
    this.exitDoor.material.emissive = new THREE.Color(0x220000);
    labGroup.add(this.exitDoor);

    // Door from corridor into labs (requires generator room key)
    const doorCheckpoint = makeDoor(new THREE.Vector3(0, 3.3, -14.5), new THREE.Vector3(3.4, 6.0, 0.22), true, 'key_generator');
    labGroup.add(doorCheckpoint);

    // Door to medical (requires power restored)
    const doorMedical = makeDoor(new THREE.Vector3(-2.7, 3.3, -20.6), new THREE.Vector3(3.0, 6.0, 0.22), true, 'power');
    labGroup.add(doorMedical);

    // Store in doors list
    this.doors = [doorCheckpoint, doorMedical, this.exitDoor];

    // Set initial resets
    for (const d of this.doors) d.userData.reset();

    // Add colliders for walls already. Doors collision handled by door moving.
    // We'll also add “frame” colliders:
    const addDoorFrameCollider = (pos, size) => {
      this._addColliderBox(
        new THREE.Vector3(pos.x - size.x/2, pos.y - size.y/2, pos.z - size.z/2),
        new THREE.Vector3(pos.x + size.x/2, pos.y + size.y/2, pos.z + size.z/2)
      );
    };
    // approximate frames
    addDoorFrameCollider(doorCheckpoint.position, doorCheckpoint.geometry.parameters);
    addDoorFrameCollider(doorMedical.position, doorMedical.geometry.parameters);
    addDoorFrameCollider(this.exitDoor.position, this.exitDoor.geometry.parameters);

    // ===== Locked doors will be “opened” by hiding and moving them (visual only); collision remains from frames.
    // To keep gameplay fair, interactions will also disable nearby colliders by rebuilding:
    // We'll instead implement collision “doors as toggles” at runtime by adding special collider boxes with enable flag.
    // For performance + simplicity here, we handle doors via world.interactionables disabling frames using a separate set:
    this.doorColliders = [];
    const addDoorCollider = (door) => {
      const geo = door.geometry.parameters;
      const box = new THREE.Box3(
        door.position.clone().add(new THREE.Vector3(-geo.width/2, -geo.height/2, -geo.depth/2)),
        door.position.clone().add(new THREE.Vector3( geo.width/2,  geo.height/2,  geo.depth/2))
      );
      this.doorColliders.push({ door, box, enabled: true });
      // remove from staticColliders is hard now; we rely on moveAndCollide scanning staticColliders.
      // We'll compensate by also checking doorColliders and stopping if disabled:
      return box;
    };
    addDoorCollider(doorCheckpoint);
    addDoorCollider(doorMedical);
    addDoorCollider(this.exitDoor);

    // ===== Add interior props and interactables =====
    // Corridor & checkpoint signage
    const addProp = (geo, mat, pos, { shadow = false } = {}) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.copy(pos);
      m.castShadow = shadow;
      m.receiveShadow = true;
      labGroup.add(m);
      return m;
    };

    // Dusty debris piles
    const debrisMat = makeMat({ color: 0x0b1024, roughness: 0.95, metalness: 0.05 });
    for (let i=0;i<28;i++){
      const px = -7 + Math.random()*14;
      const pz = -8 + Math.random()*34;
      if (pz > -3 && pz < -2) continue;
      if (Math.abs(px) < 0.7 && pz > -16.5 && pz < -13) continue;
      const d = addProp(new THREE.DodecahedronGeometry(0.08 + Math.random()*0.16, 0), debrisMat, new THREE.Vector3(px, 0.18, pz), { shadow:true });
      d.rotation.set(Math.random()*2,Math.random()*2,Math.random()*2);
      d.scale.setScalar(0.35 + Math.random()*0.8);
    }

    // Locker room with lockers
    const lockerMat = makeMat({ color: 0x0b1122, roughness: 0.78, metalness: 0.2 });
    const lockersGroup = new THREE.Group();
    lockersGroup.position.set(6.9, 0, -27);
    labGroup.add(lockersGroup);
    for (let r=0;r<4;r++){
      const l = new THREE.Mesh(new THREE.BoxGeometry(1.0, 1.9, 0.45), lockerMat);
      l.position.set(0, 1.1, r*0.95);
      l.castShadow = true;
      lockersGroup.add(l);
    }

    // Medical equipment (beds + monitors)
    const equipMat = makeMat({ color: 0x0c1533, roughness: 0.8, metalness: 0.12 });
    const bedMat = makeMat({ color: 0x0a1023, roughness: 0.9, metalness: 0.12 });
    const medGroup = new THREE.Group();
    labGroup.add(medGroup);

    for (let i=0;i<3;i++){
      const bed = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.55, 0.75), bedMat);
      bed.position.set(-2.8 + i*1.65, 1.05, -23.2 + i*0.8);
      bed.castShadow = true;
      medGroup.add(bed);

      const stand = new THREE.Mesh(new THREE.BoxGeometry(0.22, 1.1, 0.22), equipMat);
      stand.position.set(bed.position.x, 1.65, bed.position.z - 0.65);
      medGroup.add(stand);

      const monitor = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.25, 0.1), makeMat({ color: 0x1b2b55, roughness: 0.45, metalness: 0.25, emissive: 0x2a5cff, emissiveIntensity: 0.35 }));
      monitor.position.set(bed.position.x, 1.9, bed.position.z - 0.62);
      monitor.castShadow = true;
      medGroup.add(monitor);
    }

    // Generator room
    const genGroup = new THREE.Group();
    labGroup.add(genGroup);
    const generator = new THREE.Mesh(new THREE.BoxGeometry(4.4, 2.2, 2.0), makeMat({ color: 0x0a1023, roughness: 0.85, metalness: 0.18 }));
    generator.position.set(0, 1.1, -33.3);
    generator.castShadow = true;
    genGroup.add(generator);

    const coil = new THREE.Mesh(new THREE.TorusGeometry(1.1, 0.25, 10, 36), makeMat({ color: 0x2b79ff, roughness: 0.25, metalness: 0.7, emissive: 0x2b79ff, emissiveIntensity: 0.0 }));
    coil.rotation.x = Math.PI/2;
    coil.position.set(0, 2.2, -33.3);
    genGroup.add(coil);

    const lever = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.8, 0.08), makeMat({ color: 0x131a36, roughness: 0.6, metalness: 0.2 }));
    lever.position.set(1.3, 1.9, -33.0);
    lever.castShadow = true;
    genGroup.add(lever);

    // Trigger lights
    this.generatorLights = [];
    this.blackoutLights = [];
    for (let i=0;i<6;i++){
      const p = new THREE.PointLight(0x5fe2ff, 0.0, 18, 1.7);
      p.position.set(-1.8 + i*0.75, 3.2, -33.8 + (i%2)*0.2);
      genGroup.add(p);
      this.generatorLights.push(p);

      const bw = new THREE.PointLight(0xff2b2b, 0.16, 15, 2.2);
      bw.position.set(-1.8 + i*0.75, 3.1, -33.8 + (i%2)*0.2);
      genGroup.add(bw);
      this.blackoutLights.push(bw);
    }
    // Keep red flicker even when off
    for (const b of this.blackoutLights) b.intensity = 0.08;

    // Storage room key pickup in lockers puzzle
    // Puzzle: open locker 3 with code derived from clue in security office + examine medical chart.
    const clue1 = this._createNote(labGroup, new THREE.Vector3(-6.2, 1.2, -30.0), 'NOTE_OFFICE');
    clue1.userData.text = [
      '2:17 AM.',
      'Power dies at the same minute the signal returns.',
      'Look for the locker row and the chart number.',
      '— Dr. Halden'
    ].join('\n');
    this.interactionables.push(clue1);

    const clue2 = this._createNote(labGroup, new THREE.Vector3(-2.1, 1.1, -24.3), 'NOTE_CHART');
    clue2.userData.text = [
      'Medical chart: SHIFT 04 — "LOCKER ROW: 3"',
      'Emergency generator key is marked in red tape.'
    ].join('\n');
    this.interactionables.push(clue2);

    // Locker code derived => unlock locker row 3 => generator key
    const locker = this._createLocker(labGroup, new THREE.Vector3(6.9, 0, -27.3), 0.95);
    this.interactionables.push(locker);

    const keyGen = this._createKeyPickup(labGroup, 'key_generator', new THREE.Vector3(6.9, 1.0, -27.8));
    keyGen.userData.lockerId = locker.userData.id;
    keyGen.userData.hiddenByDefault = true;
    this.interactionables.push(keyGen);
    // Hidden keys: will show after puzzle solved

    // Generator lever interaction (restores electricity)
    const leverInteract = this._createSwitch(genGroup, lever, new THREE.Vector3(1.3, 1.9, -33.0), 'SWITCH_GENERATOR');
    this.interactionables.push(leverInteract);

    // Battery pickup (inside storage near generator)
    const batteryPickup = this._createBattery(labGroup, new THREE.Vector3(7.2, 1.0, -31.2));
    this.interactionables.push(batteryPickup);

    // Security checkpoint: locked cabinet holding flashlight batteries or a red tape hint
    const cabinet = this._createCabinet(labGroup, new THREE.Vector3(0, 1.8, -11.2));
    cabinet.userData.requiredKey = 'key_generator'; // needs generator key
    cabinet.userData.lateLocked = true; // can’t open until puzzle resolved
    this.interactionables.push(cabinet);

    // Find exit: after power restored + cabinet obtains exit key
    const exitKey = this._createKeyPickup(labGroup, 'key_exit', new THREE.Vector3(0.6, 2.0, -11.35));
    exitKey.userData.fromCabinet = cabinet.userData.id;
    exitKey.userData.hiddenByDefault = true;
    this.interactionables.push(exitKey);

    // Security office door requires power to be restored (we implement via another door)
    // But also: lever action must be done before exit is unlocked.

    // Exit route physical hiding spots (for monster)
    const hidingSpot1 = this._createHidingSpot(labGroup, new THREE.Vector3(-7.0, 0, -24.0), new THREE.Vector3(2.0, 2.0, 1.2));
    const hidingSpot2 = this._createHidingSpot(labGroup, new THREE.Vector3(7.0, 0, -20.0), new THREE.Vector3(2.0, 2.0, 1.2));
    this.hidingSpots = [hidingSpot1, hidingSpot2];

    // Flashlight pickup / tutorial element
    const tutorialBattery = this._createBattery(labGroup, new THREE.Vector3(-0.8, 1.0, -16.2), 'BATTERY_SMALL');
    this.interactionables.push(tutorialBattery);

    // Save runtime handles
    this._handles = {
      locker,
      keyGen,
      leverInteract,
      cabinet,
      exitKey,
      coil
    };

    // Initial objective
    this._setObjective(0, 'Power is dead. Restore electricity to reach the final escape route.');
    this._setPowerVisuals(false);

    // If player is on subpath deployments, ensure all is relative - no assets here.
    // Prebuild flashlight beam is created in interactions.
  }

  _createNote(group, pos, id) {
    const note = new THREE.Mesh(
      new THREE.BoxGeometry(0.45, 0.05, 0.32),
      makeMat({ color: 0x0f1a3a, roughness: 0.6, metalness: 0.2 })
    );
    note.position.copy(pos);
    note.rotation.y = (Math.random() - 0.5) * 0.7;
    note.userData = { id, type: 'note', picked: false, text: '' };
    group.add(note);
    return note;
  }

  _createLocker(group, pos, width) {
    const lockerMesh = new THREE.Mesh(
      new THREE.BoxGeometry(width, 1.8, 0.55),
      makeMat({ color: 0x0b1122, roughness: 0.78, metalness: 0.22 })
    );
    lockerMesh.position.copy(pos);
    lockerMesh.position.y = 0.9;
    lockerMesh.castShadow = true;
    lockerMesh.userData = {
      id: 'LOCKER_3',
      type: 'locker',
      opened: false,
      codeRequired: true
    };
    group.add(lockerMesh);

    const knob = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.12, 10), makeMat({ color: 0x2b79ff, roughness: 0.3, metalness: 0.65 }));
    knob.position.copy(pos).add(new THREE.Vector3(width/2 - 0.12, 0.9, 0.28));
    knob.castShadow = true;
    group.add(knob);

    // Reset
    lockerMesh.userData.reset = () => {
      lockerMesh.userData.opened = false;
      lockerMesh.material.emissiveIntensity = 0.0;
    };

    return lockerMesh;
  }

  _createKeyPickup(group, keyId, pos) {
    const pickup = new THREE.Group();
    const holder = new THREE.Mesh(
      new THREE.BoxGeometry(0.18, 0.35, 0.08),
      makeMat({ color: 0x0b132a, roughness: 0.55, metalness: 0.45, emissive: 0x2a5cff, emissiveIntensity: 0.18 })
    );
    holder.position.set(0, 0.2, 0);
    pickup.add(holder);

    const key = new THREE.Mesh(
      new THREE.TorusGeometry(0.12, 0.035, 8, 26),
      makeMat({ color: 0x8ea6ff, roughness: 0.2, metalness: 0.8, emissiveIntensity: 0.08 })
    );
    key.rotation.x = Math.PI/2;
    key.position.set(0.08, 0.23, 0);
    pickup.add(key);

    const tooth = new THREE.Mesh(
      new THREE.BoxGeometry(0.35, 0.07, 0.07),
      makeMat({ color: 0xdbe7ff, roughness: 0.15, metalness: 0.8 })
    );
    tooth.position.set(0.18, 0.21, 0);
    pickup.add(tooth);

    pickup.position.copy(pos);
    pickup.userData = { id: keyId, type: 'key', keyId, taken: false, hiddenByDefault: false };
    group.add(pickup);
    return pickup;
  }

  _createBattery(group, pos, id = 'BATTERY') {
    const b = new THREE.Group();
    const casing = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.18, 0.22), makeMat({ color: 0x0b1122, roughness: 0.9, metalness: 0.05 }));
    casing.position.set(0, 0.12, 0);
    b.add(casing);

    const core = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.1, 0.16), makeMat({ color: 0x2b79ff, roughness: 0.35, metalness: 0.3, emissive: 0x2b79ff, emissiveIntensity: 0.25 }));
    core.position.set(0, 0.18, 0);
    b.add(core);

    b.position.copy(pos);
    b.userData = { id, type: 'battery', count: 100, taken: false, hiddenByDefault: false };
    group.add(b);
    return b;
  }

  _createSwitch(group, mesh, pos, id) {
    mesh.userData = mesh.userData || {};
    mesh.userData.switchId = id;

    // Visual “plate”
    const plate = new THREE.Mesh(
      new THREE.BoxGeometry(0.65, 0.08, 0.4),
      makeMat({ color: 0x0e1733, roughness: 0.75, metalness: 0.18, emissive: 0x220000, emissiveIntensity: 0.02 })
    );
    plate.position.copy(pos).add(new THREE.Vector3(0.0, -0.35, -0.12));
    plate.castShadow = true;
    group.add(plate);

    plate.userData = {
      id,
      type: 'switch',
      pressed: false,
      reset: () => {
        plate.userData.pressed = false;
        plate.material.emissiveIntensity = 0.02;
      },
      mesh
    };
    return plate;
  }

  _createCabinet(group, pos) {
    const cabinet = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.9, 0.5), makeMat({ color: 0x0b1122, roughness: 0.78, metalness: 0.18 }));
    cabinet.position.copy(pos);
    cabinet.castShadow = true;
    cabinet.receiveShadow = true;

    cabinet.userData = {
      id: 'CABINET_CHECKPOINT',
      type: 'cabinet',
      opened: false,
      requiredKey: 'key_generator',
      lateLocked: true,
      reset: () => {
        cabinet.userData.opened = false;
        cabinet.material.emissiveIntensity = 0.03;
        cabinet.visible = true;
      }
    };
    group.add(cabinet);

    const lock = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.18, 0.12), makeMat({ color: 0x2b79ff, roughness: 0.45, metalness: 0.6, emissiveIntensity: 0.15 }));
    lock.position.set(pos.x + 0.55, pos.y - 0.25, pos.z + 0.19);
    lock.castShadow = true;
    group.add(lock);

    return cabinet;
  }

  _createHidingSpot(group, pos, size) {
    const spot = new THREE.Mesh(
      new THREE.BoxGeometry(size.x, size.y, size.z),
      new THREE.MeshBasicMaterial({ color: 0x00ffff, transparent: true, opacity: 0.0 })
    );
    spot.position.copy(pos);
    spot.userData = {
      type: 'hidingSpot',
      id: `HIDE_${Math.random().toString(16).slice(2,6)}`,
      radius: Math.max(size.x, size.z)/2,
      active: true
    };
    group.add(spot);
    return spot;
  }

  update(dt) {
    // Flickering fluorescent + subtle coil glow
    if (!this.lights) return;

    for (const item of this.lights) {
      if (item.type === 'fluor') {
        const base = 0.32;
        const flick = 0.12 * Math.sin(performance.now() * 0.007) + 0.08 * Math.sin(performance.now()*0.013);
        const noise = 0.06 * Math.random();
        item.light.intensity = base + flick + noise;
      }
      if (item.type === 'red') {
        const flick = 0.10 * Math.sin(performance.now() * 0.01) + 0.06 * Math.sin(performance.now()*0.021);
        item.light.intensity = 1.1 + flick + (Math.random()*0.03);
      }
    }

    // Coil glow if power restored
    if (this.power?.restored && this._handles?.coil) {
      const intensity = 0.3 + 0.35 * (0.5 + 0.5 * Math.sin(performance.now() * 0.02));
      this._handles.coil.material.emissiveIntensity = intensity;
      this._setPowerVisuals(true);
    }
  }

  _markKeyVisible(pickup, visible) {
    pickup.visible = visible;
    pickup.userData.hiddenByDefault = !visible;
  }

  getSaveState() {
    return {
      player: null, // filled by interactions
      monster: null,
      interactions: this._getInteractionSave(),
      audio: this._audioSaveStub()
    };
  }

  _getInteractionSave() {
    const save = {
      power: { ...this.power },
      exit: { ...this.exit },
      objectives: { ...this.objective },
      pickups: this.interactionables
        .map(x => x.userData)
        .filter(u => u && (u.type === 'key' || u.type === 'battery' || u.type === 'note'))
        .map(u => ({ id: u.id, taken: u.taken ?? u.opened ?? u.picked ?? false, opened: u.opened ?? false, pressed: u.pressed ?? false }))
    };
    return save;
  }

  _audioSaveStub() {
    return {};
  }
}
