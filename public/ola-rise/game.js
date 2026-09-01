import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.169.0/build/three.module.js";
import {
  NEED_KEYS,
  applySimAction,
  buildDecisionLesson,
  buildLifePractice,
  buildStageExam,
  decisionHint,
  evaluateDecisionChoice,
  evaluateLifePractice,
  findCollisionSafeRoute,
  moodFor,
  normalizeGameState,
  projectIsControlled,
  recordDecisionAttempt,
  isBedtime,
  sleepUntilMorning,
  timePhaseFor,
  trainingSummary,
  trophySummary,
} from "./systems.js?release=20260901-v28";
import { loadLiveGameProjects } from "./live-data.js?release=20260901-v28";

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
const screens = ["game", "success", "ending", "blackout"];
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
const WELLBEING_WORDS = [
  {
    text: "There is nothing stronger than those two: patience and time, they will do it all.",
    author: "Leo Tolstoy · War and Peace",
  },
  {
    text: "He who has a why to live for can bear with almost any how.",
    author: "Friedrich Nietzsche",
  },
  {
    text: "The next small, deliberate action is enough for this moment.",
    author: "OLA: RISE · supportive reflection",
  },
  {
    text: "Rest is part of the plan. You do not have to solve every problem in one moment.",
    author: "OLA: RISE · supportive reflection",
  },
  {
    text: "Meet what is in your control with care; release what is not yours to command.",
    author: "Inspired by Epictetus",
  },
  {
    text: "A difficult hour is not the whole life. Breathe slowly, take water, and begin again.",
    author: "OLA: RISE · supportive reflection",
  },
];
const BAHRAINI_CONVERSATIONS = [
  ["هلا والله يا عُلا… منوّرة المكان كله.", "Eng. Ola, even the city noticed your entrance. Try not to make the skyline jealous. ✨"],
  ["يا زين هالطلة… حتى المشاريع عدّلت وقفتها.", "That was definitely about you—not the dashboard. Keep walking like the plan already passed review."],
  ["شلونج يا عُلا؟ البحرين تقول لج: لا تشيلين هم.", "Take the kindness, leave the worry, and choose one controlled action at a time."],
  ["عيني عليج باردة… كل ما تمشين، الدنيا تصير أرتب.", "Careful, Eng. Ola—the city is flirting with your project-control skills now."],
  ["قهوة على حسابي إذا خلصتي هالتقرير… اتفقنا؟", "A coffee promise is serious business. Finish the evidence check, then collect. ☕"],
  ["منو قدّج يا عُلا؟ حتى الأرقام تحترمج.", "The numbers respect evidence. The speaker may simply be very impressed by you."],
  ["يا بعد قلبي، خذي نفس… الشغل ما يخلص وإنتي أهم.", "A warm Bahraini reminder: breathe, drink water, and do not disappear inside the workload."],
  ["وش هالهيبة؟ المشروع شافج وقال خلاص بنتعدل.", "Apparently your presence is now a mitigation strategy. Verify it before adding it to the register. 😄"],
  ["عُلا، ضحكتج أحلى من تقرير بدون ملاحظات.", "That is a very high compliment in this world. Smile, then check the source evidence."],
];
let musicIndex = 0;
let wellbeingIndex = 0,
  hydrationReminderKey = "",
  conversationCycle = 0,
  conversationChangedAt = 0,
  conversationActorIndex = 0;

function renderWellbeingQuote() {
  const quote = WELLBEING_WORDS[wellbeingIndex % WELLBEING_WORDS.length];
  if ($("#wellbeingQuote")) $("#wellbeingQuote").textContent = `“${quote.text}”`;
  if ($("#wellbeingAuthor")) $("#wellbeingAuthor").textContent = `— ${quote.author}`;
}

function maybeShowWellbeingPrompt() {
  const prompt = $("#wellbeingPrompt");
  if (!prompt || gameFinished || isBedtime(state.hour)) return;
  const hour = Math.floor(state.hour);
  const reminderHour = hour >= 8 && hour <= 20 && hour % 2 === 0;
  const reminderKey = `${state.day}:${hour}`;
  if (!reminderHour || reminderKey === hydrationReminderKey) return;
  hydrationReminderKey = reminderKey;
  prompt.querySelector("b").textContent = hour >= 18
    ? "Water, breathe, then finish gently."
    : "Water time, Eng. Ola.";
  prompt.classList.remove("hidden");
}

function drinkWater() {
  if (!requireAwake()) return;
  state.energy = Math.min(100, state.energy + 4);
  state.focus = Math.min(100, state.focus + 3);
  state.patience = Math.min(100, state.patience + 2);
  $("#wellbeingPrompt")?.classList.add("hidden");
  save();
  updateHUD();
  toast("Water taken · energy and focus supported 💧");
  showThought("Eng. Ola, one small act of care helps the next decision feel lighter.", 4300);
}

function renderAmbientConversations() {
  const container = $("#ambientConversations");
  if (!container || !ambientActors.length) return;
  const actorIndex = conversationActorIndex % Math.min(ambientActors.length, 6),
    actor = ambientActors[actorIndex],
    [line] = ambientConversationFor(actor),
    persona = actor.userData.persona;
  container.innerHTML = `<div class="conversation-sequence"><small>BAHRAIN STREET VOICE · ${actorIndex + 1} / ${Math.min(ambientActors.length, 6)}</small><button class="ambient-conversation" data-chat-actor="${actorIndex}" dir="rtl"><small>${escapeHtml(persona.name)} · ${escapeHtml(persona.role)}</small><b>${escapeHtml(line)}</b><span>روحي اسمعي السالفة ←</span></button></div>`;
  $$('[data-chat-actor]').forEach((button) => {
    button.onclick = () => hearAmbientConversation(Number(button.dataset.chatActor));
  });
  conversationChangedAt = performance.now();
}

function ambientConversationFor(actor) {
  const choices = actor?.userData?.persona?.lines || [0];
  return BAHRAINI_CONVERSATIONS[choices[conversationCycle % choices.length]];
}

function hearAmbientConversation(actorIndex) {
  if (!state.nightSocial && !requireAwake()) return;
  const actor = ambientActors[actorIndex];
  if (!actor) return;
  const [_line, response] = ambientConversationFor(actor);
  guidedProject = null;
  hasWalkTarget = true;
  walkBlockedFrames = 0;
  walkTarget.copy(actor.position).add(new THREE.Vector3(0, 0, 1.45));
  drawNavigationLine(walkTarget);
  state.social = Math.min(100, state.social + 4);
  state.fun = Math.min(100, state.fun + 3);
  save();
  updateHUD();
  showThought(response, 6500);
  toast("Ola is going to hear the conversation…");
  conversationActorIndex = (actorIndex + 1) % Math.min(ambientActors.length, 6);
  conversationCycle = (conversationCycle + 1) % BAHRAINI_CONVERSATIONS.length;
  renderAmbientConversations();
}

function positionAmbientConversations() {
  const container = $("#ambientConversations");
  if (!container || !camera || !ambientActors.length) return;
  if ((isBedtime(state.hour) && !state.nightSocial) || $("#decisionSheet")?.classList.contains("hidden") === false || $("#drawer")?.classList.contains("open")) {
    container.classList.add("hidden");
    return;
  }
  container.classList.remove("hidden");
  if (performance.now() - conversationChangedAt > 9000) {
    conversationCycle = (conversationCycle + 1) % BAHRAINI_CONVERSATIONS.length;
    renderAmbientConversations();
  }
  $$('[data-chat-actor]').forEach((button) => {
    const actor = ambientActors[Number(button.dataset.chatActor)];
    if (!actor) return;
    const point = actor.position.clone().add(new THREE.Vector3(0, 2.45, 0)).project(camera),
      x = (point.x * 0.5 + 0.5) * innerWidth + (Number(button.dataset.chatActor) % 2 ? 18 : -18),
      y = (-point.y * 0.5 + 0.5) * innerHeight - (Number(button.dataset.chatActor) % 3) * 24,
      visible = point.z > -1 && point.z < 1 && x > 110 && x < innerWidth - 110 && y > 220 && y < innerHeight - 120;
    button.classList.toggle("hidden", !visible);
    if (visible) {
      button.style.left = `${x}px`;
      button.style.top = `${y}px`;
    }
  });
}
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
  setMusicVolume(0);
  loadMusicTrack(0);
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
    if (event.key === "AudioVolumeMute") { event.preventDefault(); setMusicVolume(audio.volume ? 0 : 0.7); }
  });
}

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
  ensureProjectMomentum();
  $("#phaseLabel").textContent = `${PROJECTS.length} live stage${PROJECTS.length === 1 ? "" : "s"} · ${PROJECTS.map((project) => project.period).filter(Boolean).join(" · ")}`;
}

let directStartPromise = null;
function renderDirectStartError(error) {
  const loading = $("#loading");
  if (!loading) return;
  loading.classList.remove("hidden");
  loading.classList.add("loading-error");
  loading.innerHTML = `
    <b>Current live game data could not be loaded</b>
    <small>${escapeHtml(error?.message || "Unknown live-data error")} No older project questions were substituted.</small>
    <button id="retryLiveGame" class="primary">Retry live reading</button>
  `;
  $("#retryLiveGame").onclick = () => startGameDirectly();
}
function startGameDirectly() {
  if (directStartPromise) return directStartPromise;
  const loading = $("#loading");
  loading?.classList.remove("loading-error", "hidden");
  directStartPromise = (async () => {
    await ensureLiveProjects();
    show("game");
    init3D();
  })().catch((error) => {
    console.error(error);
    directStartPromise = null;
    renderDirectStartError(error);
  });
  return directStartPromise;
}

let state = normalizeGameState({});
let gameFinished = false,
  gameOutcome = null;
let currentDecisionPractice = null,
  selectedDecisionConfidence = 2,
  activeLifePractice = null,
  lastLifePracticeSignature = "";
function save() {
  localStorage.setItem(stateStorageKey, JSON.stringify(state));
}
function saveWithToast() {
  save();
  toast("Progress saved locally ✓");
}
function ensureProjectMomentum() {
  state.projectMomentum ??= {};
  PROJECTS.forEach((project) => {
    if (Number.isFinite(Number(state.projectMomentum[project.id]))) return;
    const resolved = state.resolved[project.id] || {};
    const controlled = project.missions.filter((_mission, index) => Boolean(resolved[index])).length;
    const ratio = project.missions.length ? controlled / project.missions.length : 0;
    state.projectMomentum[project.id] = Math.round(50 + ratio * 20);
  });
}
function trajectoryFor(project) {
  ensureProjectMomentum();
  const momentum = Math.max(0, Math.min(100, Number(state.projectMomentum[project.id]) || 0));
  if (momentum >= 72) return { momentum, label: "RISING", tone: "rising", detail: "Controlled decisions are strengthening this project’s path." };
  if (momentum >= 52) return { momentum, label: "STEADY", tone: "steady", detail: "The project is holding course; keep checking the live evidence." };
  if (momentum >= 35) return { momentum, label: "RECOVERING", tone: "recovering", detail: "Recovery is possible; protect the next decision and review the open exposure." };
  if (momentum <= 20) return { momentum, label: "FAILING", tone: "failing", detail: "Repeated uncontrolled decisions have pushed this project into a failing trajectory. Recover the evidence-led control." };
  return { momentum, label: "AT RISK", tone: "risk", detail: "Uncontrolled choices are weakening the project path; use the evidence-led recovery action." };
}
function applyProjectDecisionImpact(project, good, amount = null) {
  ensureProjectMomentum();
  const delta = amount ?? (good ? 8 : -10);
  state.projectMomentum[project.id] = Math.max(0, Math.min(100, (Number(state.projectMomentum[project.id]) || 50) + delta));
  return trajectoryFor(project);
}
function updateProjectTrajectories() {
  ensureProjectMomentum();
  projectMeshes.forEach((model) => {
    const project = model.userData.project;
    const trajectory = trajectoryFor(project);
    const color = trajectory.tone === "failing" || trajectory.tone === "risk" ? 0xff5566 : trajectory.tone === "recovering" ? 0xffc04f : trajectory.tone === "steady" ? 0x73c9ff : 0x58f29b;
    model.userData.beacon?.children?.forEach((part) => {
      if (part.material?.color) part.material.color.setHex(color);
    });
    model.userData.trajectory = trajectory;
  });
}
function renderProjectTrajectory(project) {
  const trajectory = trajectoryFor(project);
  const root = $("#projectTrajectory");
  if (!root) return trajectory;
  root.className = `project-trajectory ${trajectory.tone}`;
  root.innerHTML = `<div class="trajectory-head"><span><small>PROJECT MOMENTUM</small><b>${trajectory.label}</b></span><strong>${Math.round(trajectory.momentum)}%</strong></div><div class="trajectory-track"><i style="width:${trajectory.momentum}%"></i></div><p>${escapeHtml(trajectory.detail)}</p>`;
  return trajectory;
}
function updateHUD() {
  $("#dayLabel").textContent = `Day ${state.day}/30`;
  $("#timeLabel").textContent =
    String(Math.floor(state.hour)).padStart(2, "0") + ":00";
  const timePhase = timePhaseFor(state.hour);
  $("#timePhase").textContent = timePhase.label;
  document.body.dataset.timePhase = timePhase.id;
  document.body.classList.toggle("night-social-mode", Boolean(state.nightSocial && isBedtime(state.hour)));
  $("#nightSocialDock")?.classList.toggle("hidden", !(state.nightSocial && isBedtime(state.hour)));
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
  const missionTotal = PROJECTS.reduce((count, project) => count + project.missions.length, 0),
    missionControlled = PROJECTS.reduce(
      (count, project) => count + project.missions.filter((_mission, index) => Boolean((state.resolved[project.id] || {})[index])).length,
      0,
    ),
    campaignProgress = $("#campaignProgress"),
    campaignProgressBar = $("#campaignProgressBar");
  if (campaignProgress) campaignProgress.textContent = `${missionControlled} / ${missionTotal}`;
  if (campaignProgressBar) campaignProgressBar.style.width = `${missionTotal ? (missionControlled / missionTotal) * 100 : 0}%`;
  maybeShowWellbeingPrompt();
  renderStageRail();
  renderTrophyShelf();
  renderDecisionTraining();
  renderLifePractice();
  updateProjectTrajectories();
}

function renderDecisionTraining() {
  const summary = trainingSummary(state.training, state.day);
  if (!$("#decisionTrainingStats")) return;
  $("#trainingXp").textContent = `${summary.xp} XP`;
  $("#trainingAccuracy").textContent = summary.attempts ? `${summary.accuracy}%` : "—";
  $("#trainingReflections").textContent = String(summary.reflections);
  $("#trainingReviewDue").textContent = String(summary.dueNow || summary.reviewDue);
  $("#decisionTrainingStats").title = `${summary.correct}/${summary.attempts} choices correct · ${summary.streak} current streak · ${summary.lifeCompleted} life decisions practiced`;
}

function renderLifePractice() {
  const root = $("#lifePractice");
  if (!root) return;
  const challenge = buildLifePractice(state),
    signature = `${challenge.id}:${state.day}:${Math.floor(state.hour)}:${Math.round(state.energy / 5)}:${Math.round(state.focus / 5)}:${Math.round(state.patience / 5)}:${Math.round(state.social / 5)}`;
  activeLifePractice = challenge;
  if (signature === lastLifePracticeSignature && $("#lifePracticeOptions").children.length) return;
  lastLifePracticeSignature = signature;
  $("#lifePracticeTitle").textContent = challenge.prompt;
  $("#lifePracticeSituation").textContent = challenge.situation;
  $("#lifePracticePrinciple").textContent = challenge.principle;
  $("#lifePracticePrompt").textContent = "Choose the action that addresses the real constraint:";
  $("#lifePracticeBadge").textContent = `DAY ${state.day}`;
  $("#lifePracticeFeedback").classList.add("hidden");
  $("#lifePracticeOptions").innerHTML = challenge.options
    .map((option) => `<button type="button" data-life-action="${escapeHtml(option.action)}">${escapeHtml(option.label)}</button>`)
    .join("");
  $$('[data-life-action]').forEach((button) => {
    button.onclick = () => handleLifePractice(button.dataset.lifeAction);
  });
}

function handleLifePractice(action) {
  if (!activeLifePractice) return;
  const evaluation = evaluateLifePractice(activeLifePractice, action),
    key = `life:${activeLifePractice.id}`,
    feedback = $("#lifePracticeFeedback");
  $$('[data-life-action]').forEach((button) => {
    button.classList.remove("correct", "wrong");
    if (button.dataset.lifeAction === action) button.classList.add(evaluation.correct ? "correct" : "wrong");
  });
  feedback.classList.remove("hidden", "correct", "wrong");
  feedback.classList.add(evaluation.correct ? "correct" : "wrong");
  feedback.innerHTML = `<b>${evaluation.correct ? "Controlled life decision" : "Pause and diagnose again"}</b><p>${escapeHtml(evaluation.feedback)}</p><small>${escapeHtml(evaluation.principle)}</small>`;
  if (!evaluation.correct) {
    state.training = recordDecisionAttempt(state.training, {
      key,
      correct: false,
      confidence: 2,
      day: state.day,
      reflected: false,
    });
    state.patience = Math.max(0, state.patience - 2);
    save();
    renderDecisionTraining();
    toast("Useful mistake recorded—try the real constraint again");
    return;
  }
  state.training = recordDecisionAttempt(state.training, {
    key,
    correct: true,
    confidence: 2,
    day: state.day,
    reflected: true,
  });
  state.training.lifeCompleted += 1;
  lastLifePracticeSignature = "";
  if (action === "sleep") {
    save();
    wakeToMorning();
    return;
  }
  const result = applySimAction(state, action);
  state = result.state;
  save();
  updateHUD();
  playSimAction(action, result.line);
  toast("Life decision practiced · +20 XP");
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
  snowField = null,
  worldClock = 0,
  quality = "auto",
  running = false,
  fountainWater = null,
  fountainJet = null,
  starField = null,
  cloudGroups = [],
  ambientActors = [],
  collisionBoxes = [],
  trophyMeshes = new Map(),
  activeAction = null,
  thoughtPersistent = false;
const move = { x: 0, y: 0 },
  walkTarget = new THREE.Vector3();
let hasWalkTarget = false,
  nightFoodTravel = false,
  walkBlockedFrames = 0,
  walkRoute = [],
  walkRouteIndex = 0,
  nightFoodReplans = 0,
  nightFoodFallbackTimer = 0;
const FOOD_COURT_ARRIVAL = { x: 35, z: 32.5 };
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
function registerCollider(x, z, width, depth, padding = 0.2) {
  collisionBoxes.push({
    minX: x - width / 2 - padding,
    maxX: x + width / 2 + padding,
    minZ: z - depth / 2 - padding,
    maxZ: z + depth / 2 + padding,
  });
}
function blockedAt(x, z, radius = 0.48) {
  if (Math.abs(x) > 73 || Math.abs(z) > 73) return true;
  return collisionBoxes.some((obstacle) =>
    x + radius > obstacle.minX && x - radius < obstacle.maxX &&
    z + radius > obstacle.minZ && z - radius < obstacle.maxZ,
  );
}
function moveOlaWithCollision(direction, distance) {
  if (!ola) return false;
  const next = ola.position.clone().addScaledVector(direction, distance),
    moved = ola.position.clone();
  next.y = 0;
  if (!blockedAt(next.x, next.z)) {
    ola.position.copy(next);
    return true;
  }
  // Slide along a facade when a diagonal route meets a building corner.
  if (!blockedAt(next.x, moved.z)) moved.x = next.x;
  if (!blockedAt(moved.x, next.z)) moved.z = next.z;
  const changed = moved.x !== ola.position.x || moved.z !== ola.position.z;
  if (changed) ola.position.copy(moved);
  return changed;
}
function planFoodCourtRoute() {
  walkRoute = findCollisionSafeRoute(
    { x: ola.position.x, z: ola.position.z },
    FOOD_COURT_ARRIVAL,
    (x, z) => blockedAt(x, z, 0.62),
    { step: 1.5, limit: 72 },
  );
  walkRouteIndex = 0;
  const first = walkRoute[0] || FOOD_COURT_ARRIVAL;
  walkTarget.set(first.x, 0, first.z);
  hasWalkTarget = true;
  walkBlockedFrames = 0;
  drawNavigationLine(walkTarget);
}
function advanceFoodCourtRoute() {
  if (!nightFoodTravel || walkRouteIndex >= walkRoute.length - 1) return false;
  walkRouteIndex += 1;
  const next = walkRoute[walkRouteIndex];
  walkTarget.set(next.x, 0, next.z);
  hasWalkTarget = true;
  walkBlockedFrames = 0;
  drawNavigationLine(walkTarget);
  return true;
}
function foodCourtArrivalPoint() {
  const candidates = [
    FOOD_COURT_ARRIVAL,
    { x: 35, z: 34.5 },
    { x: 32.5, z: 32.5 },
    { x: 38, z: 32.5 },
  ];
  return candidates.find((point) => !blockedAt(point.x, point.z, 0.62)) || FOOD_COURT_ARRIVAL;
}
function arriveAtFoodCourt({ cinematic = false } = {}) {
  if (!nightFoodTravel) return;
  clearTimeout(nightFoodFallbackTimer);
  nightFoodFallbackTimer = 0;
  const arrival = foodCourtArrivalPoint();
  if (cinematic) ola.position.set(arrival.x, 0, arrival.z);
  hasWalkTarget = false;
  nightFoodTravel = false;
  walkRoute = [];
  clearNavigationLine();
  camYaw = Math.PI / 2;
  camPitch = 1.25;
  camDist = 29;
  document.body.classList.add("food-court-arrival");
  setTimeout(() => document.body.classList.remove("food-court-arrival"), 900);
  setTimeout(() => {
    $("#drawer").classList.add("open");
    $(".food-menu")?.scrollIntoView({ behavior: "auto", block: "center" });
  }, cinematic ? 720 : 350);
  showThought("Welcome to the Food Court. The night street is open for food, snowfall, and Bahraini conversation.", 6500);
  toast(cinematic ? "Arrived safely via the city route" : "Arrived at the Food Court");
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
    mat(0x7d675f, 0.03, 0.78),
  );
  skirt.position.y = 1.05;
  skirt.castShadow = true;
  g.add(skirt);
  const torso = new THREE.Mesh(
    new THREE.CylinderGeometry(0.5, 0.58, 1.42, 12),
    mat(0x8a7168, 0.03, 0.72),
  );
  torso.position.y = 2.22;
  torso.castShadow = true;
  g.add(torso);
  const jacket = box(1.04, 0.12, 0.62, 0x6f5a54);
  jacket.position.set(0, 2.58, 0);
  g.add(jacket);
  const sash = new THREE.Mesh(
    new THREE.TorusGeometry(0.52, 0.055, 8, 32, Math.PI * 1.15),
    mat(0xa98e80, 0.02, 0.76),
  );
  sash.position.set(0, 1.72, 0.03);
  sash.rotation.x = Math.PI / 2;
  g.add(sash);

  const leftLeg = new THREE.Group();
  const rightLeg = new THREE.Group();
  [-0.29, 0.29].forEach((x, index) => {
    const leg = index ? rightLeg : leftLeg;
    const calf = cylinder(0.15, 0.13, 0.88, 0x262326, 10);
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
    const sleeve = cylinder(0.17, 0.14, 1.05, 0x816a61, 10);
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
    mat(0xf3f5f8, 0.04, 0.68),
  );
  hijab.position.y = 3.61;
  hijab.castShadow = true;
  g.add(hijab);
  const scarf = new THREE.Mesh(
    new THREE.ConeGeometry(0.5, 0.82, 18),
    mat(0xe1e6ec, 0.04, 0.72),
  );
  scarf.position.set(0, 3.08, -0.08);
  g.add(scarf);
  const glassesMaterial = new THREE.MeshStandardMaterial({
    color: 0x352922,
    metalness: 0.35,
    roughness: 0.3,
  });
  [-0.18, 0.18].forEach((x) => {
    const frame = new THREE.Mesh(new THREE.TorusGeometry(0.135, 0.027, 8, 20), glassesMaterial);
    frame.position.set(x, 3.52, 0.45);
    frame.scale.y = 0.78;
    g.add(frame);
  });
  const bridge = box(0.12, 0.035, 0.035, 0x352922);
  bridge.position.set(0, 3.52, 0.45);
  g.add(bridge);
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

  const bag = new THREE.Group();
  const bagBody = box(0.5, 0.68, 0.2, 0x171719),
    bagFlap = box(0.42, 0.16, 0.23, 0x292326),
    clasp = sphere(0.045, 0xe1bd68, 8, 6);
  bagBody.position.y = 0;
  bagFlap.position.set(0, 0.26, 0.02);
  clasp.position.set(0, 0.22, 0.14);
  bag.add(bagBody, bagFlap, clasp);
  bag.position.set(0.85, 1.58, 0.02);
  g.add(bag);
  const strap = new THREE.Mesh(
    new THREE.TorusGeometry(0.48, 0.035, 8, 24, Math.PI),
    mat(0x2b211c),
  );
  strap.position.set(0.39, 2.04, 0.08);
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
  g.scale.setScalar(0.65);
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
function externalLadder(group, x, y, z, height = 2.7) {
  const metal = mat(0x4b5960, 0.65, 0.38),
    left = cylinder(0.035, 0.035, height, 0x4b5960, 8),
    right = cylinder(0.035, 0.035, height, 0x4b5960, 8);
  left.material = metal;
  right.material = metal;
  left.position.set(x - 0.22, y + height / 2, z);
  right.position.set(x + 0.22, y + height / 2, z);
  group.add(left, right);
  for (let rung = 0; rung < Math.floor(height / 0.42); rung++) {
    const step = box(0.52, 0.045, 0.045, 0x65747a);
    step.material = metal;
    step.position.set(x, y + 0.22 + rung * 0.42, z);
    group.add(step);
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
  externalLadder(group, -2.5, 1.05, -2.78, 3.9);
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
  externalLadder(group, 2.62, 1.0, -2.2, 4.4);
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
  registerCollider(g.position.x, g.position.z, 7.6, 5.4, 0.32);
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
    if (i > 0) {
      const snowCap = sphere(
        (0.49 - i * 0.045) * scale,
        0xe8f5ff,
        16,
        10,
      );
      snowCap.scale.y = 0.3;
      snowCap.position.set(
        (i - 1) * 0.22 * scale,
        (2.13 + i * 0.3) * scale,
        -0.04 * scale,
      );
      g.add(snowCap);
    }
  }
  g.position.set(x, 0, z);
  registerCollider(x, z, 0.72 * scale, 0.72 * scale, 0.08);
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
  registerCollider(x, z, 0.62 * scale, 0.62 * scale, 0.08);
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
  registerCollider(x, z, 0.32, 0.32, 0.08);
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
function snowfall() {
  const count = matchMedia("(max-width: 620px)").matches ? 110 : 230,
    positions = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    positions[i * 3] = THREE.MathUtils.randFloatSpread(70);
    positions[i * 3 + 1] = THREE.MathUtils.randFloat(2, 31);
    positions[i * 3 + 2] = THREE.MathUtils.randFloatSpread(70);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  snowField = new THREE.Points(
    geometry,
    new THREE.PointsMaterial({
      color: 0xf4fbff,
      size: 0.13,
      transparent: true,
      opacity: 0.72,
      depthWrite: false,
      sizeAttenuation: true,
    }),
  );
  scene.add(snowField);
  for (let i = 0; i < 26; i++) {
    const patch = new THREE.Mesh(
      new THREE.CircleGeometry(THREE.MathUtils.randFloat(0.3, 1.15), 18),
      new THREE.MeshStandardMaterial({
        color: 0xdcecf2,
        roughness: 1,
        transparent: true,
        opacity: THREE.MathUtils.randFloat(0.24, 0.5),
      }),
    );
    patch.rotation.x = -Math.PI / 2;
    patch.position.set(
      THREE.MathUtils.randFloatSpread(42),
      0.075,
      THREE.MathUtils.randFloatSpread(34),
    );
    scene.add(patch);
  }
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
  const coffee = cylinder(0.155, 0.155, 0.012, 0x4b2412, 18);
  coffee.position.set(0, 1.51, 0);
  group.add(table, leg, tray, cup, coffee);
  [-1, 1].forEach((side) => {
    const seat = box(0.72, 0.12, 0.72, 0x38675b),
      base = cylinder(0.09, 0.14, 0.62, 0x293b39, 10);
    seat.position.set(side * 1.25, 0.65, 0);
    base.position.set(side * 1.25, 0.31, 0);
    group.add(seat, base);
  });
  const sign = textSprite("COFFEE + FORECAST", "#f6d98c");
  sign.scale.set(3.7, 0.92, 1);
  sign.position.set(0, 2.25, -0.2);
  group.add(sign);
  group.position.set(-5.5, 0, 7.5);
  group.rotation.y = -0.4;
  scene.add(group);
}
function foodCourt() {
  const court = new THREE.Group(),
    courtyard = box(24, 0.16, 19, 0xb5a88f),
    street = box(27, 0.1, 4.8, 0x343b3d),
    curb = box(27, 0.18, 0.34, 0xe5d9bf);
  courtyard.position.y = 0.08;
  street.position.set(0, 0.1, 10.4);
  curb.position.set(0, 0.18, 7.9);
  court.add(courtyard, street, curb);

  const shopBlock = (x, z, width, facade, signText) => {
    const block = new THREE.Group(),
      building = box(width, 5.1, 3.8, facade),
      shop = box(width - 0.55, 1.8, 0.22, 0x31505b),
      awning = box(width - 0.3, 0.16, 1.25, 0xd29a3f),
      balcony = box(width - 0.65, 0.16, 1.0, 0xb99f7c);
    building.position.y = 2.55;
    shop.position.set(0, 1.05, 2.02);
    awning.position.set(0, 2.05, 2.52);
    balcony.position.set(0, 3.42, 2.28);
    block.add(building, shop, awning, balcony);
    for (let index = 0; index < 4; index++) {
      const rail = box(0.06, 0.65, 0.06, 0x654f3e),
        window = box(0.62, 0.72, 0.08, 0x8ec3ce),
        ac = box(0.48, 0.34, 0.24, 0xd8d5cc);
      rail.position.set(-width / 2 + 0.7 + index * ((width - 1.4) / 3), 3.78, 2.75);
      window.position.set(-width / 2 + 0.72 + index * ((width - 1.44) / 3), 4.1, 1.94);
      ac.position.set(-width / 2 + 0.8 + index * ((width - 1.6) / 3), 2.9, 2.03);
      block.add(rail, window, ac);
    }
    const roofTrim = box(width + 0.24, 0.22, 4.06, 0x9d7a58),
      cornice = box(width + 0.12, 0.16, 0.18, 0xf0d7a6);
    roofTrim.position.y = 5.18;
    cornice.position.set(0, 4.72, 2.02);
    block.add(roofTrim, cornice);
    for (let floor = 0; floor < 2; floor++) {
      for (let column = 0; column < Math.max(2, Math.floor(width / 2.3)); column++) {
        const gap = width / Math.max(2, Math.floor(width / 2.3) + 1),
          frame = box(0.92, 0.82, 0.07, 0xc5e0e5),
          pane = box(0.68, 0.56, 0.08, floor ? 0x7ea8b9 : 0x96c4cf);
        frame.position.set(-width / 2 + gap * (column + 1), 3.05 + floor * 1.12, 1.96);
        pane.position.set(frame.position.x, frame.position.y, 2.0);
        block.add(frame, pane);
      }
    }
    const sign = textSprite(signText, "#fff0bd");
    sign.scale.set(Math.min(width - 0.4, 5.8), 0.95, 1);
    sign.position.set(0, 2.55, 2.2);
    block.add(sign);
    externalLadder(block, width / 2 - 0.55, 0.4, -1.95, 3.8);
    block.position.set(x, 0, z);
    court.add(block);
  };
  shopBlock(-7.2, -6.3, 7.8, 0xd7c3a4, "FOOD COURT");
  shopBlock(1.2, -6.3, 7.6, 0xc8b08e, "KARAK · TAMEEZ");
  shopBlock(8.4, -6.3, 5.8, 0xe0cfb3, "PIZZA · BURGER");

  const stall = box(7.2, 2.7, 2.8, 0xf1e5cf),
    counter = box(6.5, 0.76, 0.82, 0x8b5d3e),
    canopy = box(7.7, 0.18, 3.2, 0xe3ad45);
  stall.position.set(0, 1.44, 2.6);
  counter.position.set(0, 0.95, 4.25);
  canopy.position.set(0, 2.92, 3.12);
  court.add(stall, counter, canopy);
  const mainSign = textSprite("FOOD COURT", "#fff0bd");
  mainSign.scale.set(8.4, 1.2, 1);
  mainSign.position.set(0, 3.75, 4.15);
  court.add(mainSign);
  const gateLeft = box(0.68, 3.4, 0.72, 0xd8c3a1),
    gateRight = box(0.68, 3.4, 0.72, 0xd8c3a1),
    gateBeam = box(10.7, 0.52, 0.72, 0xb89362),
    gateSign = textSprite("WELCOME · FOOD COURT", "#fff1bb");
  gateLeft.position.set(-5.1, 1.7, 8.0);
  gateRight.position.set(5.1, 1.7, 8.0);
  gateBeam.position.set(0, 3.3, 8.0);
  gateSign.scale.set(7.8, 1.0, 1);
  gateSign.position.set(0, 3.42, 8.42);
  court.add(gateLeft, gateRight, gateBeam, gateSign);
  [-8.8, 8.8].forEach((x) => {
    const planter = cylinder(0.76, 0.88, 0.62, 0xa7845b, 18),
      trunk = cylinder(0.08, 0.13, 1.8, 0x745234, 9),
      crown = sphere(0.76, 0x3d8055, 16, 12);
    planter.position.set(x, 0.32, 6.9);
    trunk.position.set(x, 1.45, 6.9);
    crown.position.set(x, 2.45, 6.9);
    court.add(planter, trunk, crown);
  });

  for (let index = 0; index < 11; index++) {
    const lamp = sphere(0.13, 0xffd986, 12, 8),
      cableX = -10 + index * 2;
    lamp.material = emissive(0xffc96a, 1.5);
    lamp.position.set(cableX, 4.8 + Math.sin(index * 0.8) * 0.25, 0.4);
    court.add(lamp);
  }
  for (let index = 0; index < 5; index++) {
    const table = cylinder(0.62, 0.58, 0.1, 0x8d684a, 18),
      leg = cylinder(0.07, 0.12, 0.72, 0x574338, 10);
    table.position.set(-7 + index * 3.4, 0.82, 6.0 - (index % 2) * 1.2);
    leg.position.set(table.position.x, 0.4, table.position.z);
    court.add(table, leg);
  }
  for (let index = 0; index < 4; index++) {
    const car = box(2.5, 0.72, 1.2, index % 2 ? 0xe4e4df : 0x5f7f91),
      roof = box(1.4, 0.48, 1.05, index % 2 ? 0xd7d7d2 : 0x4b6573);
    car.position.set(-9 + index * 6, 0.48, 10.5);
    roof.position.set(car.position.x, 1.04, 10.5);
    court.add(car, roof);
  }
  const pizza = new THREE.Mesh(new THREE.ConeGeometry(0.48, 0.8, 3), mat(0xeebd53));
  pizza.rotation.z = Math.PI / 2;
  pizza.position.set(-1.4, 1.55, 4.7);
  court.add(pizza);
  const burger = new THREE.Group();
  [
    [0.2, 0xcf8a35],
    [0.1, 0x4e2d1e],
    [0.07, 0x65a54c],
    [0.2, 0xcf8a35],
  ].forEach(([height, color], index) => {
    const layer = cylinder(0.43, 0.43, height, color, 20);
    layer.position.y = index * 0.15;
    burger.add(layer);
  });
  burger.position.set(1.3, 1.38, 4.7);
  court.add(burger);
  // North Khobar street character: tiled forecourt, lane markings, shaded seating,
  // rooftop tanks and small storefront details make this a real neighborhood, not a prop.
  const tileColors = [0xc6b18d, 0xd9c8a8, 0xbca27d];
  for (let x = -11; x <= 11; x += 2.2) {
    for (let z = -1.5; z <= 7.2; z += 2.2) {
      const tile = box(2.02, 0.025, 2.02, tileColors[(Math.abs(x * 10 + z * 10) / 22) % tileColors.length | 0]);
      tile.position.set(x, 0.18, z);
      court.add(tile);
    }
  }
  for (let lane = -9; lane <= 9; lane += 3.6) {
    const marking = box(1.45, 0.018, 0.12, 0xf5dfa2);
    marking.position.set(lane, 0.17, 10.4);
    court.add(marking);
  }
  const shade = new THREE.Group();
  shade.add(
    box(8.6, 0.16, 0.18, 0x5f4a3d),
    box(0.12, 3.1, 0.12, 0x5f4a3d),
    box(0.12, 3.1, 0.12, 0x5f4a3d),
    box(8.6, 0.16, 0.18, 0x5f4a3d),
  );
  shade.children[0].position.set(0, 3.24, -1.9);
  shade.children[1].position.set(-4.15, 1.62, -1.9);
  shade.children[2].position.set(4.15, 1.62, -1.9);
  shade.children[3].position.set(0, 3.24, 1.9);
  const shadeCloth = new THREE.Mesh(
    new THREE.PlaneGeometry(8.3, 3.5),
    new THREE.MeshStandardMaterial({ color: 0xd9b464, roughness: 0.92, side: THREE.DoubleSide }),
  );
  shadeCloth.rotation.x = Math.PI / 2;
  shadeCloth.position.y = 3.18;
  shade.add(shadeCloth);
  court.add(shade);
  [-7.0, -2.3, 2.3, 7.0].forEach((x) => {
    const lantern = new THREE.Mesh(new THREE.OctahedronGeometry(0.22, 1), emissive(0xffb648, 1.7));
    lantern.position.set(x, 4.3, 1.5);
    court.add(lantern);
  });
  [-7.5, -3.8, 0, 3.8, 7.5].forEach((x, index) => {
    const tank = cylinder(0.58, 0.58, 0.68, 0x9eaaad, 18),
      lid = cylinder(0.42, 0.42, 0.08, 0x6f8087, 18);
    tank.position.set(x, 5.62 + (index % 2) * 0.08, -6.3);
    lid.position.set(x, tank.position.y + 0.38, -6.3);
    court.add(tank, lid);
  });
  const streetSign = textSprite("شارع الملك خالد · SUWAIKAT", "#ffeab0");
  streetSign.scale.set(4.8, 0.75, 1);
  streetSign.position.set(-8.6, 2.6, 10.1);
  streetSign.rotation.y = Math.PI;
  court.add(streetSign);
  for (let index = 0; index < 5; index++) {
    const pole = cylinder(0.045, 0.065, 2.45, 0x29363c, 10),
      bulb = sphere(0.16, 0xffd889, 12, 8);
    pole.position.set(-10.0 + index * 5.0, 1.23, 8.55);
    bulb.position.set(pole.position.x, 2.55, 8.55);
    bulb.material = emissive(0xffc96a, 1.35);
    court.add(pole, bulb);
  }
  const residentialBlock = (x, z, width, height, color) => {
    const block = new THREE.Group(),
      body = box(width, height, 3.4, color),
      roof = box(width + 0.18, 0.22, 3.62, 0x7b6651);
    body.position.y = height / 2;
    roof.position.y = height + 0.11;
    block.add(body, roof);
    addWindows(block, Math.max(3.5, width - 1), Math.max(2, Math.floor(height / 1.1)), 3.4, 1.0);
    const entrance = box(1.0, 1.55, 0.08, 0x4e6970);
    entrance.position.set(0, 0.78, 1.74);
    block.add(entrance);
    block.position.set(x, 0, z);
    court.add(block);
  };
  residentialBlock(-10.7, -11.2, 4.4, 8.8, 0xa99b88);
  residentialBlock(-4.4, -12.8, 5.0, 10.6, 0xb9a88e);
  residentialBlock(5.7, -12.4, 5.8, 9.5, 0x988b7f);
  residentialBlock(11.0, -10.8, 4.2, 7.8, 0xb8a68e);
  court.position.set(35, 0, 25);
  court.rotation.y = -0.08;
  registerCollider(35 - 7.2, 25 - 6.3, 7.8, 3.8, 0.28);
  registerCollider(35 + 1.2, 25 - 6.3, 7.6, 3.8, 0.28);
  registerCollider(35 + 8.4, 25 - 6.3, 5.8, 3.8, 0.28);
  registerCollider(35 - 10.7, 25 - 11.2, 4.4, 3.4, 0.28);
  registerCollider(35 - 4.4, 25 - 12.8, 5.0, 3.4, 0.28);
  registerCollider(35 + 5.7, 25 - 12.4, 5.8, 3.4, 0.28);
  registerCollider(35 + 11.0, 25 - 10.8, 4.2, 3.4, 0.28);
  scene.add(court);
}
function ambientActor(x, z, color, persona) {
  const actor = new THREE.Group(),
    skirt = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.42, 0.9, 12), mat(color)),
    body = cylinder(0.3, 0.35, 0.78, color, 12),
    head = sphere(0.27, persona.skin, 14, 10),
    hijab = new THREE.Mesh(
      new THREE.SphereGeometry(0.32, 18, 12, 0, Math.PI * 2, 0, Math.PI * 0.76),
      mat(persona.hijab),
    ),
    scarf = new THREE.Mesh(new THREE.ConeGeometry(0.31, 0.5, 14), mat(persona.hijab));
  skirt.position.y = 0.48;
  body.position.y = 1.22;
  head.position.y = 1.86;
  hijab.position.set(0, 1.96, -0.02);
  hijab.scale.set(1.02, 0.96, 1.02);
  scarf.position.set(0, 1.61, -0.06);
  actor.add(skirt, body, head, hijab, scarf);
  actor.position.set(x, 0, z);
  actor.scale.setScalar(persona.scale);
  actor.userData.origin = new THREE.Vector3(x, 0, z);
  actor.userData.phase = Math.random() * Math.PI * 2;
  actor.userData.persona = persona;
  scene.add(actor);
  ambientActors.push(actor);
}
function environment() {
  ground = new THREE.Mesh(
    new THREE.PlaneGeometry(160, 160),
    new THREE.MeshStandardMaterial({ color: 0x3f684f, roughness: 0.94, metalness: 0.02 }),
  );
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
  registerCollider(0, 1.5, 4.3, 4.3, 0.2);
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
    registerCollider(b.position.x, b.position.z, b.geometry.parameters.width, b.geometry.parameters.depth, 0.24);
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
  for (let i = 0; i < 64; i++) {
    const angle = (i / 64) * Math.PI * 2,
      radius = 11 + (i % 5) * 3.1,
      flower = sphere(0.1 + (i % 3) * 0.025, i % 3 === 0 ? 0xffd45c : i % 3 === 1 ? 0xff7799 : 0x7edcff, 10, 8),
      stem = cylinder(0.025, 0.035, 0.34, 0x3f985c, 7);
    flower.position.set(Math.cos(angle) * radius, 0.37, Math.sin(angle) * radius);
    stem.position.set(flower.position.x, 0.18, flower.position.z);
    scene.add(stem, flower);
  }
  stars();
  snowfall();
  cloud(-22, 20, -18, 2.4, 0.42);
  cloud(12, 24, -30, 3.1, 0.28);
  cloud(30, 18, 5, 2.0, 0.5);
  cafeNook();
  foodCourt();
  ambientActor(29.5, 25.5, 0x76564c, {
    name: "أم خالد",
    role: "الكبيرة الحنونة",
    skin: 0xb87958,
    hijab: 0xe4c98b,
    scale: 0.98,
    lines: [2, 6, 0],
    walks: true,
  });
  ambientActor(32.5, 22.5, 0x8d5e72, {
    name: "مريم",
    role: "من جيل عُلا",
    skin: 0xc98b69,
    hijab: 0x315f73,
    scale: 0.94,
    lines: [1, 3, 4, 8],
    walks: true,
  });
  ambientActor(36.5, 28.0, 0x6e8b59, {
    name: "نور",
    role: "شابة بالغة متدربة",
    skin: 0xd39a76,
    hijab: 0xb46a86,
    scale: 0.86,
    lines: [5, 7, 2],
    walks: true,
  });
  ambientActor(40.0, 22.8, 0x6d4e88, {
    name: "شيخة",
    role: "صاحبة سوالف وخبرة",
    skin: 0xbc7f5e,
    hijab: 0xd6b6d9,
    scale: 0.92,
    lines: [0, 6, 2],
    walks: true,
  });
  ambientActor(33.0, 29.2, 0x4b7690, {
    name: "دانة",
    role: "مهندسة من جيل عُلا",
    skin: 0xce9070,
    hijab: 0xe2b55d,
    scale: 0.91,
    lines: [4, 3, 8],
    walks: false,
  });
  ambientActor(39.0, 27.0, 0x92715b, {
    name: "جود",
    role: "شابة بالغة في بداية مسيرتها",
    skin: 0xd69b79,
    hijab: 0x6f8ea8,
    scale: 0.84,
    lines: [5, 7, 1],
    walks: false,
  });
  renderAmbientConversations();
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
  if (action === "coffee") {
    const cup = cylinder(0.22, 0.16, 0.34, 0xf7edda, 18),
      coffee = cylinder(0.17, 0.17, 0.018, 0x4b2412, 18);
    coffee.position.y = 0.18;
    prop.add(cup, coffee);
    for (let i = 0; i < 5; i++) {
      const steam = sphere(0.05 + i * 0.012, 0xffffff, 8, 6);
      steam.material.transparent = true;
      steam.material.opacity = 0.38 - i * 0.04;
      steam.position.set(Math.sin(i) * 0.05, 0.34 + i * 0.13, 0);
      prop.add(steam);
    }
  } else if (action.startsWith("food-")) {
    const plate = cylinder(0.46, 0.46, 0.07, 0xf4eee4, 22),
      foodColors = {
        "food-pizza": 0xe7ae43,
        "food-burger": 0x9d542d,
        "food-tameez": 0xd8a85c,
        "food-shaabiyat": 0xc77838,
        "food-karak": 0xb76b35,
      },
      serving = action === "food-karak"
        ? cylinder(0.18, 0.15, 0.36, foodColors[action], 18)
        : cylinder(0.31, 0.34, 0.2, foodColors[action], 18);
    serving.position.y = 0.14;
    prop.add(plate, serving);
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
    } else if (actor.userData.persona.walks) {
      actor.position.x = actor.userData.origin.x + Math.cos(phase) * 1.4;
      actor.position.z = actor.userData.origin.z + Math.sin(phase) * 0.8;
      actor.rotation.y = -phase + Math.PI / 2;
    } else {
      actor.position.x = actor.userData.origin.x;
      actor.position.z = actor.userData.origin.z;
      actor.lookAt(35, actor.position.y, 25);
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
      anchor = ola.position.clone().add(new THREE.Vector3(activeAction.action === "coffee" ? 0.72 : 0, activeAction.action === "rest" ? 1.15 : 3.0, 0.25));
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
  scene.fog = new THREE.Fog(0x84b7c7, 62, 125);
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
      matchMedia("(max-width:600px)").matches ? 1 : 1.25,
    ),
  );
  renderer.setSize(innerWidth, innerHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.28;
  renderer.shadowMap.enabled = matchMedia("(min-width:700px)").matches;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  skyLight = new THREE.HemisphereLight(0xd6f1ff, 0x62523d, 2.4);
  scene.add(skyLight);
  sunLight = new THREE.DirectionalLight(0xffe4aa, 3.8);
  sunLight.position.set(-16, 28, 13);
  sunLight.castShadow = renderer.shadowMap.enabled;
  sunLight.shadow.mapSize.set(1024, 1024);
  sunLight.shadow.camera.left = -35;
  sunLight.shadow.camera.right = 35;
  sunLight.shadow.camera.top = 35;
  sunLight.shadow.camera.bottom = -35;
  scene.add(sunLight);
  scene.add(new THREE.AmbientLight(0x9fcfff, 0.42));
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
  if (isBedtime(state.hour) && !state.nightSocial) setTimeout(openBedtimeGate, 0);
  if ("serviceWorker" in navigator)
     navigator.serviceWorker.register("./sw.js?release=20260901-v28", { updateViaCache: "none" }).catch(() => {});
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
  if (!requireAwake()) return;
  const model = projectMeshes.find((x) => x.userData.project.id === p.id);
  if (!model) return;
  guidedProject = p;
  nearest = p;
  walkTarget.copy(model.position).add(new THREE.Vector3(0, 0, 4.4));
  hasWalkTarget = true;
  walkBlockedFrames = 0;
  drawNavigationLine(walkTarget);
  model.userData.beacon.visible = true;
  $("#projectSheet").classList.remove("open");
  document.body.classList.remove("project-sheet-open");
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
  const hour = state.hour,
    daylight = hour < 5.5
      ? 0.3
      : hour < 7.5
        ? THREE.MathUtils.lerp(0.3, 0.88, (hour - 5.5) / 2)
        : hour < 16.5
          ? 1
          : hour < 19.5
            ? THREE.MathUtils.lerp(1, 0.5, (hour - 16.5) / 3)
            : hour < 21
              ? THREE.MathUtils.lerp(0.5, 0.3, (hour - 19.5) / 1.5)
              : 0.3,
    warmWeight = Math.max(0, 1 - Math.abs(hour - 18) / 2.8),
    dayColor = new THREE.Color(0x84c8df).lerp(new THREE.Color(0xf09a68), warmWeight * 0.42);
  const nightColor = new THREE.Color(0x173654);
  const sky = nightColor.clone().lerp(dayColor, daylight);
  scene.background.copy(sky);
  scene.fog.color.copy(sky);
  sunLight.intensity = 0.85 + daylight * 3.0;
  sunLight.color.copy(new THREE.Color(0xffe4aa).lerp(new THREE.Color(0xff8b57), warmWeight * 0.7));
  skyLight.intensity = 1.05 + daylight * 1.55;
  if (starField) starField.material.opacity = THREE.MathUtils.clamp((0.72 - daylight) * 2.2, 0, 0.95);
  cloudGroups.forEach((item) => {
    item.children.forEach((puff) => {
      if (puff.material) puff.material.opacity = 0.24 + daylight * 0.54;
    });
  });
}
function simulationPausedByUI() {
  return ["decisionSheet", "examSheet", "trophyModal", "guideModal", "bedtimeGate"]
    .some((id) => $("#" + id)?.classList.contains("hidden") === false);
}
let lastInterfaceRefreshAt = 0;
let lastLightingRefreshAt = 0;
function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock3d.getDelta(), 0.04);
  const frameNow = performance.now();
  const uiPaused = simulationPausedByUI();
  if (!gameFinished && !uiPaused && state.speed > 0) {
    state.hour += dt * state.speed * 0.2;
    if (state.hour >= 21) {
      state.hour = 21;
      openBedtimeGate();
    }
    state.energy = Math.max(0, state.energy - dt * state.speed * 0.03);
    state.focus = Math.max(0, state.focus - dt * state.speed * 0.025);
    state.patience = Math.max(0, state.patience - dt * state.speed * 0.018);
    state.social = Math.max(0, state.social - dt * state.speed * 0.012);
    state.fun = Math.max(0, state.fun - dt * state.speed * 0.015);
  }
  if (snowField) {
    const positions = snowField.geometry.attributes.position.array;
    for (let i = 0; i < positions.length; i += 3) {
      positions[i] += Math.sin(worldClock * 0.6 + i) * dt * 0.08;
      positions[i + 1] -= dt * (0.42 + (i % 9) * 0.018);
      if (positions[i + 1] < 0.2) positions[i + 1] = 31;
    }
    snowField.geometry.attributes.position.needsUpdate = true;
    snowField.rotation.y += dt * 0.002;
  }
  const forward = new THREE.Vector3(-Math.cos(camYaw), 0, -Math.sin(camYaw));
  const right = new THREE.Vector3(-forward.z, 0, forward.x);
  let dir = forward.multiplyScalar(move.y).add(right.multiplyScalar(move.x));
  if (uiPaused || (isBedtime(state.hour) && !state.nightSocial)) dir.set(0, 0, 0);
  let characterMoving = false;
  if (dir.lengthSq() > 0.01) {
    guidedProject = null;
    hasWalkTarget = false;
    clearNavigationLine();
    dir.normalize();
    const moved = moveOlaWithCollision(dir, dt * 5.5);
    ola.rotation.y = Math.atan2(dir.x, dir.z);
    characterMoving = moved;
    updateGoToPrompt();
  } else if (hasWalkTarget) {
    const d = walkTarget.clone().sub(ola.position);
    d.y = 0;
    if (d.length() < 0.28) {
      if (advanceFoodCourtRoute()) {
        // The next collision-safe segment is now active.
      } else if (guidedProject) {
        hasWalkTarget = false;
        const arrived = guidedProject;
        guidedProject = null;
        clearNavigationLine();
        openProject(arrived);
        updateGoToPrompt();
      } else if (nightFoodTravel) {
        arriveAtFoodCourt();
      }
    } else {
      d.normalize();
      const moved = moveOlaWithCollision(d, dt * (guidedProject || nightFoodTravel ? 12 : 4.6));
      walkBlockedFrames = moved ? 0 : walkBlockedFrames + 1;
      if (walkBlockedFrames > 24) {
        if (nightFoodTravel) {
          nightFoodReplans += 1;
          planFoodCourtRoute();
          toast(nightFoodReplans > 1 ? "Route adjusted around another building" : "Route adjusted around the building");
        } else {
          const detour = new THREE.Vector3(-d.z, 0, d.x).multiplyScalar((walkBlockedFrames % 2 ? 1 : -1) * 2.6);
          walkTarget.add(detour);
          walkBlockedFrames = 0;
          drawNavigationLine(walkTarget);
        }
      }
      ola.rotation.y = Math.atan2(d.x, d.z);
      characterMoving = moved;
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
  if (frameNow - lastLightingRefreshAt >= 100) {
    updateDayLight();
    lastLightingRefreshAt = frameNow;
  }
  cameraUpdate();
  if (frameNow - lastInterfaceRefreshAt >= 100) {
    positionAmbientConversations();
    updateHUD();
    lastInterfaceRefreshAt = frameNow;
  }
  renderer.render(scene, camera);
}
function bindWorldControls() {
  const c = $("#world3d");
  let last = null,
    touches = new Map(),
    pinch = 0;
  c.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    try {
      c.setPointerCapture?.(e.pointerId);
    } catch {
      // Document-level pointer handlers below keep the gesture alive.
    }
    touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
    last = { x: e.clientX, y: e.clientY, moved: false, button: e.button };
  });
  c.addEventListener("pointermove", (e) => {
    if (!touches.has(e.pointerId)) return;
    e.preventDefault();
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
  const finishCanvasPointer = (e, allowTap) => {
    if (!touches.has(e.pointerId)) return;
    touches.delete(e.pointerId);
    pinch = 0;
    if (allowTap && last && !last.moved && e.button === 0) {
      const bounds = c.getBoundingClientRect();
      const ndc = new THREE.Vector2(
        ((e.clientX - bounds.left) / bounds.width) * 2 - 1,
        -((e.clientY - bounds.top) / bounds.height) * 2 + 1,
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
        walkBlockedFrames = 0;
      }
    }
    if (!touches.size) last = null;
  };
  c.addEventListener("pointerup", (e) => finishCanvasPointer(e, true));
  c.addEventListener("pointercancel", (e) => finishCanvasPointer(e, false));
  c.addEventListener("lostpointercapture", (e) => finishCanvasPointer(e, false));
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
  function joyAt(clientX, clientY) {
    const r = jr.getBoundingClientRect(),
      x = clientX - (r.left + r.width / 2),
      y = clientY - (r.top + r.height / 2),
      m = Math.min(38, Math.hypot(x, y)),
      a = Math.atan2(y, x);
    const px = Math.cos(a) * m,
      py = Math.sin(a) * m;
    jk.style.transform = `translate(${px}px,${py}px)`;
    move.x = px / 38;
    move.y = -py / 38;
  }
  function resetJoystick() {
    jid = null;
    move.x = move.y = 0;
    jk.style.transform = "";
    jr.classList.remove("active");
  }
  function moveJoystickPointer(e) {
    if (e.pointerId !== jid) return;
    e.preventDefault();
    e.stopPropagation();
    joyAt(e.clientX, e.clientY);
  }
  function finishJoystickPointer(e) {
    if (e.pointerId !== jid) return;
    e.preventDefault();
    e.stopPropagation();
    resetJoystick();
  }
  jr.addEventListener("pointerdown", (e) => {
    if (jid !== null) return;
    e.preventDefault();
    e.stopPropagation();
    jid = e.pointerId;
    jr.classList.add("active");
    try {
      jr.setPointerCapture?.(jid);
    } catch {
      // The document listeners below support browsers with partial capture.
    }
    joyAt(e.clientX, e.clientY);
  });
  jr.addEventListener("pointermove", moveJoystickPointer);
  jr.addEventListener("pointerup", finishJoystickPointer);
  jr.addEventListener("pointercancel", finishJoystickPointer);
  jr.addEventListener("lostpointercapture", finishJoystickPointer);
  document.addEventListener("pointermove", moveJoystickPointer, { passive: false });
  document.addEventListener("pointerup", finishJoystickPointer, { passive: false });
  document.addEventListener("pointercancel", finishJoystickPointer, { passive: false });

  // Older touch engines do not expose PointerEvent. Keep the same continuous
  // movement contract instead of degrading the joystick to a tap-only control.
  if (!("PointerEvent" in window)) {
    let touchId = null;
    const findTouch = (list) => [...list].find((touch) => touch.identifier === touchId);
    jr.addEventListener("touchstart", (e) => {
      if (touchId !== null || !e.changedTouches.length) return;
      e.preventDefault();
      e.stopPropagation();
      const touch = e.changedTouches[0];
      touchId = touch.identifier;
      jr.classList.add("active");
      joyAt(touch.clientX, touch.clientY);
    }, { passive: false });
    document.addEventListener("touchmove", (e) => {
      const touch = findTouch(e.touches);
      if (!touch) return;
      e.preventDefault();
      joyAt(touch.clientX, touch.clientY);
    }, { passive: false });
    const finishTouch = (e) => {
      if (!findTouch(e.changedTouches)) return;
      e.preventDefault();
      touchId = null;
      resetJoystick();
    };
    document.addEventListener("touchend", finishTouch, { passive: false });
    document.addEventListener("touchcancel", finishTouch, { passive: false });
  }
  addEventListener("blur", resetJoystick);

  // Desktop keyboards use the same movement vector as the virtual joystick.
  const keys = new Set();
  const keyDirection = () => {
    if (jid !== null) return;
    const horizontal = (keys.has("ArrowRight") || keys.has("d") ? 1 : 0) -
      (keys.has("ArrowLeft") || keys.has("a") ? 1 : 0);
    const vertical = (keys.has("ArrowDown") || keys.has("s") ? 1 : 0) -
      (keys.has("ArrowUp") || keys.has("w") ? 1 : 0);
    move.x = horizontal;
    move.y = -vertical;
  };
  addEventListener("keydown", (e) => {
    if (!["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "w", "a", "s", "d"].includes(e.key)) return;
    if (["INPUT", "TEXTAREA", "SELECT"].includes(document.activeElement?.tagName)) return;
    keys.add(e.key);
    keyDirection();
    e.preventDefault();
  });
  addEventListener("keyup", (e) => {
    if (!keys.has(e.key)) return;
    keys.delete(e.key);
    keyDirection();
    e.preventDefault();
  });
  addEventListener("blur", () => {
    keys.clear();
    keyDirection();
  });
}

function openProject(p) {
  if (!requireAwake()) return;
  document.body.classList.add("project-sheet-open");
  $("#projectAlias").textContent = p.alias.toUpperCase();
  $("#projectName").textContent = p.name;
  $("#projectSource").textContent = p.source;
  $("#projectMetrics").innerHTML = Object.entries(p.metrics)
    .map(([k, v]) => `<div class="metric"><small>${escapeHtml(k)}</small><b>${escapeHtml(v)}</b></div>`)
    .join("");
  const done = state.resolved[p.id] || {};
  const controlledCount = p.missions.filter((_mission, index) => Boolean(done[index])).length;
  $("#projectProgress").innerHTML = `<b>${controlledCount}/${p.missions.length}</b> live management decisions controlled for this stage`;
  renderProjectTrajectory(p);
  $("#missionList").innerHTML = p.missions
    .map(
      (m, i) =>
        `<div class="mission ${done[i] ? "controlled" : ""}"><div class="dot ${escapeHtml(m[0])}"></div><div><b>${escapeHtml(m[1])}</b><br><small>${escapeHtml(m[0])} · ${done[i] ? "Controlled from this snapshot" : `Live question · ${escapeHtml(p.period)}`}</small></div><button data-mission="${i}">${done[i] ? "REVIEW ✓" : "GO TO →"}</button></div>`,
    )
    .join("");
  $("#projectSheet").classList.remove("compact");
  $("#projectSheet").classList.add("open");
  $("#collapseProject").textContent = "MINIMIZE −";
  $("#collapseProject").setAttribute("aria-expanded", "true");
  $$("[data-mission]").forEach(
    (b) => (b.onclick = () => openDecision(p, +b.dataset.mission)),
  );
}
function openDecision(p, i) {
  if (!requireAwake()) return;
  const m = p.missions[i],
    lesson = buildDecisionLesson(p, m);
  currentDecisionPractice = { project: p, missionIndex: i, lesson, correctPending: false };
  selectedDecisionConfidence = 2;
  $("#decisionStatus").textContent = m[0];
  $("#decisionTitle").textContent = m[1];
  $("#decisionReading").textContent = m[2];
  $("#decisionEvidence").textContent = m[6] || `${p.source}. ${m[3]}`;
  const hint = decisionHint(p, m),
    rotation = (i + p.id.length) % m[4].length,
    orderedOptions = m[4].map((option, originalIndex) => ({ option, originalIndex })).slice(rotation).concat(m[4].map((option, originalIndex) => ({ option, originalIndex })).slice(0, rotation));
  $("#decisionHint").textContent = hint;
  $("#decisionPrinciple").textContent = lesson.principle;
  $("#decisionFramework").innerHTML = lesson.steps
    .map((step) => `<article><small>${escapeHtml(step.label)}</small><p>${escapeHtml(step.text)}</p></article>`)
    .join("");
  $$('[data-confidence]').forEach((button) => {
    button.classList.toggle("selected", button.dataset.confidence === "2");
    button.onclick = () => {
      selectedDecisionConfidence = Number(button.dataset.confidence);
      $$('[data-confidence]').forEach((item) => item.classList.toggle("selected", item === button));
    };
  });
  $("#decisionFeedback").classList.add("hidden");
  $("#decisionReflection").classList.add("hidden");
  $("#decisionReflectionOptions").innerHTML = "";
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
    evaluation = evaluateDecisionChoice(mission, opt, selectedDecisionConfidence),
    lesson = currentDecisionPractice?.lesson || buildDecisionLesson(p, mission),
    attemptKey = `${p.id}:${i}`,
    buttons = $$('[data-opt]');
  const trajectory = applyProjectDecisionImpact(p, evaluation.correct);
  buttons.forEach((button) => {
    button.classList.remove("correct", "wrong");
    if (Number(button.dataset.opt) === opt) button.classList.add(evaluation.correct ? "correct" : "wrong");
  });
  $("#decisionFeedback").classList.remove("hidden");
  $("#decisionCalibration").textContent = `CONFIDENCE CHECK · ${evaluation.calibration.toUpperCase()}`;
  $("#decisionFeedbackTitle").textContent = evaluation.correct ? "The control choice is sound" : "This choice leaves exposure open";
  $("#decisionFeedbackReason").textContent = evaluation.reason;
  $("#decisionConsequence").textContent = evaluation.consequence;
  $("#decisionNextAction").textContent = evaluation.nextAction;
  $("#decisionTrajectory").textContent = `PROJECT PATH · ${trajectory.label} · ${Math.round(trajectory.momentum)}% momentum`;
  $("#decisionTrajectory").className = `decision-trajectory ${trajectory.tone}`;
  if (!evaluation.correct) {
    state.training = recordDecisionAttempt(state.training, {
      key: attemptKey,
      correct: false,
      confidence: selectedDecisionConfidence,
      day: state.day,
      reflected: false,
    });
    state.patience = Math.max(0, state.patience - 10);
    toast("Exposure identified · this item entered the review queue");
    showThought(decisionHint(p, mission), 0, true);
    visualReaction(p, false);
    save();
    updateHUD();
    return;
  }
  currentDecisionPractice = { project: p, missionIndex: i, lesson, correctPending: true };
  buttons.forEach((button) => (button.disabled = true));
  $("#decisionReflectionPrompt").textContent = lesson.reflectionPrompt;
  $("#decisionReflectionOptions").innerHTML = lesson.reflectionOptions
    .map((option, index) => `<button type="button" data-reflection-opt="${index}">${String.fromCharCode(65 + index)}. ${escapeHtml(option)}</button>`)
    .join("");
  $("#decisionReflection").classList.remove("hidden");
  $$('[data-reflection-opt]').forEach((button) => {
    button.onclick = () => completeDecisionReflection(p, i, Number(button.dataset.reflectionOpt));
  });
  toast("Choice controlled—now explain why it is safe");
  showThought("Good choice. Now prove the reasoning so the lesson transfers to the next project.", 0, true);
  save();
  updateHUD();
}

function completeDecisionReflection(p, i, selectedIndex) {
  const lesson = currentDecisionPractice?.lesson || buildDecisionLesson(p, p.missions[i]),
    buttons = $$('[data-reflection-opt]');
  buttons.forEach((button) => {
    button.classList.remove("correct", "wrong");
    if (Number(button.dataset.reflectionOpt) === selectedIndex) {
      button.classList.add(selectedIndex === lesson.correctReflectionIndex ? "correct" : "wrong");
    }
  });
  if (selectedIndex !== lesson.correctReflectionIndex) {
    const trajectory = applyProjectDecisionImpact(p, false, -3);
    state.patience = Math.max(0, state.patience - 2);
    $("#decisionFeedbackTitle").textContent = "The choice was right, but the reasoning is not protected yet";
    $("#decisionFeedbackReason").textContent = lesson.riskIfRushed;
    $("#decisionNextAction").textContent = "Try the reflection again: protect evidence, traceability, ownership, and the next check.";
    $("#decisionTrajectory").textContent = `PROJECT PATH · ${trajectory.label} · ${Math.round(trajectory.momentum)}% momentum`;
    $("#decisionTrajectory").className = `decision-trajectory ${trajectory.tone}`;
    showThought("A correct answer is not enough. Choose the reason that would still work when the numbers change.", 0, true);
    save();
    return;
  }
  buttons.forEach((button) => (button.disabled = true));
  state.training = recordDecisionAttempt(state.training, {
    key: `${p.id}:${i}`,
    correct: true,
    confidence: selectedDecisionConfidence,
    day: state.day,
    reflected: true,
  });
  state.resolved[p.id] ??= {};
  state.resolved[p.id][i] = true;
  state.patience = Math.min(100, state.patience + 4);
  state.fun = Math.min(100, state.fun + 3);
  const trajectory = trajectoryFor(p);
  $("#decisionFeedbackTitle").textContent = "Decision transferred into a reusable skill";
  $("#decisionFeedbackReason").textContent = lesson.principle;
  $("#decisionNextAction").textContent = "Reflection stored · +20 decision mastery XP";
  $("#decisionTrajectory").textContent = `PROJECT PATH · ${trajectory.label} · ${Math.round(trajectory.momentum)}% momentum`;
  $("#decisionTrajectory").className = `decision-trajectory ${trajectory.tone}`;
  visualReaction(p, true);
  save();
  updateHUD();
  toast("Decision mastered · reflection stored · +20 XP");
  showThought("Exactly. Evidence, ownership, and a next check—that is a decision you can reuse. ✦", 3600);
  setTimeout(() => {
    $("#decisionSheet").classList.add("hidden");
    document.body.classList.remove("modal-question-open");
    currentDecisionPractice = null;
    openProject(p);
    checkWin();
  }, 650);
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
  if (!requireAwake()) return;
  const p = nextOpenProject();
  if (p) goToProject(p);
  else {
    const checkpoint = nextCheckpointProject();
    if (checkpoint) openStageExam(checkpoint);
  }
};
$("#guideBtn").onclick = () => {
  if (!requireAwake()) return;
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
  currentDecisionPractice = null;
  hideThought();
};
$("#closeProject").onclick = () => {
  $("#projectSheet").classList.remove("open");
  document.body.classList.remove("project-sheet-open");
};
$("#collapseProject").onclick = () => {
  const sheet = $("#projectSheet"),
    compact = sheet.classList.toggle("compact"),
    button = $("#collapseProject");
  button.textContent = compact ? "MISSIONS +" : "MINIMIZE −";
  button.setAttribute("aria-expanded", String(!compact));
};
$("#interactBtn").onclick = () =>
  !requireAwake()
    ? null
    : nearest
    ? openProject(nearest)
    : nextOpenProject()
      ? goToProject(nextOpenProject())
      : toast("All required steps are controlled");

$("#menuBtn").onclick = () => $("#drawer").classList.add("open");
$("#closeDrawer").onclick = () => $("#drawer").classList.remove("open");
$$("[data-speed]").forEach(
  (b) =>
    (b.onclick = () => {
      if (+b.dataset.speed > 0 && !requireAwake()) return;
      state.speed = +b.dataset.speed;
      $$("[data-speed]").forEach((x) =>
        x.classList.toggle("selected", x === b),
      );
      save();
      toast(state.speed ? `Time speed set to ${state.speed}×` : "Time paused");
    }),
);
function runSimAction(action) {
  if (!requireAwake()) return;
  const result = applySimAction(state, action);
  state = result.state;
  updateHUD();
  save();
  playSimAction(action, result.line);
  $("#drawer").classList.remove("open");
  toast(`${action[0].toUpperCase()}${action.slice(1)} action complete ✓`);
}
function requireAwake() {
  if (!isBedtime(state.hour)) return true;
  if (state.nightSocial) {
    toast("Management is closed. Food and conversations only until sleep.");
    return false;
  }
  openBedtimeGate();
  toast("It is 21:00. Time to sleep.");
  return false;
}
function openBedtimeGate() {
  if (gameFinished) return;
  if (state.day >= 30) {
    finishGame(false);
    return;
  }
  state.hour = state.hour >= 21 ? 21 : state.hour;
  state.speed = 0;
  state.nightSocial = false;
  document.body.classList.remove("night-social-mode");
  $("#projectSheet").classList.remove("open");
  document.body.classList.remove("project-sheet-open");
  $("#drawer").classList.remove("open");
  $("#nightSocialDock").classList.add("hidden");
  $("#wellbeingPrompt")?.classList.add("hidden");
  $("#bedtimeGate").classList.remove("hidden");
  save();
  updateHUD();
}
function wakeToMorning() {
  state = sleepUntilMorning(state);
  $("#bedtimeGate").classList.add("hidden");
  $("#nightSocialDock").classList.add("hidden");
  document.body.classList.remove("night-social-mode");
  $$("[data-speed]").forEach((button) =>
    button.classList.toggle("selected", button.dataset.speed === "1"),
  );
  save();
  updateHUD();
  toast(`Good morning. Day ${state.day} begins at 06:00.`);
  showThought("Eng. Ola, new day, restored energy. Now choose the next controlled action.", 4800);
}
$("#sleepUntilMorning").onclick = wakeToMorning;
$("#nightSleepNow").onclick = wakeToMorning;
$("#goNightFoodCourt").onclick = () => {
  state.nightSocial = true;
  state.speed = 0;
  $("#bedtimeGate").classList.add("hidden");
  $("#projectSheet").classList.remove("open");
  document.body.classList.remove("project-sheet-open");
  $("#nightSocialDock").classList.remove("hidden");
  document.body.classList.add("night-social-mode");
  guidedProject = null;
  nightFoodTravel = true;
  nightFoodReplans = 0;
  planFoodCourtRoute();
  clearTimeout(nightFoodFallbackTimer);
  nightFoodFallbackTimer = setTimeout(() => {
    if (nightFoodTravel) arriveAtFoodCourt({ cinematic: true });
  }, 6500);
  $("#drawer").classList.remove("open");
  save();
  updateHUD();
  showThought("Eng. Ola, the Food Court is open. Tonight is for food, warm conversation, and rest—not management fields.", 6000);
  toast("GO TO FOOD COURT · night social mode");
};
$("#coffeeBtn").onclick = () => runSimAction("coffee");
$("#restBtn").onclick = () => runSimAction("rest");
$("#teamBtn").onclick = () => runSimAction("team");
$("#siteBtn").onclick = () => runSimAction("site");
function runFoodAction(food) {
  if (!isBedtime(state.hour)) {
    runSimAction(`food-${food}`);
    return;
  }
  if (!state.nightSocial) {
    openBedtimeGate();
    return;
  }
  const result = applySimAction(state, `food-${food}`);
  state = result.state;
  state.hour = 21;
  state.speed = 0;
  state.nightSocial = true;
  updateHUD();
  save();
  const nightLines = {
    pizza: "Pizza, snowfall, and a quiet night at the Food Court. 🍕",
    burger: "A warm burger break while the city slows down. 🍔",
    tameez: "تميس دافئ وسوالف هادية قبل النوم. 🫓",
    shaabiyat: "The Food Court brought everyone together for a warm meal before sleep. 🍲",
    karak: "شاي كرك دافئ، سوالف بحرينية، وليلة أهدى. 🫖",
  };
  playSimAction(`food-${food}`, nightLines[food] || result.line);
}
$$('[data-food]').forEach((button) => {
  button.onclick = () => runFoodAction(button.dataset.food);
});
$("#waterBtn").onclick = drinkWater;
$("#wellbeingPrompt").onclick = drinkWater;
$("#quoteNext").onclick = () => {
  wellbeingIndex = (wellbeingIndex + 1) % WELLBEING_WORDS.length;
  renderWellbeingQuote();
};
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
        : Math.min(devicePixelRatio, quality === "high" ? 1.75 : 1.25),
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
  document.body.classList.remove("project-sheet-open");
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
    finishGame(true);
  } else updateGoToPrompt();
}
function finishGame(won) {
  if (gameFinished) return;
  gameFinished = true;
  gameOutcome = won ? "success" : "failure";
  state.speed = 0;
  $("#labibResult").textContent = won ? "Congrats from Labib" : "Hard Luck from Labib";
  save();
  if (won) {
    setTimeout(() => show("success"), 700);
    return;
  }
  show("blackout");
  $("#blackLine").textContent =
    "The 30-day management window closed before every live decision and checkpoint was controlled. Review the evidence, recover the exposed stages, and rise again.";
  $("#restartStory").classList.remove("hidden");
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
    $("#labibResult").textContent = gameOutcome === "success" ? "Congrats from Labib" : "Hard Luck from Labib";
    $("#blackLine").textContent =
      "وخليها معاكي… عشان لو احتجناكي تاني.\n\nبس المرة الجاية مفيش الست مساعدات دول… يمكن اتنين. عشان خاطرك.";
    setTimeout(() => $("#restartStory").classList.remove("hidden"), 2500);
  }
};
$("#restartStory").onclick = () => {
  localStorage.removeItem("ola3d-v3");
  localStorage.removeItem(stateStorageKey);
  location.reload();
};

setupMusic();
renderWellbeingQuote();
updateHUD();
startGameDirectly();
