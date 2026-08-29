import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.169.0/build/three.module.js";

const $ = (s) => document.querySelector(s),
  $$ = (s) => [...document.querySelectorAll(s)];
const screens = ["story", "game", "success", "ending", "blackout"];
function show(id) {
  screens.forEach((x) => $("#" + x)?.classList.toggle("active", x === id));
}
function toast(t) {
  const el = $("#toast");
  el.textContent = t;
  el.classList.add("show");
  clearTimeout(toast.t);
  toast.t = setTimeout(() => el.classList.remove("show"), 1900);
}

const story = [
  {
    k: "LAYER 1 · BAHRAIN",
    t: "Childhood",
    b: "Young Ola enters a place from her childhood. Familiar Bahrain memories are everywhere, with hidden messages about عُلا — elevation, rise and high standing.",
    d: "",
  },
  {
    k: "LAYER 2 · THE CALLING",
    t: "The Old Guide",
    b: "A mysterious good guide appears. He needs Ola to help Egypt put troubled projects back on track.",
    d: "يا علا… محتاجينك في حوار صغير. صغير يعني… على قد كام مشروع كده واقعين على دماغنا.",
  },
  {
    k: "LAYER 3 · EGYPT",
    t: "The Projects",
    b: "The nostalgic world opens into Egypt. The real management challenge begins: cost, forecast, cash, evidence, waste and control.",
    d: "يلا يا كوتش… ورّينا بقى الشغل اللي الناس بتتكلم عنه.",
  },
];
let storyIndex = 0;
function renderStory() {
  const s = story[storyIndex];
  $("#storyImage").src = `assets/layer_${storyIndex + 1}.jpg`;
  $("#storyKicker").textContent = s.k;
  $("#storyTitle").textContent = s.t;
  $("#storyBody").textContent = s.b;
  $("#storyDialogue").textContent = s.d;
}
$("#storyNext").onclick = () => {
  if (storyIndex < story.length - 1) {
    storyIndex++;
    renderStory();
  } else {
    show("game");
    init3D();
  }
};

const PROJECTS = [
  {
    id: "gloria",
    alias: "Yateem Centre",
    name: "Gloria Hospital",
    source: "Gloria Cost Report 06.2026.xlsx · June 2026",
    pos: [-8, 0, -2],
    metrics: {
      Critical: 6,
      Caution: 6,
      Favorable: 7,
      EvidenceGap: 4,
      Evidence: "86%",
      Budget: "292.49M",
      Profit: "6.74M",
    },
    missions: [
      [
        "CRITICAL",
        "Cost Performance Recovery",
        "CPI/CV crossed the critical policy boundary.",
        "Require a cost-recovery plan by the largest adverse work packages before approving the next forecast.",
        [
          "Rank negative-CV packages and assign owners",
          "Approve without recovery plan",
          "Reduce the budget figure to match actual cost",
        ],
        0,
      ],
      [
        "CRITICAL",
        "Forecast Overrun",
        "ETC exceeds remaining budget; forecast variance is materially negative.",
        "Revalidate quantities, productivity, commitments and forecast rates.",
        [
          "Revalidate ETC from remaining quantities and commitments",
          "Carry forward the current ETC unchanged",
          "Hide negative forecast rows",
        ],
        0,
      ],
      [
        "CRITICAL",
        "Accounting Reconciliation",
        "A material accounting / cost-control gap requires explanation.",
        "Keep both sources and reconcile by source, timing, classification and approved reallocation.",
        [
          "Preserve both values and reconcile every item",
          "Overwrite cost control with accounting",
          "Average the two values",
        ],
        0,
      ],
      [
        "CAUTION",
        "Cost Concentration",
        "The leading resource driver is 38.6% of analyzed exposure.",
        "Track the leading driver as a separate management exception.",
        [
          "Validate quantity, rate, commitments and remaining exposure",
          "Ignore it because it is not yet critical",
          "Split the code so concentration looks smaller",
        ],
        0,
      ],
      [
        "CAUTION",
        "Cashflow Control",
        "Adverse months and an anomalous period require investigation.",
        "Review collection timing and near-term payment commitments weekly.",
        [
          "Build a three-month cash lookahead and investigate anomalies",
          "Use the projection as approved cash forecast",
          "Delay all supplier payments",
        ],
        0,
      ],
      [
        "CAUTION",
        "Waste Control",
        "Waste is above allowance; worst variance 1.95 percentage points.",
        "Correct handling, cutting, storage or measurement leakage.",
        [
          "Trace handling, cutting, storage and measurement leakage",
          "Increase waste allowance",
          "Ignore until next quarter",
        ],
        0,
      ],
      [
        "UNABLE",
        "Cost Performance Map Evidence",
        "EV and AC are not both available on a comparable scope.",
        "Recover comparable controlled EV and AC before concluding.",
        [
          "Align EV and AC scope before calculating performance",
          "Assume CPI is 1.00",
          "Use AC only",
        ],
        0,
      ],
      [
        "FAVORABLE",
        "Protect Profitability",
        "Profit remains positive and margin meets policy.",
        "Protect revenue realization and cost discipline.",
        [
          "Track deductions, unbilled revenue and forecast-to-complete",
          "Relax commitment controls",
          "Approve unplanned scope",
        ],
        0,
      ],
    ],
  },
  {
    id: "big",
    alias: "Bab Al Bahrain",
    name: "The BIG",
    source: "THE BIG cost Report 06.2026.xml · June 2026",
    pos: [8, 0, -1],
    metrics: {
      Critical: 3,
      Caution: 1,
      Favorable: 11,
      EvidenceGap: 8,
      Evidence: "86%",
      Budget: "344.70M",
      Profit: "34.09M",
    },
    missions: [
      [
        "CRITICAL",
        "Classification Bridge",
        "Accounting scope contains a material reconciliation difference.",
        "Reconcile source, timing, classification and approved reallocation.",
        [
          "Keep both source values and reconcile",
          "Overwrite accounting with cost control",
          "Use the larger number",
        ],
        0,
      ],
      [
        "CRITICAL",
        "Indirect Cost Recovery",
        "Indirect cost performance is materially off track.",
        "Require a cost-recovery plan by the largest adverse work packages.",
        [
          "Rank adverse packages, assign owner and reforecast ETC",
          "Freeze all indirect costs immediately",
          "Ignore because direct cost is favorable",
        ],
        0,
      ],
      [
        "CRITICAL",
        "Cost Driver Concentration",
        "Leading ledger driver represents 44.2% of analyzed total.",
        "Apply dedicated forecast, procurement and productivity controls.",
        [
          "Validate quantity, rate, commitment and remaining exposure",
          "Spread costs across codes",
          "Wait until it reaches 50%",
        ],
        0,
      ],
      [
        "CAUTION",
        "Data Quality Warnings",
        "Dataset is usable only with explicit warnings.",
        "Close warnings by priority before relying on affected conclusions.",
        [
          "Prioritize warnings and assign data owners",
          "Treat all warnings as harmless",
          "Delete incomplete rows",
        ],
        0,
      ],
      [
        "UNABLE",
        "Cost Performance Map Evidence",
        "EV and AC are not comparable on the same scope.",
        "Resolve the evidence gap before a financial decision.",
        [
          "Map EV and AC to a comparable scope",
          "Assume favorable from other charts",
          "Use budget instead of EV",
        ],
        0,
      ],
      [
        "FAVORABLE",
        "Protect Cashflow",
        "Cash recovery currently covers expenditure.",
        "Maintain collection discipline and verify upcoming commitments.",
        [
          "Monitor three-month payment and billing forecast",
          "Relax collection follow-up",
          "Accelerate payments without forecast",
        ],
        0,
      ],
      [
        "FAVORABLE",
        "Protect Profitability",
        "Reported profit is positive and margin meets policy.",
        "Maintain revenue realization and cost discipline.",
        [
          "Track deductions, unbilled revenue and FTC monthly",
          "Stop monthly forecast updates",
          "Approve unbudgeted variation",
        ],
        0,
      ],
    ],
  },
];

let state = JSON.parse(localStorage.getItem("ola3d-v3") || "null") || {
  day: 1,
  hour: 8,
  energy: 100,
  focus: 100,
  patience: 100,
  help: 4,
  bonus: false,
  speed: 1,
  resolved: {},
  started: false,
};
function save() {
  localStorage.setItem("ola3d-v3", JSON.stringify(state));
  toast("Saved");
}
function updateHUD() {
  $("#dayLabel").textContent = `Day ${state.day}/30`;
  $("#timeLabel").textContent =
    String(Math.floor(state.hour)).padStart(2, "0") + ":00";
  [
    ["energy", "#energyBar", "#energyValue"],
    ["focus", "#focusBar", "#focusValue"],
    ["patience", "#patienceBar", "#patienceValue"],
  ].forEach(([k, b, v]) => {
    $(b).style.width = state[k] + "%";
    $(v).textContent = Math.round(state[k]);
  });
  $("#helpCount").textContent = state.help;
}

let scene,
  camera,
  renderer,
  ola,
  raycaster,
  ground,
  clock3d,
  camYaw = 0.65,
  camPitch = 0.75,
  camDist = 18,
  target = new THREE.Vector3(),
  projectMeshes = [],
  nearest = null,
  guidedProject = null,
  navigationLine = null,
  sunLight = null,
  skyLight = null,
  worldClock = 0,
  quality = "auto",
  running = false;
const move = { x: 0, y: 0 },
  walkTarget = new THREE.Vector3();
let hasWalkTarget = false;
function mat(c, metal = 0.05, rough = 0.75) {
  return new THREE.MeshStandardMaterial({
    color: c,
    metalness: metal,
    roughness: rough,
  });
}
function box(w, h, d, c) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(c));
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}
function cylinder(top, bottom, height, color, sides = 16) {
  const mesh = new THREE.Mesh(
    new THREE.CylinderGeometry(top, bottom, height, sides),
    mat(color),
  );
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}
function sphere(radius, color, width = 24, height = 18) {
  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(radius, width, height),
    mat(color),
  );
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}
function emissive(color, intensity = 0.8) {
  return new THREE.MeshStandardMaterial({
    color,
    emissive: color,
    emissiveIntensity: intensity,
    roughness: 0.35,
    metalness: 0.15,
  });
}
function textSprite(text, color = "#fff") {
  const cv = document.createElement("canvas");
  cv.width = 512;
  cv.height = 128;
  const x = cv.getContext("2d");
  x.fillStyle = "rgba(4,8,16,.78)";
  x.roundRect(8, 8, 496, 112, 24);
  x.fill();
  x.fillStyle = color;
  x.font = "700 34px Arial";
  x.textAlign = "center";
  x.fillText(text, 256, 63);
  const t = new THREE.CanvasTexture(cv);
  const sp = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: t, transparent: true }),
  );
  sp.scale.set(5.5, 1.4, 1);
  return sp;
}
function createOla() {
  const g = new THREE.Group();
  const shadow = new THREE.Mesh(
    new THREE.CircleGeometry(0.82, 32),
    new THREE.MeshBasicMaterial({
      color: 0x000000,
      transparent: true,
      opacity: 0.25,
    }),
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.015;
  g.add(shadow);

  const skirt = new THREE.Mesh(
    new THREE.CylinderGeometry(0.53, 0.74, 1.42, 12),
    mat(0xb79d88, 0.02, 0.92),
  );
  skirt.position.y = 1.05;
  skirt.castShadow = true;
  g.add(skirt);
  const torso = new THREE.Mesh(
    new THREE.CylinderGeometry(0.5, 0.58, 1.42, 12),
    mat(0xc7b09c, 0.02, 0.82),
  );
  torso.position.y = 2.22;
  torso.castShadow = true;
  g.add(torso);
  const jacket = box(1.04, 0.12, 0.62, 0x8f7463);
  jacket.position.set(0, 2.58, 0);
  g.add(jacket);

  const leftLeg = new THREE.Group();
  const rightLeg = new THREE.Group();
  [-0.29, 0.29].forEach((x, index) => {
    const leg = index ? rightLeg : leftLeg;
    const calf = cylinder(0.15, 0.13, 0.88, 0x4c4050, 10);
    calf.position.y = -0.42;
    leg.add(calf);
    const shoe = box(0.36, 0.2, 0.65, 0xf4eee2);
    shoe.position.set(0, -0.92, 0.13);
    leg.add(shoe);
    leg.position.set(x, 0.88, 0);
    g.add(leg);
  });

  const leftArm = new THREE.Group();
  const rightArm = new THREE.Group();
  [-0.66, 0.66].forEach((x, index) => {
    const arm = index ? rightArm : leftArm;
    const sleeve = cylinder(0.17, 0.14, 1.05, 0xb79d88, 10);
    sleeve.position.y = -0.43;
    arm.add(sleeve);
    const hand = sphere(0.16, 0xd9a987, 16, 12);
    hand.position.y = -1.0;
    arm.add(hand);
    arm.position.set(x, 2.68, 0);
    arm.rotation.z = index ? -0.12 : 0.12;
    g.add(arm);
  });

  const neck = cylinder(0.17, 0.19, 0.3, 0xd9a987, 12);
  neck.position.y = 3.05;
  g.add(neck);
  const head = sphere(0.48, 0xd9a987);
  head.position.y = 3.47;
  g.add(head);
  const hijab = new THREE.Mesh(
    new THREE.SphereGeometry(0.57, 28, 20, 0, Math.PI * 2, 0, Math.PI * 0.78),
    mat(0x242d3c, 0.06, 0.72),
  );
  hijab.position.y = 3.61;
  hijab.castShadow = true;
  g.add(hijab);
  const scarf = new THREE.Mesh(
    new THREE.ConeGeometry(0.5, 0.82, 18),
    mat(0x242d3c, 0.06, 0.72),
  );
  scarf.position.set(0, 3.08, -0.08);
  g.add(scarf);
  [-0.17, 0.17].forEach((x) => {
    const eye = sphere(0.035, 0x171314, 10, 8);
    eye.position.set(x, 3.5, 0.45);
    g.add(eye);
  });
  const smile = new THREE.Mesh(
    new THREE.TorusGeometry(0.1, 0.017, 8, 18, Math.PI),
    new THREE.MeshBasicMaterial({ color: 0x7b3f3f }),
  );
  smile.position.set(0, 3.34, 0.46);
  smile.rotation.z = Math.PI;
  g.add(smile);

  const bag = box(0.5, 0.68, 0.2, 0x241913);
  bag.position.set(0.76, 1.66, -0.02);
  g.add(bag);
  const strap = new THREE.Mesh(
    new THREE.TorusGeometry(0.48, 0.035, 8, 24, Math.PI),
    mat(0x2b211c),
  );
  strap.position.set(0.37, 2.06, 0);
  strap.rotation.z = Math.PI / 2;
  g.add(strap);

  const pl = new THREE.Mesh(
    new THREE.OctahedronGeometry(0.42, 0),
    new THREE.MeshStandardMaterial({
      color: 0x58f29b,
      emissive: 0x1abf66,
      emissiveIntensity: 1.8,
      roughness: 0.18,
    }),
  );
  pl.position.y = 4.62;
  g.add(pl);
  g.userData = { leftArm, rightArm, leftLeg, rightLeg, plumbob: pl, baseY: 0 };
  return g;
}
function addWindows(group, width, floors, depth, startY = 1.15) {
  const windowMaterial = emissive(0x9bd9ed, 0.65);
  for (let floor = 0; floor < floors; floor++) {
    for (let column = -2; column <= 2; column++) {
      const front = new THREE.Mesh(
        new THREE.BoxGeometry(0.5, 0.42, 0.05),
        windowMaterial,
      );
      front.position.set(
        (column * width) / 5.8,
        startY + floor * 1.08,
        depth / 2 + 0.031,
      );
      group.add(front);
      const back = front.clone();
      back.position.z = -depth / 2 - 0.031;
      group.add(back);
    }
  }
}
function projectBeacon(project) {
  const beacon = new THREE.Group();
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(3.45, 0.055, 10, 72),
    new THREE.MeshBasicMaterial({
      color: 0xe8bd67,
      transparent: true,
      opacity: 0.66,
    }),
  );
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 0.12;
  beacon.add(ring);
  const beam = new THREE.Mesh(
    new THREE.CylinderGeometry(0.08, 1.5, 8, 28, 1, true),
    new THREE.MeshBasicMaterial({
      color: 0x62efa2,
      transparent: true,
      opacity: 0.08,
      side: THREE.DoubleSide,
      depthWrite: false,
    }),
  );
  beam.position.y = 4;
  beacon.add(beam);
  beacon.userData.project = project;
  return beacon;
}
function hospitalBuilding(group) {
  const podium = box(5.8, 0.7, 5.4, 0xc7b99f);
  podium.position.y = 0.35;
  group.add(podium);
  const leftWing = box(2.05, 3.5, 4.1, 0xe4ded2);
  leftWing.position.set(-1.65, 2.05, 0);
  group.add(leftWing);
  const rightWing = leftWing.clone();
  rightWing.position.x = 1.65;
  group.add(rightWing);
  const tower = box(2.1, 5.7, 3.2, 0x8cabb8);
  tower.position.set(0, 3.1, -0.28);
  group.add(tower);
  addWindows(group, 4.6, 3, 5.4, 1.35);
  const canopy = box(2.2, 0.18, 1.2, 0xe8bd67);
  canopy.position.set(0, 1.2, 3.25);
  group.add(canopy);
  const door = new THREE.Mesh(
    new THREE.BoxGeometry(1.2, 1.75, 0.08),
    emissive(0x5aa7c8, 0.45),
  );
  door.position.set(0, 0.95, 2.76);
  group.add(door);
  const crossMaterial = emissive(0x55d889, 1.2);
  const crossV = new THREE.Mesh(
    new THREE.BoxGeometry(0.28, 1.25, 0.12),
    crossMaterial,
  );
  const crossH = new THREE.Mesh(
    new THREE.BoxGeometry(1.0, 0.28, 0.12),
    crossMaterial,
  );
  crossV.position.set(0, 4.35, 1.38);
  crossH.position.copy(crossV.position);
  group.add(crossV, crossH);
}
function gatewayBuilding(group) {
  const base = box(6.3, 0.75, 5.7, 0x856f55);
  base.position.y = 0.38;
  group.add(base);
  const left = box(2.25, 5.1, 4.25, 0xb99a6e);
  left.position.set(-2.0, 2.92, 0);
  group.add(left);
  const right = left.clone();
  right.position.x = 2.0;
  group.add(right);
  const bridge = box(2.2, 1.15, 4.25, 0xcaae7e);
  bridge.position.set(0, 4.55, 0);
  group.add(bridge);
  const arch = new THREE.Mesh(
    new THREE.TorusGeometry(1.0, 0.36, 12, 30, Math.PI),
    mat(0xe0c391),
  );
  arch.position.set(0, 2.4, 2.18);
  group.add(arch);
  addWindows(group, 5.4, 4, 4.25, 1.35);
  const crown = cylinder(0.48, 0.62, 1.15, 0x8e6f3f, 8);
  crown.position.set(0, 5.85, 0);
  group.add(crown);
}
function building(p, index) {
  const g = new THREE.Group();
  const plaza = new THREE.Mesh(
    new THREE.CylinderGeometry(4.2, 4.2, 0.22, 48),
    mat(index % 2 ? 0x4a4140 : 0x4a5153),
  );
  plaza.position.y = 0.11;
  plaza.receiveShadow = true;
  g.add(plaza);
  if (index % 2 === 0) hospitalBuilding(g);
  else gatewayBuilding(g);
  const beacon = projectBeacon(p);
  g.add(beacon);
  const label = textSprite(p.alias, "#f6d98c");
  label.position.y = 7.3;
  g.add(label);
  g.userData.project = p;
  g.userData.beacon = beacon;
  g.position.set(...p.pos);
  scene.add(g);
  projectMeshes.push(g);
  return g;
}
function tree(x, z, scale = 1) {
  const g = new THREE.Group();
  const trunk = cylinder(0.13 * scale, 0.18 * scale, 1.5 * scale, 0x72513a, 9);
  trunk.position.y = 0.75 * scale;
  g.add(trunk);
  for (let i = 0; i < 3; i++) {
    const crown = sphere(
      (0.62 - i * 0.08) * scale,
      i % 2 ? 0x2e744e : 0x3e8c5d,
      18,
      12,
    );
    crown.position.set((i - 1) * 0.22 * scale, (1.72 + i * 0.3) * scale, 0);
    g.add(crown);
  }
  g.position.set(x, 0, z);
  scene.add(g);
}
function palm(x, z, scale = 1) {
  const g = new THREE.Group();
  const trunk = cylinder(0.12 * scale, 0.2 * scale, 2.9 * scale, 0x8b6742, 9);
  trunk.position.y = 1.45 * scale;
  g.add(trunk);
  for (let j = 0; j < 7; j++) {
    const leaf = new THREE.Mesh(
      new THREE.BoxGeometry(0.16 * scale, 0.06, 2.2 * scale),
      mat(0x2b7d4f),
    );
    leaf.position.set(0, 3.0 * scale, 0.78 * scale);
    leaf.rotation.y = (j * Math.PI * 2) / 7;
    leaf.rotation.x = 0.38;
    g.add(leaf);
  }
  g.position.set(x, 0, z);
  scene.add(g);
}
function streetLight(x, z) {
  const g = new THREE.Group();
  const pole = cylinder(0.055, 0.08, 2.6, 0x25303a, 10);
  pole.position.y = 1.3;
  g.add(pole);
  const lamp = sphere(0.18, 0xffd78d, 14, 10);
  lamp.material = emissive(0xffc96a, 1.25);
  lamp.position.y = 2.65;
  g.add(lamp);
  g.position.set(x, 0, z);
  scene.add(g);
}
function road(x, z, width, depth, rotation = 0) {
  const r = box(width, 0.04, depth, 0x222d35);
  r.position.set(x, 0.035, z);
  r.rotation.y = rotation;
  r.receiveShadow = true;
  scene.add(r);
  const stripe = box(width * 0.88, 0.012, 0.06, 0xd7b967);
  stripe.position.set(x, 0.066, z);
  stripe.rotation.y = rotation;
  scene.add(stripe);
}
function environment() {
  ground = new THREE.Mesh(new THREE.PlaneGeometry(160, 160), mat(0x33463d));
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);
  const plaza = new THREE.Mesh(
    new THREE.CylinderGeometry(10, 10, 0.12, 64),
    mat(0x6d6a61),
  );
  plaza.position.y = 0.06;
  plaza.receiveShadow = true;
  scene.add(plaza);
  road(0, -1, 42, 4.8, 0);
  road(0, 7, 4.8, 32, 0);
  const fountainPool = new THREE.Mesh(
    new THREE.CylinderGeometry(2.05, 2.18, 0.46, 48),
    mat(0xc7b58f),
  );
  fountainPool.position.set(0, 0.24, 1.5);
  scene.add(fountainPool);
  const fountainWater = new THREE.Mesh(
    new THREE.CylinderGeometry(1.78, 1.78, 0.12, 48),
    new THREE.MeshStandardMaterial({
      color: 0x3f9eb6,
      roughness: 0.1,
      metalness: 0.12,
      transparent: true,
      opacity: 0.85,
    }),
  );
  fountainWater.position.set(0, 0.51, 1.5);
  scene.add(fountainWater);
  const fountainJet = new THREE.Mesh(
    new THREE.CylinderGeometry(0.055, 0.13, 2.2, 12),
    new THREE.MeshBasicMaterial({
      color: 0xa8efff,
      transparent: true,
      opacity: 0.58,
    }),
  );
  fountainJet.position.set(0, 1.55, 1.5);
  scene.add(fountainJet);

  for (let i = 0; i < 42; i++) {
    const b = box(
      THREE.MathUtils.randFloat(1.8, 4.2),
      THREE.MathUtils.randFloat(3, 11),
      THREE.MathUtils.randFloat(1.8, 4.2),
      i % 3 === 0 ? 0x53697a : i % 3 === 1 ? 0x6f675e : 0x455762,
    );
    const a = (i / 42) * Math.PI * 2,
      r = THREE.MathUtils.randFloat(28, 54);
    b.position.set(
      Math.cos(a) * r,
      b.geometry.parameters.height / 2,
      Math.sin(a) * r,
    );
    scene.add(b);
  }
  const pyramid = new THREE.Mesh(
    new THREE.ConeGeometry(5, 6, 4),
    mat(0xc8a566),
  );
  pyramid.position.set(-17, 3, -38);
  pyramid.rotation.y = Math.PI / 4;
  scene.add(pyramid);
  const nile = new THREE.Mesh(
    new THREE.PlaneGeometry(150, 14),
    new THREE.MeshStandardMaterial({
      color: 0x174d66,
      roughness: 0.25,
      metalness: 0.1,
    }),
  );
  nile.rotation.x = -Math.PI / 2;
  nile.position.set(0, 0.025, 27);
  scene.add(nile);
  const bridgeDeck = box(7.5, 0.36, 15, 0x8e8374);
  bridgeDeck.position.set(18, 1.0, 27);
  scene.add(bridgeDeck);
  for (let i = 0; i < 9; i++) {
    palm(-24 + i * 6, 19 + (i % 2) * 1.5, 0.95);
    tree(-18 + i * 4.5, -10 - (i % 2) * 2, 0.82);
  }
  for (let i = -4; i <= 4; i++) {
    streetLight(i * 4.2, -4.6);
    if (i % 2 === 0) streetLight(i * 4.2, 5.2);
  }
}
function init3D() {
  if (running) return;
  running = true;
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x84b7c7);
  scene.fog = new THREE.Fog(0x84b7c7, 48, 105);
  camera = new THREE.PerspectiveCamera(48, innerWidth / innerHeight, 0.1, 220);
  renderer = new THREE.WebGLRenderer({
    canvas: $("#world3d"),
    antialias: matchMedia("(min-width:800px)").matches,
    alpha: false,
    powerPreference: "high-performance",
  });
  renderer.setPixelRatio(
    Math.min(
      devicePixelRatio,
      matchMedia("(max-width:600px)").matches ? 1.45 : 1.8,
    ),
  );
  renderer.setSize(innerWidth, innerHeight);
  renderer.shadowMap.enabled = matchMedia("(min-width:700px)").matches;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  skyLight = new THREE.HemisphereLight(0xd6f1ff, 0x62523d, 2.4);
  scene.add(skyLight);
  sunLight = new THREE.DirectionalLight(0xffe4aa, 3.8);
  sunLight.position.set(-16, 28, 13);
  sunLight.castShadow = renderer.shadowMap.enabled;
  sunLight.shadow.mapSize.set(2048, 2048);
  sunLight.shadow.camera.left = -35;
  sunLight.shadow.camera.right = 35;
  sunLight.shadow.camera.top = 35;
  sunLight.shadow.camera.bottom = -35;
  scene.add(sunLight);
  environment();
  PROJECTS.forEach(building);
  ola = createOla();
  ola.position.set(0, 0, 8);
  scene.add(ola);
  walkTarget.copy(ola.position);
  raycaster = new THREE.Raycaster();
  clock3d = new THREE.Clock();
  bindWorldControls();
  resize();
  addEventListener("resize", resize);
  $("#loading").classList.add("hidden");
  updateHUD();
  updateGoToPrompt();
  animate();
  if ("serviceWorker" in navigator)
    navigator.serviceWorker.register("./sw.js").catch(() => {});
}
function resize() {
  if (!renderer) return;
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
}
function cameraUpdate() {
  target.lerp(ola.position.clone().add(new THREE.Vector3(0, 1.65, 0)), 0.09);
  const x = Math.cos(camYaw) * Math.sin(camPitch) * camDist,
    z = Math.sin(camYaw) * Math.sin(camPitch) * camDist,
    y = Math.cos(camPitch) * camDist + 3.2;
  camera.position.lerp(target.clone().add(new THREE.Vector3(x, y, z)), 0.16);
  camera.lookAt(target);
}
function nextOpenProject() {
  return (
    PROJECTS.find((p) =>
      p.missions.some(
        (m, i) => m[0] !== "FAVORABLE" && !(state.resolved[p.id] || {})[i],
      ),
    ) || null
  );
}
function updateGoToPrompt() {
  const p = nextOpenProject(),
    button = $("#goToBtn");
  if (!button) return;
  if (p) {
    button.disabled = false;
    button.textContent = `GO TO ${p.alias.toUpperCase()} →`;
    $("#objective b").textContent =
      `Next step: go directly to ${p.alias} and open its management decision.`;
  } else {
    button.disabled = true;
    button.textContent = "ALL STEPS CONTROLLED ✓";
    $("#objective b").textContent =
      "All required management decisions are controlled.";
  }
}
function goToProject(p) {
  const model = projectMeshes.find((x) => x.userData.project.id === p.id);
  if (!model) return;
  guidedProject = p;
  nearest = p;
  walkTarget.copy(model.position).add(new THREE.Vector3(0, 0, 4.4));
  hasWalkTarget = true;
  drawNavigationLine(walkTarget);
  model.userData.beacon.visible = true;
  $("#projectSheet").classList.remove("open");
  const button = $("#goToBtn");
  button.disabled = true;
  button.textContent = "TRAVELLING IN 3D…";
  $("#objective b").textContent = `Ola is going directly to ${p.alias}.`;
  toast(`GO TO ${p.alias}`);
}
function drawNavigationLine(destination) {
  if (navigationLine) {
    scene.remove(navigationLine);
    navigationLine.geometry.dispose();
    navigationLine.material.dispose();
  }
  const points = [];
  const start = ola.position.clone();
  const segments = 26;
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const point = start.clone().lerp(destination, t);
    point.y = 0.14 + Math.sin(t * Math.PI) * 0.28;
    points.push(point);
  }
  navigationLine = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints(points),
    new THREE.LineDashedMaterial({
      color: 0xf2ca70,
      linewidth: 2,
      dashSize: 0.55,
      gapSize: 0.28,
      transparent: true,
      opacity: 0.92,
    }),
  );
  navigationLine.computeLineDistances();
  scene.add(navigationLine);
}
function clearNavigationLine() {
  if (!navigationLine) return;
  scene.remove(navigationLine);
  navigationLine.geometry.dispose();
  navigationLine.material.dispose();
  navigationLine = null;
}
function animateOla(dt, moving) {
  worldClock += dt;
  const swing = moving
    ? Math.sin(worldClock * 9.5) * 0.58
    : Math.sin(worldClock * 2.3) * 0.035;
  const lift = moving
    ? Math.abs(Math.sin(worldClock * 9.5)) * 0.055
    : Math.sin(worldClock * 2.1) * 0.018;
  ola.userData.leftArm.rotation.x = swing;
  ola.userData.rightArm.rotation.x = -swing;
  ola.userData.leftLeg.rotation.x = -swing * 0.72;
  ola.userData.rightLeg.rotation.x = swing * 0.72;
  ola.userData.plumbob.rotation.y += dt * 1.8;
  ola.userData.plumbob.position.y = 4.62 + Math.sin(worldClock * 2.6) * 0.09;
  ola.position.y = lift;
}
function updateDayLight() {
  const phase = ((state.hour - 6) / 24) * Math.PI * 2;
  const daylight = THREE.MathUtils.clamp(
    Math.sin(phase) * 0.62 + 0.65,
    0.18,
    1,
  );
  const dayColor = new THREE.Color(0x84b7c7);
  const nightColor = new THREE.Color(0x071323);
  const sky = nightColor.clone().lerp(dayColor, daylight);
  scene.background.copy(sky);
  scene.fog.color.copy(sky);
  sunLight.intensity = 0.45 + daylight * 3.2;
  skyLight.intensity = 0.55 + daylight * 1.85;
}
function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock3d.getDelta(), 0.04);
  if (state.speed > 0) {
    state.hour += dt * state.speed * 0.2;
    if (state.hour >= 24) {
      state.hour -= 24;
      state.day = Math.min(30, state.day + 1);
    }
    state.energy = Math.max(0, state.energy - dt * state.speed * 0.03);
    state.focus = Math.max(0, state.focus - dt * state.speed * 0.025);
    state.patience = Math.max(0, state.patience - dt * state.speed * 0.018);
  }
  const forward = new THREE.Vector3(-Math.cos(camYaw), 0, -Math.sin(camYaw));
  const right = new THREE.Vector3(-forward.z, 0, forward.x);
  let dir = forward.multiplyScalar(move.y).add(right.multiplyScalar(move.x));
  let characterMoving = false;
  if (dir.lengthSq() > 0.01) {
    guidedProject = null;
    hasWalkTarget = false;
    clearNavigationLine();
    dir.normalize();
    ola.position.addScaledVector(dir, dt * 5.5);
    ola.rotation.y = Math.atan2(dir.x, dir.z);
    characterMoving = true;
    updateGoToPrompt();
  } else if (hasWalkTarget) {
    const d = walkTarget.clone().sub(ola.position);
    d.y = 0;
    if (d.length() < 0.28) {
      hasWalkTarget = false;
      if (guidedProject) {
        const arrived = guidedProject;
        guidedProject = null;
        clearNavigationLine();
        openProject(arrived);
        updateGoToPrompt();
      }
    } else {
      d.normalize();
      ola.position.addScaledVector(d, dt * (guidedProject ? 11 : 4.6));
      ola.rotation.y = Math.atan2(d.x, d.z);
      characterMoving = true;
    }
  }
  nearest = null;
  let nd = 999;
  PROJECTS.forEach((p) => {
    const m = projectMeshes.find((x) => x.userData.project.id === p.id),
      d = ola.position.distanceTo(m.position);
    if (d < nd) {
      nd = d;
      nearest = p;
    }
  });
  $("#interactBtn").style.opacity = nd < 7 ? "1" : ".55";
  projectMeshes.forEach((model, index) => {
    const ring = model.userData.beacon?.children?.[0];
    if (ring) {
      ring.rotation.z += dt * (index % 2 ? -0.35 : 0.35);
      ring.material.opacity = 0.48 + Math.sin(worldClock * 2.2 + index) * 0.18;
    }
  });
  animateOla(dt, characterMoving);
  updateDayLight();
  cameraUpdate();
  updateHUD();
  renderer.render(scene, camera);
}
function bindWorldControls() {
  const c = $("#world3d");
  let last = null,
    touches = new Map(),
    pinch = 0;
  c.addEventListener("pointerdown", (e) => {
    c.setPointerCapture(e.pointerId);
    touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
    last = { x: e.clientX, y: e.clientY, moved: false, button: e.button };
  });
  c.addEventListener("pointermove", (e) => {
    if (!touches.has(e.pointerId)) return;
    const p = touches.get(e.pointerId),
      dx = e.clientX - p.x,
      dy = e.clientY - p.y;
    if (Math.abs(dx) + Math.abs(dy) > 3) last.moved = true;
    camYaw -= dx * 0.006;
    camPitch = THREE.MathUtils.clamp(camPitch + dy * 0.004, 0.42, 1.22);
    touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (touches.size === 2) {
      const a = [...touches.values()];
      const d = Math.hypot(a[0].x - a[1].x, a[0].y - a[1].y);
      if (pinch)
        camDist = THREE.MathUtils.clamp(camDist - (d - pinch) * 0.025, 9, 30);
      pinch = d;
    }
  });
  c.addEventListener("pointerup", (e) => {
    touches.delete(e.pointerId);
    pinch = 0;
    if (last && !last.moved && e.button === 0) {
      const ndc = new THREE.Vector2(
        (e.clientX / innerWidth) * 2 - 1,
        -(e.clientY / innerHeight) * 2 + 1,
      );
      raycaster.setFromCamera(ndc, camera);
      const hits = raycaster.intersectObjects(projectMeshes, true);
      if (hits.length) {
        let o = hits[0].object;
        while (o.parent && !o.userData.project) o = o.parent;
        if (o.userData.project) {
          walkTarget.copy(o.position).add(new THREE.Vector3(0, 0, 4));
          hasWalkTarget = true;
          nearest = o.userData.project;
          setTimeout(() => openProject(o.userData.project), 850);
          return;
        }
      }
      const gh = raycaster.intersectObject(ground);
      if (gh.length) {
        guidedProject = null;
        clearNavigationLine();
        walkTarget.copy(gh[0].point);
        hasWalkTarget = true;
      }
    }
  });
  c.addEventListener(
    "wheel",
    (e) => {
      camDist = THREE.MathUtils.clamp(
        camDist + Math.sign(e.deltaY) * 1.2,
        9,
        30,
      );
    },
    { passive: true },
  );
  const jr = $(".joy-ring"),
    jk = $("#joyKnob");
  let jid = null;
  function joy(e) {
    const r = jr.getBoundingClientRect(),
      x = e.clientX - (r.left + r.width / 2),
      y = e.clientY - (r.top + r.height / 2),
      m = Math.min(38, Math.hypot(x, y)),
      a = Math.atan2(y, x);
    const px = Math.cos(a) * m,
      py = Math.sin(a) * m;
    jk.style.transform = `translate(${px}px,${py}px)`;
    move.x = px / 38;
    move.y = -py / 38;
  }
  jr.addEventListener("pointerdown", (e) => {
    jid = e.pointerId;
    jr.setPointerCapture(jid);
    joy(e);
  });
  jr.addEventListener("pointermove", (e) => {
    if (e.pointerId === jid) joy(e);
  });
  jr.addEventListener("pointerup", (e) => {
    if (e.pointerId === jid) {
      jid = null;
      move.x = move.y = 0;
      jk.style.transform = "";
    }
  });
}

function openProject(p) {
  $("#projectAlias").textContent = p.alias.toUpperCase();
  $("#projectName").textContent = p.name;
  $("#projectSource").textContent = p.source;
  $("#projectMetrics").innerHTML = Object.entries(p.metrics)
    .map(([k, v]) => `<div class="metric"><small>${k}</small><b>${v}</b></div>`)
    .join("");
  const done = state.resolved[p.id] || {};
  $("#missionList").innerHTML = p.missions
    .map(
      (m, i) =>
        `<div class="mission"><div class="dot ${m[0]}"></div><div><b>${m[1]}</b><br><small>${m[0]} · ${done[i] ? "Controlled" : "Open"}</small></div><button data-mission="${i}">${done[i] ? "✓" : "GO TO →"}</button></div>`,
    )
    .join("");
  $("#projectSheet").classList.add("open");
  $$("[data-mission]").forEach(
    (b) => (b.onclick = () => openDecision(p, +b.dataset.mission)),
  );
}
function openDecision(p, i) {
  const m = p.missions[i];
  $("#decisionStatus").textContent = m[0];
  $("#decisionTitle").textContent = m[1];
  $("#decisionReading").textContent = m[2];
  $("#decisionEvidence").textContent = `${p.source}. ${m[3]}`;
  $("#decisionOptions").innerHTML = m[4]
    .map(
      (o, j) =>
        `<button data-opt="${j}">${String.fromCharCode(65 + j)}. ${o}</button>`,
    )
    .join("");
  $("#decisionSheet").classList.remove("hidden");
  $$("[data-opt]").forEach(
    (b) => (b.onclick = () => choose(p, i, +b.dataset.opt)),
  );
  $("#decisionGuide").onclick = () => guideAnswer(p, i);
}
function choose(p, i, opt) {
  state.energy = Math.max(0, state.energy - 6);
  state.focus = Math.max(0, state.focus - 8);
  if (opt === 0) {
    state.resolved[p.id] ??= {};
    state.resolved[p.id][i] = true;
    state.patience = Math.min(100, state.patience + 3);
    toast("Correct management decision ✓");
    $("#decisionSheet").classList.add("hidden");
    openProject(p);
    visualReaction(p, true);
    checkWin();
  } else {
    state.patience = Math.max(0, state.patience - 10);
    toast("That decision increased exposure");
    visualReaction(p, false);
  }
  save();
}
function visualReaction(p, good) {
  const g = projectMeshes.find((x) => x.userData.project.id === p.id);
  g.children
    .filter((x) => x.material && x.material.color)
    .forEach((x) => {
      if (good) x.material.color.lerp(new THREE.Color(0x4f8b6a), 0.28);
      else x.material.color.lerp(new THREE.Color(0x8d3434), 0.34);
    });
  if (!good) {
    const flash = new THREE.PointLight(0xff3c32, 12, 10);
    flash.position.copy(g.position).add(new THREE.Vector3(0, 5, 0));
    scene.add(flash);
    setTimeout(() => scene.remove(flash), 700);
  }
}
function useHelp(answer) {
  if (state.help <= 0) {
    if (!state.bonus) {
      state.bonus = true;
      state.help = 2;
      $("#guideText").textContent =
        "خلاص خلّصتي الأربعة… وعشان خاطرك كمان ٢. بس متعوديش نفسك بقى.";
      updateHUD();
      save();
      return true;
    }
    $("#guideText").textContent =
      "يا كوتش، كده الاستشارات المجانية خلصت رسمي. دوري عليا في الميزانية الجاية.";
    return false;
  }
  state.help--;
  $("#guideText").textContent = answer;
  updateHUD();
  save();
  return true;
}
function guideAnswer(p, i) {
  const m = p.missions[i];
  useHelp(
    `بصي يا علا… الإجابة الصح من غير لف ودوران: ${m[4][0]}. واعتبري إني ما قلتش حاجة.`,
  );
  $("#guideModal").classList.remove("hidden");
}
$("#goToBtn").onclick = () => {
  const p = nextOpenProject();
  if (p) goToProject(p);
};
$("#guideBtn").onclick = () => {
  useHelp(
    nearest
      ? "المشروع اللي واقفة جنبه مش محتاج بطولة… محتاج قرار صح ومصدر بيانات محترم. افتحي المهمة وأنا أقولك منين تؤكل الكتف."
      : "اضغطي GO TO وأنا أوصلك للمشروع مباشرة.",
  );
  $("#guideModal").classList.remove("hidden");
};
$("#guideClose").onclick = () => $("#guideModal").classList.add("hidden");
$("#closeDecision").onclick = () => $("#decisionSheet").classList.add("hidden");
$("#closeProject").onclick = () => $("#projectSheet").classList.remove("open");
$("#interactBtn").onclick = () =>
  nearest
    ? openProject(nearest)
    : nextOpenProject()
      ? goToProject(nextOpenProject())
      : toast("All required steps are controlled");

$("#menuBtn").onclick = () => $("#drawer").classList.add("open");
$("#closeDrawer").onclick = () => $("#drawer").classList.remove("open");
$$("[data-speed]").forEach(
  (b) =>
    (b.onclick = () => {
      state.speed = +b.dataset.speed;
      $$("[data-speed]").forEach((x) =>
        x.classList.toggle("selected", x === b),
      );
      save();
    }),
);
$("#teaBtn").onclick = () => {
  state.energy = Math.min(100, state.energy + 18);
  state.patience = Math.min(100, state.patience + 10);
  toast("Tea deployed. Crisis postponed ☕");
};
$("#restBtn").onclick = () => {
  state.hour += 6;
  if (state.hour >= 24) {
    state.hour -= 24;
    state.day++;
  }
  state.energy = Math.min(100, state.energy + 45);
  toast("Ola rested");
};
$("#teamBtn").onclick = () => {
  state.focus = Math.min(100, state.focus + 16);
  state.patience = Math.min(100, state.patience + 5);
  toast("Team aligned");
};
$("#siteBtn").onclick = () => {
  state.focus = Math.min(100, state.focus + 8);
  state.energy = Math.max(0, state.energy - 7);
  toast("Site reality checked");
};
$("#centerBtn").onclick = () => {
  camYaw = 0.65;
  camPitch = 0.75;
  camDist = 18;
  toast("Camera centered");
};
$("#saveBtn").onclick = save;
$("#resetBtn").onclick = () => {
  if (confirm("Reset all game progress?")) {
    localStorage.removeItem("ola3d-v3");
    location.reload();
  }
};
$("#qualityBtn").onclick = () => {
  quality = quality === "auto" ? "low" : quality === "low" ? "high" : "auto";
  $("#qualityBtn").textContent =
    "✨ Quality: " + quality[0].toUpperCase() + quality.slice(1);
  if (renderer)
    renderer.setPixelRatio(
      quality === "low"
        ? 1
        : Math.min(devicePixelRatio, quality === "high" ? 2 : 1.45),
    );
  toast("Graphics " + quality);
};
$("#fullBtn").onclick = () => document.documentElement.requestFullscreen?.();

function checkWin() {
  const total = PROJECTS.reduce(
      (n, p) => n + p.missions.filter((m) => m[0] !== "FAVORABLE").length,
      0,
    ),
    done = PROJECTS.reduce(
      (n, p) =>
        n + Object.values(state.resolved[p.id] || {}).filter(Boolean).length,
      0,
    );
  if (done >= total) {
    $("#objective b").textContent =
      `Controlled ${done} / ${total} management exposures`;
    setTimeout(() => show("success"), 700);
  } else updateGoToPrompt();
}
$("#successNext").onclick = () => {
  show("ending");
  endingStep = 0;
  renderEnding();
};
let endingStep = 0;
const ending = [
  [
    "THE OLD GUIDE",
    "بصي يا كوتش… كده إحنا تمام. المشاريع وقفت على رجليها، والدنيا رجعت تمشي.",
  ],
  ["OLA", "استنى… يعني أنا لمّيت المشاريع وصلّحت الدنيا… وبعدين؟"],
  ["THE OLD GUIDE", "وبعدين إيه؟ كتر خيرك يا فندم. تقدري ترجعي دلوقتي."],
  ["OLA", "آه يعني استخدمتوني وخلاص؟!"],
  [
    "THE OLD GUIDE",
    "استخدمناكي إيه بس… إحنا بنسميها استعانة بخبرة خارجية عشان شكلها يبقى شيك.",
  ],
  [
    "THE OLD GUIDE",
    "طب ما تتقمصيش… إحنا مصريين برضه، ومش هنسيبك تمشي من غير حاجة.",
  ],
];
function renderEnding() {
  const e = ending[endingStep];
  $("#endingSpeaker").textContent = e[0];
  $("#endingLine").textContent = e[1];
  if (endingStep === ending.length - 1) $("#gift").classList.remove("hidden");
}
$("#endingNext").onclick = () => {
  endingStep++;
  if (endingStep < ending.length) renderEnding();
  else {
    show("blackout");
    $("#blackLine").textContent =
      "وخليها معاكي… عشان لو احتجناكي تاني.\n\nبس المرة الجاية مفيش الست مساعدات دول… يمكن اتنين. عشان خاطرك.";
    setTimeout(() => $("#restartStory").classList.remove("hidden"), 2500);
  }
};
$("#restartStory").onclick = () => {
  localStorage.removeItem("ola3d-v3");
  location.reload();
};

renderStory();
updateHUD();
