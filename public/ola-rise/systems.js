export const NEED_KEYS = ["energy", "focus", "patience", "social", "fun"];

const clampNeed = (value) => Math.max(0, Math.min(100, Number(value) || 0));

export function timePhaseFor(hour) {
  const normalizedHour = ((Number(hour) || 0) % 24 + 24) % 24;
  if (normalizedHour >= 6 && normalizedHour < 12) return { id: "morning", label: "Morning" };
  if (normalizedHour >= 12 && normalizedHour < 17) return { id: "afternoon", label: "Afternoon" };
  if (normalizedHour >= 17 && normalizedHour < 21) return { id: "evening", label: "Evening" };
  return { id: "night", label: "Night" };
}

export function isBedtime(hour) {
  return timePhaseFor(hour).id === "night";
}

export function sleepUntilMorning(current) {
  const state = normalizeGameState(current);
  if (state.hour >= 21) state.day = Math.min(30, state.day + 1);
  state.hour = 6;
  state.speed = 1;
  state.energy = 100;
  state.focus = Math.max(78, state.focus);
  state.patience = Math.max(76, state.patience);
  state.fun = Math.max(68, state.fun);
  state.nightSocial = false;
  return state;
}

export function normalizeGameState(saved = {}) {
  return {
    day: Math.max(1, Math.min(30, Number(saved.day) || 1)),
    hour: Number.isFinite(Number(saved.hour)) ? Number(saved.hour) : 8,
    energy: clampNeed(saved.energy ?? 100),
    focus: clampNeed(saved.focus ?? 100),
    patience: clampNeed(saved.patience ?? 100),
    social: clampNeed(saved.social ?? 82),
    fun: clampNeed(saved.fun ?? 76),
    help: Math.max(0, Number(saved.help ?? 4)),
    bonus: Boolean(saved.bonus),
    speed: [0, 1, 2, 4].includes(Number(saved.speed)) ? Number(saved.speed) : 1,
    resolved: saved.resolved && typeof saved.resolved === "object" ? saved.resolved : {},
    trophies: saved.trophies && typeof saved.trophies === "object" ? saved.trophies : {},
    examAttempts:
      saved.examAttempts && typeof saved.examAttempts === "object"
        ? saved.examAttempts
        : {},
    coffeeServed: Math.max(0, Number(saved.coffeeServed ?? saved.teaServed) || 0),
    mealsServed: Math.max(0, Number(saved.mealsServed) || 0),
    nightSocial: Boolean(saved.nightSocial),
    started: Boolean(saved.started),
  };
}

function advanceClock(state, hours) {
  state.hour += hours;
  while (state.hour >= 24) {
    state.hour -= 24;
    state.day = Math.min(30, state.day + 1);
  }
}

export function applySimAction(current, action) {
  const state = normalizeGameState(current);
  const reactions = {
    coffee: {
      line: "Coffee first. Then we can explain why the forecast is feeling dramatic. ☕",
      changes: { energy: 22, patience: 12, fun: 14 },
      hours: 0.25,
    },
    rest: {
      line: "Six hours later: same projects, significantly better judgment. Zzz…",
      changes: { energy: 50, patience: 20, focus: 8 },
      hours: 6,
    },
    team: {
      line: "Team huddle complete. Everyone now owns an action—not just an opinion.",
      changes: { focus: 20, patience: 8, social: 28, fun: 10 },
      hours: 1,
    },
    site: {
      line: "Site walk complete. The spreadsheet has now met reality.",
      changes: { focus: 12, energy: -8, fun: 5 },
      hours: 1.5,
    },
    "food-pizza": {
      line: "Pizza break complete. Energy restored; decisions remain evidence first. 🍕",
      changes: { energy: 16, patience: 5, fun: 16 },
      hours: 0.5,
    },
    "food-burger": {
      line: "Burger break complete. Back to the project with a better battery. 🍔",
      changes: { energy: 18, patience: 4, fun: 13 },
      hours: 0.5,
    },
    "food-tameez": {
      line: "تميس دافئ، نفس أهدى، والخطوة الجاية أوضح. 🫓",
      changes: { energy: 14, patience: 8, social: 4 },
      hours: 0.4,
    },
    "food-shaabiyat": {
      line: "شعبيات shared with the team. Morale and connection are back up. 🍲",
      changes: { energy: 16, social: 10, fun: 10 },
      hours: 0.6,
    },
    "food-karak": {
      line: "شاي كرك: a warm pause before the next controlled decision. 🫖",
      changes: { energy: 12, patience: 10, social: 8 },
      hours: 0.25,
    },
  };
  const reaction = reactions[action];
  if (!reaction) throw new Error(`Unknown Sims action: ${action}`);
  Object.entries(reaction.changes).forEach(([key, delta]) => {
    state[key] = clampNeed(state[key] + delta);
  });
  if (action === "coffee") state.coffeeServed += 1;
  if (action.startsWith("food-")) state.mealsServed += 1;
  advanceClock(state, reaction.hours);
  return { state, line: reaction.line };
}

export function moodFor(state) {
  const values = NEED_KEYS.map((key) => clampNeed(state[key]));
  const average = values.reduce((sum, value) => sum + value, 0) / values.length;
  const minimum = Math.min(...values);
  if (minimum < 20) return { label: "Emergency coffee meeting", tone: "critical" };
  if (minimum < 40 || average < 52) return { label: "Running on spreadsheets", tone: "caution" };
  if (average >= 82) return { label: "Peak Eng. Ola", tone: "excellent" };
  return { label: "Focused & formidable", tone: "good" };
}

export function decisionHint(project, mission) {
  const source = project?.source ? ` Evidence comes from ${project.source}.` : "";
  return `Eng. Ola, think about: ${mission[2]} Hint: ${mission[3]}${source}`;
}

export function requiredMissionIndexes(project) {
  return project.missions
    .map((mission, index) => ({ mission, index }))
    .filter(({ mission }) => Array.isArray(mission) && mission.length >= 5)
    .map(({ index }) => index);
}

export function projectIsControlled(project, resolved = {}) {
  const required = requiredMissionIndexes(project);
  return required.length > 0 && required.every((index) => Boolean(resolved[index]));
}

function stableRotation(projectId, missionIndex, optionCount) {
  const seed = [...String(projectId)].reduce(
    (sum, character) => sum + character.charCodeAt(0),
    missionIndex * 7,
  );
  return optionCount ? seed % optionCount : 0;
}

export function buildStageExam(project, count = 3) {
  return requiredMissionIndexes(project)
    .slice(0, count)
    .map((missionIndex) => {
      const mission = project.missions[missionIndex];
      const correctOriginalIndex = Number.isInteger(mission[5]) ? mission[5] : 0;
      const rotation = stableRotation(project.id, missionIndex, mission[4].length);
      const options = mission[4].map((option, originalIndex) => ({
        option,
        originalIndex,
      }));
      const rotated = options.slice(rotation).concat(options.slice(0, rotation));
      return {
        missionIndex,
        title: mission[1],
        prompt: `Which action keeps ${mission[1]} under management control?`,
        evidence: mission[2],
        hint: decisionHint(project, mission),
        options: rotated.map(({ option }) => option),
        correctIndex: rotated.findIndex(
          ({ originalIndex }) => originalIndex === correctOriginalIndex,
        ),
      };
    });
}

export function trophySummary(projects, trophies = {}) {
  const earned = projects.filter((project) => Boolean(trophies[project.id])).length;
  return { earned, total: projects.length };
}
