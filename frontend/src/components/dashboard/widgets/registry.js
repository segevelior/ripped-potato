// Registry of mobile-dashboard widgets. Order here is the default layout.
// Adding a widget = one entry here + a renderer in TodayView's `sections` map
// (or, once widgets become standalone self-fetching components, a `component`
// field — SportsNewsCards already fits that shape).
export const DASHBOARD_WIDGETS = [
  { id: "goals", title: "Your goals", defaultVisible: true },
  { id: "todaySession", title: "Today's session", defaultVisible: true },
  {
    id: "coachQuestion",
    title: "Coach check-in",
    defaultVisible: true,
    availabilityHint: "Shows when available"
  },
  {
    id: "progression",
    title: "Progression",
    defaultVisible: true,
    availabilityHint: "Shows when available"
  },
  { id: "sportsNews", title: "Sports news", defaultVisible: true }
];

export const WIDGETS_BY_ID = Object.fromEntries(
  DASHBOARD_WIDGETS.map((w) => [w.id, w])
);

// Reconcile a saved { order, hidden } config with the registry:
// - saved ids that no longer exist in the registry are dropped
// - registry widgets missing from the saved order are inserted after their
//   nearest default-order predecessor that IS present, so a widget shipped
//   between two existing ones lands between them, not at the end
// - hidden is filtered to known ids; defaultVisible:false widgets the user
//   never configured start hidden
// Always returns a complete, valid layout — callers never need a fallback.
export function resolveLayout(saved) {
  const savedOrder = (saved?.order || []).filter((id) => WIDGETS_BY_ID[id]);
  const order = [...savedOrder];
  DASHBOARD_WIDGETS.forEach((w, defaultIdx) => {
    if (order.includes(w.id)) return;
    let insertAt = 0;
    for (let i = defaultIdx - 1; i >= 0; i--) {
      const pos = order.indexOf(DASHBOARD_WIDGETS[i].id);
      if (pos !== -1) {
        insertAt = pos + 1;
        break;
      }
    }
    order.splice(insertAt, 0, w.id);
  });

  const hidden = (saved?.hidden || []).filter((id) => WIDGETS_BY_ID[id]);
  DASHBOARD_WIDGETS.forEach((w) => {
    if (!w.defaultVisible && !savedOrder.includes(w.id) && !hidden.includes(w.id)) {
      hidden.push(w.id);
    }
  });

  return { order, hidden };
}
