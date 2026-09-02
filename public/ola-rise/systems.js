export const NEED_KEYS = ["energy", "focus", "patience", "social", "fun"];

export const PROJECT_HEALTH_RULES = Object.freeze({
  failure: 35,
  rising: 65,
  thriving: 80,
  decisionCorrect: 8,
  decisionWrong: -10,
  reflectionCorrect: 3,
  reflectionWrong: -3,
  examCorrect: 2,
  examWrong: -2,
});

export function projectHealthState(value) {
  const momentum = Math.max(0, Math.min(100, Number(value) || 0));
  if (momentum <= PROJECT_HEALTH_RULES.failure) {
    return { momentum, label: "FAILED", tone: "failing", terminal: true };
  }
  if (momentum < 50) {
    return { momentum, label: "OUT OF TRACK", tone: "risk", terminal: false };
  }
  if (momentum < PROJECT_HEALTH_RULES.rising) {
    return { momentum, label: "ON TRACK", tone: "steady", terminal: false };
  }
  if (momentum < PROJECT_HEALTH_RULES.thriving) {
    return { momentum, label: "RISING", tone: "rising", terminal: false };
  }
  return { momentum, label: "THRIVING", tone: "thriving", terminal: false };
}

export function applyProjectHealthImpact(value, delta) {
  const before = Math.max(0, Math.min(100, Number(value) || 0));
  const appliedDelta = Number(delta) || 0;
  const after = Math.max(0, Math.min(100, before + appliedDelta));
  return { before, after, delta: after - before, state: projectHealthState(after) };
}

const clampNeed = (value) => Math.max(0, Math.min(100, Number(value) || 0));

const DECISION_FAMILIES = [
  {
    id: "cost-performance",
    match: /cpi|cost performance|earned value|cost variance/,
    principle: "Separate the performance signal from the reaction: verify EV and AC scope, diagnose the driver, then assign a controlled recovery action.",
    consequence: "Acting without isolating the cost driver can spend recovery effort in the wrong place and leave the exposure open.",
    protect: "Name an owner, evidence source, review date, and measurable recovery check.",
  },
  {
    id: "forecast",
    match: /forecast|vac|etc|eac|overrun/,
    principle: "A forecast is a forward decision, not a copied historical total. Validate remaining quantities, rates, commitments, and uncertainty before escalation.",
    consequence: "An untested forecast can hide a future overrun or trigger unnecessary intervention.",
    protect: "Record the forecast assumption, owner, next update, and trigger that would change the decision.",
  },
  {
    id: "cashflow",
    match: /cash|collection|payment|liquidity/,
    principle: "Profit and cash are different controls. Match the timing of receipts, payments, retention, and funding before choosing an action.",
    consequence: "A profitable project can still become unable to fund its next obligations when timing is ignored.",
    protect: "Connect each recovery action to a dated receipt, payment, or financing milestone.",
  },
  {
    id: "profitability",
    match: /profit|margin|revenue/,
    principle: "Positive profit is not automatically healthy. Compare the method, scope, target margin, remaining exposure, and confidence before calling it favorable.",
    consequence: "Protecting a headline instead of its assumptions can allow margin erosion to continue unseen.",
    protect: "Preserve every source method, validate the margin basis, and watch the remaining cost-to-complete.",
  },
  {
    id: "reconciliation",
    match: /reconcil|accounting|ledger|reported cost|classification/,
    principle: "Different accounting and cost-control scopes must be preserved and reconciled; neither should silently overwrite the other.",
    consequence: "Overwriting one valid scope destroys traceability and can create a false management conclusion.",
    protect: "Reconcile source, timing, classification, and approved reallocations with an auditable bridge.",
  },
  {
    id: "concentration",
    match: /concentration|driver|dominant|resource/,
    principle: "Concentration is exposure, not automatic failure. Verify the leading driver, dependency, substitute options, and threshold before escalation.",
    consequence: "Ignoring a dominant driver can make one disruption control the whole outcome.",
    protect: "Assign a specific watch trigger and contingency to the verified leading driver.",
  },
  {
    id: "waste",
    match: /waste|material|efficiency/,
    principle: "Waste requires a verified quantity and budget basis. Diagnose the material, process, location, and responsible control before mitigation.",
    consequence: "A generic waste instruction may reduce reporting without reducing physical loss.",
    protect: "Track the measured source quantity, corrective action, owner, and next physical verification.",
  },
  {
    id: "data-quality",
    match: /data|evidence|quality|unable|source|assurance/,
    principle: "When evidence is missing or conflicting, the controlled decision is to close the evidence gap—not to invent certainty.",
    consequence: "A confident answer built on weak evidence is more dangerous than an explicit unable-to-assess result.",
    protect: "State what is missing, who must provide it, and which decision remains blocked until validation.",
  },
];

const DEFAULT_DECISION_FAMILY = {
  id: "management-control",
  principle: "Use verified evidence, compare realistic alternatives, choose an owner-led action, and define how the decision will be checked.",
  consequence: "A choice without evidence, ownership, or a review trigger becomes an opinion rather than a controlled decision.",
  protect: "Record the owner, deadline, evidence basis, and next review trigger.",
};

function decisionFamilyFor(mission) {
  const searchable = `${mission?.[0] || ""} ${mission?.[1] || ""} ${mission?.[2] || ""}`.toLowerCase();
  return DECISION_FAMILIES.find((family) => family.match.test(searchable)) || DEFAULT_DECISION_FAMILY;
}

export function normalizeTrainingState(saved = {}) {
  const attempts = {};
  if (saved.attempts && typeof saved.attempts === "object") {
    Object.entries(saved.attempts).forEach(([key, history]) => {
      attempts[key] = Array.isArray(history) ? history.slice(-20).map((entry) => ({
        correct: Boolean(entry?.correct),
        confidence: Math.max(1, Math.min(3, Number(entry?.confidence) || 1)),
        day: Math.max(1, Number(entry?.day) || 1),
        reflected: Boolean(entry?.reflected),
      })) : [];
    });
  }
  return {
    attempts,
    xp: Math.max(0, Number(saved.xp) || 0),
    reflections: Math.max(0, Number(saved.reflections) || 0),
    lifeCompleted: Math.max(0, Number(saved.lifeCompleted) || 0),
    streak: Math.max(0, Number(saved.streak) || 0),
    bestStreak: Math.max(0, Number(saved.bestStreak) || 0),
    reviewQueue: saved.reviewQueue && typeof saved.reviewQueue === "object" ? { ...saved.reviewQueue } : {},
  };
}

export function buildDecisionLesson(project, mission) {
  const family = decisionFamilyFor(mission);
  const evidence = mission?.[6] || project?.source || "Only the visible controlled source evidence.";
  const period = project?.period ? ` Reporting period: ${project.period}.` : "";
  return {
    family: family.id,
    principle: family.principle,
    sourceBasis: `${evidence}${period}`,
    steps: [
      { id: "observe", label: "1 · Observe", text: `Read the signal without changing it: ${mission?.[2] || "No verified reading is available."}` },
      { id: "diagnose", label: "2 · Diagnose", text: "Separate fact, assumption, scope, timing, and the driver that management can actually influence." },
      { id: "decide", label: "3 · Decide", text: `Choose the action that best protects control: ${mission?.[3] || "Resolve the evidence gap before acting."}` },
      { id: "protect", label: "4 · Protect", text: family.protect },
    ],
    riskIfRushed: family.consequence,
    reflectionPrompt: `Why is the controlled response for ${mission?.[1] || "this issue"} stronger than the tempting alternatives?`,
    reflectionOptions: [
      "It follows the available evidence, preserves traceability, and defines the next control.",
      "It is the fastest option, so evidence and ownership are unnecessary.",
      "It makes the adverse signal disappear from the next report.",
    ],
    correctReflectionIndex: 0,
  };
}

export function evaluateDecisionChoice(mission, selectedIndex) {
  const correctIndex = Number.isInteger(mission?.[5]) ? mission[5] : 0;
  const correct = Number(selectedIndex) === correctIndex;
  const family = decisionFamilyFor(mission);
  return {
    correct,
    requiresReflection: correct,
    selectedIndex: Number(selectedIndex),
    correctIndex,
    reason: correct
      ? `This is controlled because it follows the available evidence and protects the next management control: ${mission?.[3] || mission?.[4]?.[correctIndex] || "validate before acting"}.`
      : `This choice does not resolve the verified condition. Re-read the evidence and test it against the required control: ${mission?.[3] || "validate before acting"}.`,
    consequence: correct
      ? `Benefit: the action keeps the decision traceable and creates a checkable next step. ${family.protect}`
      : `Risk: ${family.consequence}`,
    nextAction: correct
      ? "Explain why this control remains safe when the project changes."
      : "The decision is final. Learn the control principle, then protect the next project decision.",
  };
}

export function recordDecisionAttempt(current, event) {
  const training = normalizeTrainingState(current);
  const key = String(event?.key || "decision");
  const record = {
    correct: Boolean(event?.correct),
    confidence: Math.max(1, Math.min(3, Number(event?.confidence) || 2)),
    day: Math.max(1, Number(event?.day) || 1),
    reflected: Boolean(event?.reflected),
  };
  training.attempts[key] = [...(training.attempts[key] || []), record].slice(-20);
  if (record.correct) {
    training.streak += 1;
    training.bestStreak = Math.max(training.bestStreak, training.streak);
    training.xp += record.reflected ? 20 : 12;
    if (record.reflected) training.reflections += 1;
    if (Number(training.reviewQueue[key]?.dueDay) <= record.day) {
      delete training.reviewQueue[key];
    }
  }
  else {
    training.streak = 0;
    training.xp += 2;
    training.reviewQueue[key] = { dueDay: record.day + 1, reason: "Retry after reviewing the evidence and decision framework." };
  }
  return training;
}

export function trainingSummary(current, day = 1) {
  const training = normalizeTrainingState(current);
  const history = Object.values(training.attempts).flat();
  const correct = history.filter((attempt) => attempt.correct).length;
  return {
    attempts: history.length,
    correct,
    accuracy: history.length ? Math.round((correct / history.length) * 100) : 0,
    reflections: training.reflections,
    reviewDue: Object.keys(training.reviewQueue).length,
    dueNow: Object.values(training.reviewQueue).filter((item) => Number(item?.dueDay) <= Number(day)).length,
    xp: training.xp,
    streak: training.streak,
    bestStreak: training.bestStreak,
    lifeCompleted: training.lifeCompleted,
  };
}

export function buildLifePractice(current) {
  const state = normalizeGameState(current);
  if (isBedtime(state.hour)) {
    return {
      id: "bedtime-boundary",
      situation: "It is after 21:00. Work is closed and tomorrow still needs good judgment.",
      prompt: "What protects Ola's next decision best?",
      principle: "A clear boundary is a management decision: stop, recover, and return with capacity.",
      correctAction: "sleep",
      options: [
        { action: "sleep", label: "Sleep until 06:00", feedback: "Sleep protects tomorrow's attention and judgment." },
        { action: "coffee", label: "Add coffee and keep working", feedback: "Stimulation does not replace recovery or the 21:00 boundary." },
        { action: "site", label: "Start a late site walk", feedback: "A new task after the boundary adds fatigue without improving the evidence." },
      ],
    };
  }
  if (state.energy <= 35) {
    return {
      id: "energy-recovery",
      situation: `Energy is ${Math.round(state.energy)}. Ola is tired enough for decision quality to deteriorate.`,
      prompt: "Choose the response that protects judgment, not just activity.",
      principle: "When capacity is the constraint, recover before adding complexity.",
      correctAction: "rest",
      options: [
        { action: "rest", label: "Rest before the next decision", feedback: "Recovery addresses the actual constraint and protects judgment." },
        { action: "coffee", label: "Use coffee as the whole recovery plan", feedback: "Coffee can support a break, but it cannot replace needed rest." },
        { action: "site", label: "Force a site walk immediately", feedback: "More demand while depleted increases avoidable error exposure." },
      ],
    };
  }
  if (state.focus <= 40 || state.patience <= 35) {
    return {
      id: "reset-before-reacting",
      situation: `Focus is ${Math.round(state.focus)} and patience is ${Math.round(state.patience)}. A reactive choice is becoming more likely.`,
      prompt: "What is the smallest useful reset before deciding?",
      principle: "Pause before reacting; a small physical reset can reopen deliberate attention.",
      correctAction: "water",
      options: [
        { action: "water", label: "Drink water and restate the decision", feedback: "A brief reset creates space to inspect the evidence deliberately." },
        { action: "site", label: "Add another information-heavy task", feedback: "More input is not useful until attention is ready to process it." },
        { action: "coffee", label: "Decide immediately while stimulated", feedback: "Urgency and stimulation do not replace a deliberate evidence check." },
      ],
    };
  }
  if (state.social <= 40) {
    return {
      id: "ask-before-assuming",
      situation: `Social connection is ${Math.round(state.social)}. The decision may be missing operational knowledge held by the team.`,
      prompt: "How should Ola close the human-information gap?",
      principle: "Ask the people closest to the work before turning an assumption into a decision.",
      correctAction: "team",
      options: [
        { action: "team", label: "Call a focused team huddle", feedback: "A focused huddle adds ownership and operational evidence." },
        { action: "coffee", label: "Work alone with another coffee", feedback: "Personal energy cannot replace missing team knowledge." },
        { action: "rest", label: "Delay without naming the information gap", feedback: "Delay alone does not identify the missing owner or evidence." },
      ],
    };
  }
  return {
    id: "evidence-before-opinion",
    situation: "Ola's needs are stable and there is capacity for one deliberate management action.",
    prompt: "Which action best connects the report to operational reality?",
    principle: "Use available capacity to verify the highest-value unknown before committing.",
    correctAction: "site",
    options: [
      { action: "site", label: "Walk the live site with one evidence question", feedback: "The site walk tests the report against operational reality." },
      { action: "coffee", label: "Add coffee without a decision purpose", feedback: "An action is not useful merely because it is easy to start." },
      { action: "rest", label: "Rest despite full decision capacity", feedback: "Recovery is valuable when needed; here it avoids the useful evidence check." },
    ],
  };
}

export function evaluateLifePractice(challenge, selectedAction) {
  const option = challenge?.options?.find((item) => item.action === selectedAction);
  const correct = selectedAction === challenge?.correctAction;
  return {
    correct,
    feedback: option?.feedback || (correct ? "That response protects deliberate judgment." : "Recheck the actual constraint before acting."),
    principle: challenge?.principle || "Match the action to the real constraint.",
  };
}

export function findCollisionSafeRoute(start, goal, isBlocked, options = {}) {
  const step = Math.max(0.75, Number(options.step) || 1.5),
    limit = Math.max(12, Number(options.limit) || 72),
    keyFor = (x, z) => `${x},${z}`,
    toWorld = (index) => -limit + index * step,
    toIndex = (value) => Math.round((value + limit) / step),
    maxIndex = Math.round((limit * 2) / step),
    startNode = { x: toIndex(start.x), z: toIndex(start.z) },
    goalNode = { x: toIndex(goal.x), z: toIndex(goal.z) },
    distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z),
    open = [startNode],
    openKeys = new Set([keyFor(startNode.x, startNode.z)]),
    closed = new Set(),
    parent = new Map(),
    score = new Map([[keyFor(startNode.x, startNode.z), 0]]),
    directions = [
      [1, 0], [-1, 0], [0, 1], [0, -1],
      [1, 1], [1, -1], [-1, 1], [-1, -1],
    ];
  let reached = null,
    iterations = 0;
  while (open.length && iterations++ < 18000) {
    open.sort((a, b) => {
      const ak = keyFor(a.x, a.z), bk = keyFor(b.x, b.z);
      return (score.get(ak) + distance(a, goalNode)) - (score.get(bk) + distance(b, goalNode));
    });
    const current = open.shift(),
      currentKey = keyFor(current.x, current.z);
    openKeys.delete(currentKey);
    if (distance(current, goalNode) <= 1.1) {
      reached = current;
      break;
    }
    closed.add(currentKey);
    for (const [dx, dz] of directions) {
      const next = { x: current.x + dx, z: current.z + dz },
        nextKey = keyFor(next.x, next.z);
      if (next.x < 0 || next.z < 0 || next.x > maxIndex || next.z > maxIndex || closed.has(nextKey)) continue;
      const wx = toWorld(next.x), wz = toWorld(next.z);
      if (isBlocked(wx, wz)) continue;
      if (dx && dz && (isBlocked(toWorld(current.x + dx), toWorld(current.z)) || isBlocked(toWorld(current.x), toWorld(current.z + dz)))) continue;
      const tentative = (score.get(currentKey) ?? Infinity) + Math.hypot(dx, dz);
      if (tentative >= (score.get(nextKey) ?? Infinity)) continue;
      parent.set(nextKey, current);
      score.set(nextKey, tentative);
      if (!openKeys.has(nextKey)) {
        open.push(next);
        openKeys.add(nextKey);
      }
    }
  }
  if (!reached) return [{ x: goal.x, z: goal.z }];
  const reversed = [];
  let cursor = reached;
  while (cursor && keyFor(cursor.x, cursor.z) !== keyFor(startNode.x, startNode.z)) {
    reversed.push({ x: toWorld(cursor.x), z: toWorld(cursor.z) });
    cursor = parent.get(keyFor(cursor.x, cursor.z));
  }
  const route = reversed.reverse(),
    simplified = [];
  route.forEach((point, index) => {
    const previous = route[index - 1], next = route[index + 1];
    if (!previous || !next) simplified.push(point);
    else {
      const before = { x: Math.sign(point.x - previous.x), z: Math.sign(point.z - previous.z) },
        after = { x: Math.sign(next.x - point.x), z: Math.sign(next.z - point.z) };
      if (before.x !== after.x || before.z !== after.z) simplified.push(point);
    }
  });
  simplified.push({ x: goal.x, z: goal.z });
  return simplified;
}

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
  const projectMomentum = {};
  if (saved.projectMomentum && typeof saved.projectMomentum === "object") {
    Object.entries(saved.projectMomentum).forEach(([projectId, value]) => {
      const numeric = Number(value);
      if (Number.isFinite(numeric)) projectMomentum[projectId] = Math.max(0, Math.min(100, numeric));
    });
  }
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
    projectMomentum,
    decisionOutcomes:
      saved.decisionOutcomes && typeof saved.decisionOutcomes === "object"
        ? saved.decisionOutcomes
        : {},
    failedProjects:
      saved.failedProjects && typeof saved.failedProjects === "object"
        ? saved.failedProjects
        : {},
    lastDecisionOutcome:
      saved.lastDecisionOutcome && typeof saved.lastDecisionOutcome === "object"
        ? saved.lastDecisionOutcome
        : null,
    gameRulesVersion: Math.max(1, Number(saved.gameRulesVersion) || 1),
    trophies: saved.trophies && typeof saved.trophies === "object" ? saved.trophies : {},
    examAttempts:
      saved.examAttempts && typeof saved.examAttempts === "object"
        ? saved.examAttempts
        : {},
    stageExamResults:
      saved.stageExamResults && typeof saved.stageExamResults === "object"
        ? saved.stageExamResults
        : {},
    training: normalizeTrainingState(saved.training),
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
    water: {
      line: "Water, one slow breath, then restate the decision before reacting. 💧",
      changes: { focus: 8, patience: 10, energy: 3 },
      hours: 0.1,
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
