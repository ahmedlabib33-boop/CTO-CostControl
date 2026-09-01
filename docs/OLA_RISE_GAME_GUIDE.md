# OLA: RISE

## Memory. Decisions. Projects. Destiny.

OLA: RISE is a live management decision game set inside a navigable 3D world. The player takes the role of Eng. Ola and moves between active project stages, reads the available evidence, chooses management responses, explains the reasoning behind each choice, and completes a checkpoint exam before a stage is considered controlled.

The game is designed to strengthen practical judgment. It does not reward fast clicking or memorized answers alone. A strong result requires the player to read the current condition, separate fact from assumption, select the most controlled response, and show why that response remains valid when the figures change.

The world also treats personal capacity as part of decision quality. Time passes, attention and energy change, rest becomes necessary, and the player must balance project control with recovery, food, water, conversation, and sleep.

---

## 1. The Goal of the Game

The main goal is to control every live management question in every available stage and then pass the stage checkpoint.

To complete the game, the player must:

1. Visit each active project stage.
2. Open every management mission attached to that stage.
3. Read the current evidence and reporting period.
4. Choose a response and declare a confidence level.
5. Review the consequence of the choice.
6. Complete the reasoning reflection for a correct decision.
7. Control all missions in the stage.
8. Pass the three-question stage checkpoint.
9. Earn the stage trophy.
10. Repeat the process until every current stage is controlled.

The campaign runs across a 30-day management window. If every live question is controlled and every stage trophy is earned before the window closes, the player reaches the successful ending. If the window closes first, the game presents a recovery ending and allows the player to begin again.

---

## 2. How to Enter the Game

OLA: RISE is hidden inside the main application. Once the entry sequence is completed, the game opens directly into the playable 3D world. There are no introductory screens before play begins.

### Keyboard entry

Press the following keys in order:

`6 → 5 → 4 → 1 → 2 → 3`

### Touchscreen entry

Use the following knock anywhere on the application screen:

1. Tap twice quickly.
2. Pause for about one second.
3. Tap three times quickly.

Short form:

`Tap–Tap → Pause → Tap–Tap–Tap`

For reliable recognition, keep each tap inside a burst close together. The pause should be approximately one to two seconds. If the pause is too short, too long, or the final three taps are slow, start the sequence again.

### Exiting

Use the visible **Exit game** button to return to the main application. On a desktop keyboard, the **Escape** key also closes the game layer.

---

## 3. How the Live Game Is Built

The game reads the current controlled project data already prepared for the application. It does not guess values from screenshots and it does not use an old project as a substitute when the current data cannot be loaded.

The working flow is:

1. The latest portfolio record identifies the projects currently available.
2. Each project points to its current normalized reporting snapshot.
3. The game reads the project identity, period, revision fingerprint, metrics, evidence, and management findings.
4. One 3D stage is created for each available project.
5. Current findings become management missions and checkpoint questions.
6. A changed project snapshot produces a fresh stage challenge for that revision.

This makes the game adaptive to the application’s current data. A new project creates a new stage. A changed reporting period or project revision updates the evidence and questions. A project that is no longer present is not kept as an active stage.

### Data integrity rules

- Project figures are read from the current controlled records.
- Evidence is kept with its project, reporting period, and revision.
- One project cannot supply figures to another project’s stage.
- Missing or conflicting evidence is treated as an evidence gap.
- The game never treats a missing value as a favorable result.
- The player’s decision changes only game progress; it does not edit project data, forecasts, workbooks, or source records.

If the current live data cannot be read, the game shows a clear loading error and offers **Retry live reading**. It does not silently replace the current stage with older questions.

---

## 4. The 3D World

Each current project appears as a destination in the game world. Buildings, roads, signs, lights, landscape elements, the Food Court, and moving characters create a small city around the management stages.

Eng. Ola can travel in three ways:

- **Guided travel:** press the large **GO TO** button and Ola follows a collision-safe route to the next required stage.
- **Tap-to-walk:** tap a reachable point in the world and Ola walks toward it.
- **Manual movement:** use the on-screen joystick to move freely.

The camera can be rotated by dragging and zoomed with a pinch gesture. The **Center Ola** control returns the camera to the player. Buildings and major world objects act as solid obstacles; travel routes are calculated around them rather than passing through them.

When Ola reaches a stage, the project sheet opens with the current period, source reference, summary measures, progress, and mission list.

---

## 5. Core Gameplay Loop

### Step 1: Follow the objective

The objective bar always identifies the next required destination. Pressing **GO TO PROJECT** starts direct 3D travel. The stage rail shows the order of the active stages and the current campaign position.

### Step 2: Open a project stage

The project sheet shows:

- Stage name and visible alias.
- Current reporting period.
- Source description.
- Available summary measures.
- Number of controlled and open missions.
- Management missions for the current snapshot.

### Step 3: Open a mission

Each mission carries a status such as critical, caution, favorable, or unable to assess. Opening it presents:

- The issue being measured.
- The current reading.
- Exact supporting evidence.
- A control principle.
- A four-step decision framework.
- A confidence choice.
- Management response options.
- A guide hint when help is needed.

### Step 4: Use the decision framework

Every mission follows the same reusable structure:

1. **Observe** — read the signal without changing or hiding it.
2. **Diagnose** — separate fact, assumption, scope, timing, and controllable cause.
3. **Decide** — choose the action that best protects management control.
4. **Protect** — name the owner, evidence, timing, and next review trigger.

The framework is applied across cost performance, forecast exposure, cashflow, profitability, reconciliation, concentration, waste, data quality, and other supported management conditions.

### Step 5: Declare confidence

Before choosing an answer, the player selects one of three confidence levels:

- **Unsure**
- **Reasoned**
- **Certain**

Confidence does not change the correct answer. It helps the player compare certainty with actual performance. A correct answer with reasonable confidence is calibrated; a wrong answer selected with certainty is marked as overconfident and returned for review.

### Step 6: Read the feedback

After an answer, the game explains:

- Whether the choice controls the verified condition.
- Why the response is strong or weak.
- The risk or benefit created by the choice.
- The next action needed to protect the decision.

An incorrect answer does not close the mission. The player can reread the evidence, use the thought hint, and try again.

### Step 7: Lock the learning

A correct answer opens a short reflection question. The mission is not considered learned until the player selects the reasoning that preserves evidence, traceability, ownership, and the next control.

This prevents progress from depending on answer memorization alone. The player must recognize the management principle behind the choice.

---

## 6. Decision Mastery Progress

The decision mastery strip records four learning measures:

- **XP:** progress earned from decisions and reflections.
- **Accuracy:** correct answers divided by total attempts.
- **Reflections:** completed reasoning checks.
- **Review due:** decisions that need another attempt after an incorrect choice.

Correct decisions build a streak. Incorrect decisions break the current streak and place the item in the review queue for a later game day. This encourages the player to revisit weak areas rather than move past them unnoticed.

The game records up to the recent attempt history for each decision and keeps the training state with the saved campaign.

---

## 7. The Guide and Thought Bubble

The guide is available when the player needs help. Each mission and checkpoint includes an evidence-based hint shown as Eng. Ola’s thought bubble.

The hint does not introduce a new figure. It directs attention to the relevant evidence, comparison, scope, or control principle. Help is intended to teach how to reason through the decision rather than simply move the player forward.

The touch interface includes a limited **HELP** control. Mission and exam screens also provide a direct hint action.

---

## 8. Stage Checkpoints and Trophies

After every mission in a stage is controlled, a three-question management checkpoint opens. The questions are sampled from that stage’s current project snapshot.

To earn the trophy:

1. Answer all three checkpoint questions correctly.
2. Use the evidence reminder when necessary.
3. Apply the stage’s management principles consistently.

A wrong checkpoint response keeps the player in the exam and returns the relevant hint. Passing the checkpoint adds a visible trophy to the world and the trophy cabinet.

The trophy is tied to the project period and revision fingerprint. When the underlying snapshot changes, the new revision creates a fresh challenge rather than treating the previous trophy as proof that the new data has already been controlled.

---

## 9. Time, Needs, and Life Management

The game clock moves through morning, afternoon, evening, and night. The player can run time at:

- **Pause**
- **1×** normal speed
- **2×** speed
- **4×** speed

The five visible needs are:

- Energy
- Focus
- Patience
- Social connection
- Fun

Movement, work, meals, conversation, and rest affect these needs. The mood label reflects the weakest current need instead of showing a favorable mood when one important condition is deteriorating.

### Management and personal actions

The control drawer provides actions that visibly change needs and advance game time:

- Brew Egyptian coffee.
- Rest for six hours.
- Call a team huddle.
- Walk the live site.
- Drink water.
- Choose food at the Food Court.

These actions are not decorative. They alter the player state, appear in the world, and are saved with the campaign.

### Daily Decision Gym

The Daily Decision Gym creates a short life-management practice from Ola’s current condition. It may ask the player to protect sleep, recover depleted energy, pause before reacting, ask the team before assuming, or verify operational reality through a site walk.

The correct response depends on the current constraint. Coffee is not treated as a substitute for sleep; extra activity is not treated as useful when attention is depleted; and working alone is not treated as a solution when the missing evidence belongs to the team.

---

## 10. The 21:00 Boundary

At 21:00, management work closes for the night. Project decisions, mission fields, and checkpoint work are unavailable until the next morning.

The player still has two choices:

- **GO TO FOOD COURT** — Ola can move freely, eat, and speak with characters in night social mode.
- **BED TIME** — the game advances to 06:00 on the next day and restores the main recovery needs.

The Food Court remains separate from management work at night. Its purpose is recovery and social play, not hidden project processing.

If day 30 closes before all stages are controlled, the campaign ends with the recovery result.

---

## 11. Food Court and Social World

The Food Court is a distinct destination in the city. Its menu includes pizza, burger, tameez, shaabiyat, and karak tea. Each choice restores selected needs and uses game time.

Characters around the world speak one at a time. Selecting a visible conversation sends Ola toward that speaker and opens the next exchange. The sequence advances from one character to another so several speech bubbles do not compete on screen.

The social conversations add warmth and humor, while the management conclusions remain inside the evidence-based mission system.

---

## 12. Music, View, and Accessibility Controls

Music begins muted. The player must press **Play music** before the soundtrack starts. The drawer includes:

- Play and pause.
- Previous and next track.
- Volume down and volume up.
- Current volume percentage.

The game also supports media volume keys when the browser and device expose them.

View controls include:

- Center Ola.
- Change graphics quality.
- Enter fullscreen.
- Save progress.

The layout adapts to desktop, tablet, and mobile viewports. Touch controls are placed for mobile play, while keyboard and pointer controls remain available on desktop.

---

## 13. Saving, Revision Changes, and Resetting

Progress is saved locally in the current browser. The saved campaign includes:

- Current day and hour.
- Needs and simulation speed.
- Controlled missions.
- Earned trophies.
- Exam attempts.
- Decision mastery history.
- Food, coffee, and wellbeing activity.
- Night social state.

The save belongs to the current portfolio signature. When the active project set or current snapshot changes, the game uses a matching state key for that live configuration. This prevents progress from an older data arrangement from being silently treated as completion of a different one.

The **Reset game** control clears the current game progress and starts the current live campaign again. It does not delete source files or project records.

---

## 14. Success and Failure

### Successful completion

The success condition requires both:

- Every current mission is controlled.
- Every current stage trophy is earned.

The successful ending begins with **Congrats from Labib**, followed by the closing rise sequence.

### Incomplete campaign

If the 30-day window closes first, the game shows **Hard Luck from Labib** and explains that the management window ended before every live decision and checkpoint was controlled.

The failure state is not presented as a permanent loss. The player can review the exposed stages, reset the campaign, and practice the decisions again.

---

## 15. What the Game Is Designed to Teach

OLA: RISE develops a repeatable decision habit:

1. Read the evidence before reacting.
2. Keep different scopes and methods visible.
3. Distinguish a current fact from a forecast or assumption.
4. Identify the controllable driver.
5. Compare realistic response options.
6. Match confidence to the strength of the evidence.
7. Assign ownership, timing, and a measurable next check.
8. Revisit weak decisions instead of hiding them.
9. Protect judgment through rest, attention, and team input.
10. Adapt when the project data changes.

The intended result is not merely a higher score. It is stronger management behavior that can transfer to a new project, a new period, and a new set of figures.

---

## 16. Quick Reference

### Enter

- Keyboard: `6 5 4 1 2 3`
- Touch: two quick taps, pause, three quick taps

### Navigate

- GO TO: guided route to the next required stage
- Tap: walk to a reachable location
- Joystick: manual movement
- Drag: rotate camera
- Pinch: zoom
- ACT: interact with a nearby stage or character

### Control a stage

`Open project → Read evidence → Choose confidence → Select response → Complete reflection → Finish all missions → Pass 3-question checkpoint → Earn trophy`

### Protect the campaign

- Watch energy, focus, patience, social connection, and fun.
- Use the Daily Decision Gym to match the action to the current constraint.
- Stop management work at 21:00.
- Use the Food Court for night recovery and conversation.
- Sleep to return at 06:00.
- Save before leaving when desired; the game also saves important progress automatically.

### Finish

Control every current mission and earn every current stage trophy before the end of day 30.

