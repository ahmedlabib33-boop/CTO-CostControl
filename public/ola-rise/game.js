import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.169.0/build/three.module.js";
import {
  NEED_KEYS,
  applySimAction,
  buildStageExam,
  decisionHint,
  moodFor,
  normalizeGameState,
  projectIsControlled,
  trophySummary,
} from "./systems.js";
import { loadLiveGameProjects } from "./live-data.js";

const $ = (s) => document.querySelector(s),
  $$ = (s) => [...document.querySelectorAll(s)];
const escapeHtml = (value) =>
  String(value ?? "").replace(
    /[&<>'"]/g,
    (character) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[
        character
      ],
  );
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

const MUSIC_TRACKS = [
  { label: "The xx · Intro", src: "assets/intro.mp3" },
  { label: "The xx · Crystalised", src: "assets/crystalised.mp3" },
  { label: "Track 3", src: "assets/track-3.mp3" },
];
let musicIndex = 0;
function setMusicVolume(value) {
  const audio = $("#musicPlayer");
  if (!audio) return;
  audio.volume = Math.max(0, Math.min(1, value));
  $("#volumeValue").textContent = `${Math.round(audio.volume * 100)}%`;
  $("#volumeValue").setAttribute("aria-label", `Volume ${Math.round(audio.volume * 100)} percent`);
}
function loadMusicTrack(index, autoplay = false) {
  const audio = $("#musicPlayer");
  if (!audio) return;
  musicIndex = (index + MUSIC_TRACKS.length) % MUSIC_TRACKS.length;
  const track = MUSIC_TRACKS[musicIndex];
  audio.setAttribute("src", track.src);
  audio.load();
  $("#musicTrack").textContent = track.label;
  if (autoplay) audio.play().catch(() => toast("Press Play music to start the soundtrack"));
  $("#musicToggle").textContent = audio.paused ? "▶ Play music" : "❚❚ Pause music";
}
function setupMusic() {
  const audio = $("#musicPlayer");
  if (!audio) return;
  setMusicVolume(0.5);
  loadMusicTrack(0);
  addEventListener("pointerdown", () => {
    if (audio.paused) audio.play().catch(() => {});
  }, { passive: true });
  audio.addEventListener("ended", () => loadMusicTrack(musicIndex + 1, true));
  $("#musicToggle").onclick = () => {
    if (audio.paused) audio.play().then(() => { $("#musicToggle").textContent = "❚❚ Pause music"; }).catch(() => toast("The browser blocked audio; press Play again"));
    else { audio.pause(); $("#musicToggle").textContent = "▶ Play music"; }
  };
  $("#musicPrev").onclick = () => loadMusicTrack(musicIndex - 1, !audio.paused);
  $("#musicNext").onclick = () => loadMusicTrack(musicIndex + 1, !audio.paused);
  $("#volumeDown").onclick = () => setMusicVolume(audio.volume - 0.1);
  $("#volumeUp").onclick = () => setMusicVolume(audio.volume + 0.1);
  addEventListener("keydown", (event) => {
    if (event.key === "AudioVolumeDown") { event.preventDefault(); setMusicVolume(audio.volume - 0.1); }
    if (event.key === "AudioVolumeUp") { event.preventDefault(); setMusicVolume(audio.volume + 0.1); }
    if (event.key === "AudioVolumeMute") { event.preventDefault(); setMusicVolume(audio.volume ? 0 : 0.5); }
  });
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
$("#storyNext").onclick = async () => {
  if (storyIndex < story.length - 1) {
    storyIndex++;
    renderStory();
  } else {
    const button = $("#storyNext");
    button.disabled = true;
    button.textContent = "Reading the current app snapshot…";
    const audio = $("#musicPlayer");
    if (audio?.paused) audio.play().catch(() => {});
    try {
      await ensureLiveProjects();
      show("game");
      init3D();
    } catch (error) {
      console.error(error);
      $("#storyKicker").textContent = "LIVE DATA REQUIRED";
      $("#storyTitle").textContent = "The current game stage could not be built";
      $("#storyBody").textContent = `${error.message} No older project questions were substituted.`;
      button.disabled = false;
      button.textContent = "Retry live reading";
    }
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

let liveGeneratedAt = null,
  liveRegistryFingerprint = null,
  stateStorageKey = "ola3d-live:loading";
function signatureKey(signature) {
  let hash = 2166136261;
  for (const character of signature) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16);
}
async function ensureLiveProjects() {
  const live = await loadLiveGameProjects();
  PROJECTS.splice(0, PROJECTS.length, ...live.projects);
  liveGeneratedAt = live.generatedAt;
  liveRegistryFingerprint = live.registryFingerprint;
  stateStorageKey = `ola3d-live:${signatureKey(live.signature)}`;
  state = normalizeGameState(
    JSON.parse(localStorage.getItem(stateStorageKey) || "null") || {},
  );
  $("#phaseLabel").textContent = `${PROJECTS.length} live stage${PROJECTS.length === 1 ? "" : "s"} · ${PROJECTS.map((project) => project.period).filter(Boolean).join(" · ")}`;
}

let state = normalizeGameState({});
function save() {
  localStorage.setItem(stateStorageKey, JSON.stringify(state));
}
function saveWithToast() {
  save();
  toast("Progress saved locally ✓");
}
function updateHUD() {
  $("#dayLabel").textContent = `Day ${state.day}/30`;
  $("#timeLabel").textContent =
    String(Math.floor(state.hour)).padStart(2, "0") + ":00";
  NEED_KEYS.forEach((k) => {
    const b = `#${k}Bar`,
      v = `#${k}Value`;
    $(b).style.width = state[k] + "%";
    $(b).dataset.level = state[k] < 25 ? "critical" : state[k] < 50 ? "caution" : "good";
    $(v).textContent = Math.round(state[k]);
  });
  $("#helpCount").textContent = state.help;
  const mood = moodFor(state),
    moodLabel = $("#moodLabel");
  moodLabel.textContent = mood.label;
  moodLabel.className = `mood-chip ${mood.tone}`;
  if (ola?.userData?.plumbob) {
    const color = mood.tone === "critical" ? 0xff4d5e : mood.tone === "caution" ? 0xffbd50 : 0x58f29b;
    ola.userData.plumbob.material.color.setHex(color);
    ola.userData.plumbob.material.emissive.setHex(color);
  }
  renderStageRail();
  renderTrophyShelf();
}

let lastStageRender = "",
  lastTrophyRender = "";
function renderStageRail() {
  const rail = $("#stageRail");
  if (!rail || !PROJECTS.length) return;
  const signature = PROJECTS.map((project) => `${project.id}:${projectIsControlled(project, state.resolved[project.id] || {})}:${Boolean(state.trophies[project.id])}`).join("|");
  if (signature === lastStageRender && rail.children.length) return;
  lastStageRender = signature;
  rail.innerHTML = PROJECTS.map((project, index) => {
    const controlled = projectIsControlled(project, state.resolved[project.id] || {}),
      trophy = Boolean(state.trophies[project.id]),
      stateClass = trophy ? "won" : controlled ? "exam" : "active";
    return `<button class="stage-node ${stateClass}" data-stage-project="${escapeHtml(project.id)}" title="${escapeHtml(`${project.name} · ${project.period}`)}"><span>${trophy ? "🏆" : controlled ? "✎" : index + 1}</span><small>${escapeHtml(project.name)}</small></button>${index < PROJECTS.length - 1 ? '<i class="stage-link"></i>' : ""}`;
  }).join("");
  rail.onclick = (event) => {
    const button = event.target.closest("[data-stage-project]");
    if (!button || !rail.contains(button)) return;
    const project = PROJECTS.find((item) => item.id === button.dataset.stageProject);
    if (!project) return;
    if (projectIsControlled(project, state.resolved[project.id] || {}) && !state.trophies[project.id]) openStageExam(project);
    else goToProject(project);
  };
}

function renderTrophyShelf() {
  const shelf = $("#trophyShelf");
  if (!shelf || !PROJECTS.length) return;
  const renderSignature = PROJECTS.map((project) => `${project.id}:${Boolean(state.trophies[project.id])}`).join("|");
  if (renderSignature === lastTrophyRender && shelf.children.length) return;
  lastTrophyRender = renderSignature;
  const summary = trophySummary(PROJECTS, state.trophies);
  shelf.innerHTML = `<div class="trophy-count"><b>${summary.earned}/${summary.total}</b><small>stage trophies</small></div>${PROJECTS.map((project) => `<button data-trophy-project="${escapeHtml(project.id)}" class="${state.trophies[project.id] ? "earned" : "locked"}"><span>${state.trophies[project.id] ? "🏆" : "◇"}</span><small>${escapeHtml(project.name)}</small></button>`).join("")}`;
  $$('[data-trophy-project]').forEach((button) => {
    button.onclick = () => {
      const project = PROJECTS.find((item) => item.id === button.dataset.trophyProject);
      if (!project) return;
      if (state.trophies[project.id]) showThought(`Trophy secured for ${project.name}. The next snapshot will create a fresh challenge.`);
      else if (projectIsControlled(project, state.resolved[project.id] || {})) openStageExam(project);
      else showThought(`Eng. Ola, control every live question for ${project.name} before the checkpoint exam.`);
    };
  });
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
  running = false,
  fountainWater = null,
  fountainJet = null,
  starField = null,
  cloudGroups = [],
  ambientActors = [],
  trophyMeshes = new Map(),
  activeAction = null,
  thoughtPersistent = false;
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
function cloud(x, y, z, scale, speed) {
  const group = new THREE.Group(),
    material = new THREE.MeshStandardMaterial({
      color: 0xf8fbff,
      roughness: 1,
      transparent: true,
      opacity: 0.76,
      depthWrite: false,
    });
  [
    [-1.1, 0, 0, 0.9],
    [0, 0.24, 0, 1.3],
    [1.15, 0.02, 0, 0.82],
    [0.45, -0.12, 0.35, 0.78],
  ].forEach(([cx, cy, cz, size]) => {
    const puff = new THREE.Mesh(new THREE.SphereGeometry(size, 14, 10), material);
    puff.position.set(cx, cy, cz);
    group.add(puff);
  });
  group.position.set(x, y, z);
  group.scale.setScalar(scale);
  group.userData.speed = speed;
  scene.add(group);
  cloudGroups.push(group);
}
function stars() {
  const geometry = new THREE.BufferGeometry(),
    points = [];
  for (let i = 0; i < 340; i++) {
    const radius = THREE.MathUtils.randFloat(58, 100),
      angle = THREE.MathUtils.randFloat(0, Math.PI * 2),
      height = THREE.MathUtils.randFloat(18, 62);
    points.push(Math.cos(angle) * radius, height, Math.sin(angle) * radius);
  }
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(points, 3));
  starField = new THREE.Points(
    geometry,
    new THREE.PointsMaterial({
      color: 0xfff2c7,
      size: 0.22,
      transparent: true,
      opacity: 0,
      sizeAttenuation: true,
    }),
  );
  scene.add(starField);
}
function cafeNook() {
  const group = new THREE.Group(),
    table = cylinder(0.92, 0.82, 0.12, 0x815a37, 24),
    leg = cylinder(0.1, 0.18, 1.0, 0x44352a, 12),
    tray = cylinder(0.42, 0.42, 0.045, 0xc7a650, 24),
    cup = cylinder(0.19, 0.15, 0.32, 0xf4ead5, 18);
  table.position.y = 1.05;
  leg.position.y = 0.52;
  tray.position.set(0, 1.14, 0);
  cup.position.set(0, 1.34, 0);
  const tea = cylinder(0.155, 0.155, 0.012, 0x9a481f, 18);
  tea.position.set(0, 1.51, 0);
  group.add(table, leg, tray, cup, tea);
  [-1, 1].forEach((side) => {
    const seat = box(0.72, 0.12, 0.72, 0x38675b),
      base = cylinder(0.09, 0.14, 0.62, 0x293b39, 10);
    seat.position.set(side * 1.25, 0.65, 0);
    base.position.set(side * 1.25, 0.31, 0);
    group.add(seat, base);
  });
  const sign = textSprite("TEA + FORECAST", "#f6d98c");
  sign.scale.set(3.7, 0.92, 1);
  sign.position.set(0, 2.25, -0.2);
  group.add(sign);
  group.position.set(-5.5, 0, 7.5);
  group.rotation.y = -0.4;
  scene.add(group);
}
function ambientActor(x, z, color) {
  const actor = new THREE.Group(),
    body = cylinder(0.26, 0.34, 1.25, color, 12),
    head = sphere(0.26, 0xc99071, 14, 10);
  body.position.y = 0.95;
  head.position.y = 1.78;
  actor.add(body, head);
  actor.position.set(x, 0, z);
  actor.userData.origin = new THREE.Vector3(x, 0, z);
  actor.userData.phase = Math.random() * Math.PI * 2;
  scene.add(actor);
  ambientActors.push(actor);
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
  fountainWater = new THREE.Mesh(
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
  fountainJet = new THREE.Mesh(
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
  stars();
  cloud(-22, 20, -18, 2.4, 0.42);
  cloud(12, 24, -30, 3.1, 0.28);
  cloud(30, 18, 5, 2.0, 0.5);
  cafeNook();
  ambientActor(-4.2, 0.5, 0x4f7891);
  ambientActor(5.1, 4.8, 0x8d5e72);
  ambientActor(1.6, 10.5, 0x6e8b59);
}
function createTrophy(project, index, animateIn = false) {
  if (!scene || trophyMeshes.has(project.id)) return trophyMeshes.get(project.id);
  const group = new THREE.Group(),
    gold = new THREE.MeshStandardMaterial({
      color: 0xf4ca68,
      emissive: 0x6f4511,
      emissiveIntensity: 0.55,
      metalness: 0.86,
      roughness: 0.2,
    }),
    cup = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.22, 0.52, 20, 1, true), gold),
    stem = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.1, 0.42, 14), gold),
    base = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.4, 0.18, 18), mat(0x26212a, 0.4, 0.35));
  cup.position.y = 0.92;
  stem.position.y = 0.48;
  base.position.y = 0.1;
  [-1, 1].forEach((side) => {
    const handle = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.055, 8, 18, Math.PI), gold);
    handle.position.set(side * 0.36, 0.92, 0);
    handle.rotation.z = side > 0 ? -Math.PI / 2 : Math.PI / 2;
    group.add(handle);
  });
  const star = new THREE.Mesh(new THREE.OctahedronGeometry(0.17), emissive(0xffdc7d, 1.6));
  star.position.y = 1.35;
  group.add(cup, stem, base, star);
  const projectModel = projectMeshes.find((item) => item.userData.project.id === project.id),
    position = projectModel?.position || new THREE.Vector3(index * 2 - 2, 0, 5);
  group.position.copy(position).add(new THREE.Vector3(3.25, animateIn ? 8 : 0.18, 2.8));
  group.scale.setScalar(animateIn ? 0.05 : 0.9);
  group.userData = { projectId: project.id, targetY: 0.18, animateIn };
  scene.add(group);
  trophyMeshes.set(project.id, group);
  return group;
}
function restoreTrophies() {
  PROJECTS.forEach((project, index) => {
    if (state.trophies[project.id]) createTrophy(project, index, false);
  });
}
let thoughtPersistent = false;
function showThought(text, duration = 6500, persistent = false) {
  const bubble = $("#thoughtBubble");
  if (!bubble) return;
  clearTimeout(showThought.timer);
  $("#thoughtText").textContent = text;
  bubble.classList.remove("hidden");
  thoughtPersistent = persistent;
  if (!persistent) showThought.timer = setTimeout(hideThought, duration);
}
function hideThought() {
  clearTimeout(showThought.timer);
  thoughtPersistent = false;
  $("#thoughtBubble")?.classList.add("hidden");
}
function positionThoughtBubble() {
  const bubble = $("#thoughtBubble");
  if (!ola || !camera || !bubble || bubble.classList.contains("hidden")) return;
  const point = ola.position.clone().add(new THREE.Vector3(0, 5.2, 0)).project(camera),
    x = (point.x * 0.5 + 0.5) * innerWidth,
    y = (-point.y * 0.5 + 0.5) * innerHeight;
  bubble.style.setProperty("--bubble-x", `${Math.max(150, Math.min(innerWidth - 150, x))}px`);
  bubble.style.setProperty("--bubble-y", `${Math.max(205, Math.min(innerHeight - 180, y))}px`);
}
function actionProp(action) {
  const prop = new THREE.Group();
  if (action === "tea") {
    const cup = cylinder(0.22, 0.16, 0.34, 0xf7edda, 18),
      tea = cylinder(0.17, 0.17, 0.018, 0xa64b20, 18);
    tea.position.y = 0.18;
    prop.add(cup, tea);
    for (let i = 0; i < 5; i++) {
      const steam = sphere(0.05 + i * 0.012, 0xffffff, 8, 6);
      steam.material.transparent = true;
      steam.material.opacity = 0.38 - i * 0.04;
      steam.position.set(Math.sin(i) * 0.05, 0.34 + i * 0.13, 0);
      prop.add(steam);
    }
  } else if (action === "rest") {
    const pillow = box(0.95, 0.22, 0.62, 0xe7d7bd);
    prop.add(pillow);
  } else if (action === "team") {
    const board = box(1.1, 0.72, 0.08, 0x32556b);
    board.position.y = 0.5;
    prop.add(board);
  } else {
    const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.43, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2), mat(0xf2c33d));
    prop.add(helmet);
  }
  scene.add(prop);
  return prop;
}
function playSimAction(action, line) {
  if (!scene || !ola) return;
  if (activeAction?.prop) scene.remove(activeAction.prop);
  const prop = actionProp(action);
  activeAction = { action, line, prop, started: performance.now(), duration: action === "rest" ? 3600 : 3000 };
  $("#actionFx").textContent = line;
  $("#actionFx").classList.remove("hidden");
  showThought(line, activeAction.duration + 600);
  if (action === "site") {
    const project = nextOpenProject() || PROJECTS[0];
    if (project) goToProject(project);
  }
}
function updateWorldEffects(dt) {
  if (fountainWater) {
    fountainWater.rotation.y += dt * 0.18;
    fountainWater.scale.y = 1 + Math.sin(worldClock * 2.2) * 0.05;
  }
  if (fountainJet) fountainJet.scale.y = 0.9 + Math.sin(worldClock * 3.4) * 0.12;
  cloudGroups.forEach((item) => {
    item.position.x += item.userData.speed * dt;
    if (item.position.x > 58) item.position.x = -58;
  });
  ambientActors.forEach((actor, index) => {
    const phase = worldClock * 0.45 + actor.userData.phase;
    if (activeAction?.action === "team") {
      const angle = (index / ambientActors.length) * Math.PI * 2 + worldClock * 0.16;
      actor.position.lerp(ola.position.clone().add(new THREE.Vector3(Math.cos(angle) * 2, 0, Math.sin(angle) * 2)), 0.06);
      actor.lookAt(ola.position.x, actor.position.y, ola.position.z);
    } else {
      actor.position.x = actor.userData.origin.x + Math.cos(phase) * 1.4;
      actor.position.z = actor.userData.origin.z + Math.sin(phase) * 0.8;
    }
    actor.position.y = Math.abs(Math.sin(phase * 3)) * 0.025;
  });
  trophyMeshes.forEach((trophy) => {
    trophy.rotation.y += dt * 0.7;
    if (trophy.userData.animateIn) {
      trophy.position.y = THREE.MathUtils.lerp(trophy.position.y, trophy.userData.targetY, 0.055);
      const scale = THREE.MathUtils.lerp(trophy.scale.x, 0.9, 0.08);
      trophy.scale.setScalar(scale);
      if (Math.abs(trophy.position.y - trophy.userData.targetY) < 0.05) trophy.userData.animateIn = false;
    }
  });
  if (activeAction) {
    const elapsed = performance.now() - activeAction.started,
      anchor = ola.position.clone().add(new THREE.Vector3(activeAction.action === "tea" ? 0.72 : 0, activeAction.action === "rest" ? 1.15 : 3.0, 0.25));
    activeAction.prop.position.copy(anchor);
    activeAction.prop.rotation.y += dt * 1.2;
    if (activeAction.action === "rest") ola.rotation.z = Math.sin(Math.min(1, elapsed / 700) * Math.PI / 2) * -0.22;
    if (elapsed >= activeAction.duration) {
      scene.remove(activeAction.prop);
      ola.rotation.z = 0;
      activeAction = null;
      $("#actionFx").classList.add("hidden");
    }
  }
  positionThoughtBubble();
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
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.12;
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
  ola.position.set(-3.8, 0, -4.6);
  scene.add(ola);
  restoreTrophies();
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
        (_m, i) => !(state.resolved[p.id] || {})[i],
      ),
    ) || null
  );
}
function nextCheckpointProject() {
  return PROJECTS.find(
    (project) => projectIsControlled(project, state.resolved[project.id] || {}) && !state.trophies[project.id],
  ) || null;
}
function updateGoToPrompt() {
  const p = nextOpenProject(),
    checkpoint = nextCheckpointProject(),
    button = $("#goToBtn");
  if (!button) return;
  if (p) {
    button.disabled = false;
    button.textContent = `GO TO ${p.alias.toUpperCase()} →`;
    $("#objective b").textContent =
      `Next step: go directly to ${p.alias} and open its management decision.`;
  } else if (checkpoint) {
    button.disabled = false;
    button.textContent = `TAKE ${checkpoint.name.toUpperCase()} EXAM →`;
    $("#objective b").textContent = `Live questions controlled. Pass the ${checkpoint.name} checkpoint to earn its trophy.`;
  } else {
    button.disabled = true;
    button.textContent = "ALL STAGES CONTROLLED ✓";
    $("#objective b").textContent = "All live questions and checkpoint trophies are controlled.";
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
  if (starField) starField.material.opacity = THREE.MathUtils.clamp((0.48 - daylight) * 2.8, 0, 0.9);
  cloudGroups.forEach((item) => {
    item.children.forEach((puff) => {
      if (puff.material) puff.material.opacity = 0.24 + daylight * 0.54;
    });
  });
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
    state.social = Math.max(0, state.social - dt * state.speed * 0.012);
    state.fun = Math.max(0, state.fun - dt * state.speed * 0.015);
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
  updateWorldEffects(dt);
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
    .map(([k, v]) => `<div class="metric"><small>${escapeHtml(k)}</small><b>${escapeHtml(v)}</b></div>`)
    .join("");
  const done = state.resolved[p.id] || {};
  $("#missionList").innerHTML = p.missions
    .map(
      (m, i) =>
        `<div class="mission ${done[i] ? "controlled" : ""}"><div class="dot ${escapeHtml(m[0])}"></div><div><b>${escapeHtml(m[1])}</b><br><small>${escapeHtml(m[0])} · ${done[i] ? "Controlled from this snapshot" : `Live question · ${escapeHtml(p.period)}`}</small></div><button data-mission="${i}">${done[i] ? "REVIEW ✓" : "GO TO →"}</button></div>`,
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
  $("#decisionEvidence").textContent = m[6] || `${p.source}. ${m[3]}`;
  const hint = decisionHint(p, m),
    rotation = (i + p.id.length) % m[4].length,
    orderedOptions = m[4].map((option, originalIndex) => ({ option, originalIndex })).slice(rotation).concat(m[4].map((option, originalIndex) => ({ option, originalIndex })).slice(0, rotation));
  $("#decisionHint").textContent = hint;
  document.body.classList.add("modal-question-open");
  showThought(hint, 0, true);
  $("#decisionOptions").innerHTML = orderedOptions
    .map(
      ({ option, originalIndex }, displayIndex) =>
        `<button data-opt="${originalIndex}">${String.fromCharCode(65 + displayIndex)}. ${escapeHtml(option)}</button>`,
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
  const mission = p.missions[i],
    correctIndex = Number.isInteger(mission[5]) ? mission[5] : 0;
  if (opt === correctIndex) {
    state.resolved[p.id] ??= {};
    state.resolved[p.id][i] = true;
    state.patience = Math.min(100, state.patience + 3);
    state.fun = Math.min(100, state.fun + 2);
    toast("Correct management decision ✓");
    showThought("That is the controlled decision. Tiny trophy energy activated. ✦", 3200);
    $("#decisionSheet").classList.add("hidden");
    document.body.classList.remove("modal-question-open");
    openProject(p);
    visualReaction(p, true);
    checkWin();
  } else {
    state.patience = Math.max(0, state.patience - 10);
    toast("That decision increased exposure");
    showThought(decisionHint(p, mission), 0, true);
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
  const correctIndex = Number.isInteger(m[5]) ? m[5] : 0;
  useHelp(
    `بصي يا علا… الإجابة الصح من غير لف ودوران: ${m[4][correctIndex]}. واعتبري إني ما قلتش حاجة.`,
  );
  showThought(decisionHint(p, m), 0, true);
  $("#guideModal").classList.remove("hidden");
}
$("#goToBtn").onclick = () => {
  const p = nextOpenProject();
  if (p) goToProject(p);
  else {
    const checkpoint = nextCheckpointProject();
    if (checkpoint) openStageExam(checkpoint);
  }
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
$("#closeDecision").onclick = () => {
  $("#decisionSheet").classList.add("hidden");
  document.body.classList.remove("modal-question-open");
  hideThought();
};
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
function runSimAction(action) {
  const result = applySimAction(state, action);
  state = result.state;
  updateHUD();
  save();
  playSimAction(action, result.line);
  $("#drawer").classList.remove("open");
  toast(`${action[0].toUpperCase()}${action.slice(1)} action complete ✓`);
}
$("#teaBtn").onclick = () => runSimAction("tea");
$("#restBtn").onclick = () => runSimAction("rest");
$("#teamBtn").onclick = () => runSimAction("team");
$("#siteBtn").onclick = () => runSimAction("site");
$("#centerBtn").onclick = () => {
  camYaw = 0.65;
  camPitch = 0.75;
  camDist = 18;
  toast("Camera centered");
};
$("#saveBtn").onclick = saveWithToast;
$("#resetBtn").onclick = () => {
  if (confirm("Reset progress for this exact live data snapshot? Older snapshot saves will remain separate.")) {
    localStorage.removeItem(stateStorageKey);
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

let activeExam = null;
function openStageExam(project) {
  const questions = buildStageExam(project, 3);
  if (!questions.length) {
    toast("No controlled questions are available for this checkpoint");
    return;
  }
  activeExam = { project, questions, index: 0, score: 0 };
  $("#projectSheet").classList.remove("open");
  $("#decisionSheet").classList.add("hidden");
  $("#examStageLabel").textContent = `${project.name.toUpperCase()} · ${project.period}`;
  $("#examTitle").textContent = "Management Mini Exam";
  $("#examIntro").textContent = "Three compact questions sampled from this live project snapshot. Earn 3/3 to place its trophy in the world.";
  $("#examSheet").classList.remove("hidden");
  document.body.classList.add("modal-question-open");
  renderExamQuestion();
}
function renderExamQuestion() {
  if (!activeExam) return;
  const question = activeExam.questions[activeExam.index],
    count = activeExam.questions.length;
  $("#examCounter").textContent = `Question ${activeExam.index + 1} of ${count} · Score ${activeExam.score}/${count}`;
  $("#examProgressBar").style.width = `${(activeExam.index / count) * 100}%`;
  $("#examQuestion").textContent = question.prompt;
  $("#examEvidence").textContent = question.evidence;
  $("#examOptions").innerHTML = question.options
    .map((option, index) => `<button data-exam-opt="${index}">${String.fromCharCode(65 + index)}. ${escapeHtml(option)}</button>`)
    .join("");
  $$('[data-exam-opt]').forEach((button) => {
    button.onclick = () => answerExam(Number(button.dataset.examOpt));
  });
  $("#examHintBtn").onclick = () => showThought(question.hint, 6500);
  showThought(question.hint, 0, true);
}
function answerExam(selected) {
  if (!activeExam) return;
  const question = activeExam.questions[activeExam.index],
    buttons = $$('[data-exam-opt]');
  if (selected !== question.correctIndex) {
    state.examAttempts[activeExam.project.id] = (state.examAttempts[activeExam.project.id] || 0) + 1;
    buttons[selected]?.classList.add("wrong");
    state.fun = Math.max(0, state.fun - 2);
    save();
    toast("Not controlled yet—use Eng. Ola's thought bubble");
    showThought(question.hint, 0, true);
    return;
  }
  buttons.forEach((button) => (button.disabled = true));
  buttons[selected]?.classList.add("correct");
  activeExam.score += 1;
  activeExam.index += 1;
  state.focus = Math.min(100, state.focus + 3);
  state.fun = Math.min(100, state.fun + 4);
  if (activeExam.index < activeExam.questions.length) {
    $("#examProgressBar").style.width = `${(activeExam.index / activeExam.questions.length) * 100}%`;
    setTimeout(renderExamQuestion, 520);
  } else {
    setTimeout(awardStageTrophy, 620);
  }
}
function awardStageTrophy() {
  if (!activeExam) return;
  const project = activeExam.project,
    projectIndex = PROJECTS.findIndex((item) => item.id === project.id);
  state.trophies[project.id] = {
    period: project.period,
    fingerprint: project.fingerprint,
    earnedAt: new Date().toISOString(),
  };
  state.patience = Math.min(100, state.patience + 8);
  state.fun = Math.min(100, state.fun + 15);
  save();
  createTrophy(project, projectIndex, true);
  $("#examSheet").classList.add("hidden");
  document.body.classList.remove("modal-question-open");
  $("#trophyTitle").textContent = `${project.name} Trophy Earned`;
  $("#trophyText").textContent = `3/3 decisions passed for ${project.period}. This trophy belongs only to fingerprint ${project.fingerprint.slice(0, 12)}…; a changed upload creates fresh questions.`;
  $("#trophyModal").classList.remove("hidden");
  showThought("A trophy! Finally, a management report with handles. 🏆", 5000);
  activeExam = null;
  updateHUD();
}
$("#trophyContinue").onclick = () => {
  $("#trophyModal").classList.add("hidden");
  hideThought();
  checkWin();
  const next = nextOpenProject();
  if (next) goToProject(next);
};

function checkWin() {
  const checkpoint = nextCheckpointProject();
  if (checkpoint) {
    updateGoToPrompt();
    setTimeout(() => openStageExam(checkpoint), 520);
    return;
  }
  const allControlled = PROJECTS.length > 0 && PROJECTS.every((project) => projectIsControlled(project, state.resolved[project.id] || {})),
    allTrophies = PROJECTS.length > 0 && PROJECTS.every((project) => Boolean(state.trophies[project.id]));
  if (allControlled && allTrophies) {
    const total = PROJECTS.reduce((count, project) => count + project.missions.length, 0);
    $("#objective b").textContent = `Controlled ${total} live questions and earned ${PROJECTS.length} stage trophies`;
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

setupMusic();
renderStory();
updateHUD();
