// Position-asserting checks for the dashboard widget registry's resolveLayout
// (the self-healing merge of a saved layout with the registry). There is no
// test runner in frontend/ yet, so this runs standalone:
//
//   node scripts/check-widget-registry.mjs
//
// Re-run after adding/removing/reordering widgets in
// src/components/dashboard/widgets/registry.js — the insertion logic
// (missing widget lands after its nearest PRESENT default-order predecessor)
// is the part most likely to regress.
import assert from "node:assert/strict";
import { resolveLayout, DASHBOARD_WIDGETS } from "../src/components/dashboard/widgets/registry.js";

const DEFAULT = DASHBOARD_WIDGETS.map((w) => w.id);
assert.deepEqual(
  DEFAULT,
  ["goals", "todaySession", "coachQuestion", "progression", "sportsNews"],
  "registry default order (update this file when the registry changes)"
);

// No saved config -> default order, nothing hidden
assert.deepEqual(resolveLayout(undefined), { order: DEFAULT, hidden: [] });
assert.deepEqual(resolveLayout({}), { order: DEFAULT, hidden: [] });

// Unknown id in saved order -> dropped
assert.deepEqual(
  resolveLayout({ order: ["bogus", ...DEFAULT], hidden: [] }).order,
  DEFAULT
);

// Saved order missing a middle widget -> inserted immediately after its
// nearest present default-order predecessor, NOT appended
assert.deepEqual(
  resolveLayout({
    order: ["sportsNews", "goals", "todaySession", "progression"],
    hidden: [],
  }).order,
  ["sportsNews", "goals", "todaySession", "coachQuestion", "progression"]
);

// Missing widget whose default predecessors are all absent -> lands first
assert.deepEqual(
  resolveLayout({
    order: ["coachQuestion", "progression", "sportsNews"],
    hidden: [],
  }).order,
  DEFAULT
);

// Two adjacent missing widgets -> both land in default relative order
assert.deepEqual(
  resolveLayout({ order: ["sportsNews", "goals", "progression"], hidden: [] })
    .order,
  ["sportsNews", "goals", "todaySession", "coachQuestion", "progression"]
);

// Unknown ids in hidden -> filtered; known ids kept
assert.deepEqual(
  resolveLayout({ order: DEFAULT, hidden: ["ghost", "progression"] }).hidden,
  ["progression"]
);

// Resolving a resolved layout is a no-op
const once = resolveLayout({ order: ["sportsNews", "goals"], hidden: ["goals"] });
assert.deepEqual(resolveLayout(once), once);

console.log("check-widget-registry: all resolveLayout checks passed");
