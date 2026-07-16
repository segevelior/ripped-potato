import React, { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { CalendarEvent, UserGoalProgress } from "@/api/entities";
import apiService from "@/services/api";
import aiService from "@/services/aiService";
import { useDashboardLayout } from "@/hooks/useDashboardLayout";
import { pickTodaySession } from "@/utils/todaySession";
import SportsNewsCards from "./SportsNewsCards";
import DashboardEditMode from "./DashboardEditMode";
import { getDisciplineColor } from "@/styles/designTokens";
import {
  Play, Sparkles, X, ChevronRight, ArrowRight, Check, Bike, Dumbbell,
  SlidersHorizontal,
} from "lucide-react";
import { format, parseISO, isValid } from "date-fns";
import "./TodayView.css";

// Goal identity hue by category (kept distinct from the coral action color)
const GOAL_COLORS = {
  event: "#6366F1",        // app secondary indigo
  competition: "#6366F1",
  outcome: "#22C55E",      // running green
  endurance: "#22C55E",
  skill: "#CA8A04",        // calisthenics yellow
  strength: "#2563EB",
  default: "#6366F1",
};

const goalColor = (category) =>
  GOAL_COLORS[(category || "").toLowerCase()] || GOAL_COLORS.default;

// Map a workout/discipline type to its dashboard hue
const typeColor = (type) => getDisciplineColor(type) || "#A855F7";

function fmtTime(dateStr) {
  if (!dateStr) return null;
  const d = parseISO(dateStr);
  if (!isValid(d)) return null;
  return format(d, "HH:mm");
}

export default function TodayView() {
  const navigate = useNavigate();
  const [goals, setGoals] = useState([]);
  const [session, setSession] = useState(null);
  const [sessionLoading, setSessionLoading] = useState(true);
  const [sessionDone, setSessionDone] = useState(false);
  const [coach, setCoach] = useState(null);
  const [coachDismissed, setCoachDismissed] = useState(false);
  const [coachAnswer, setCoachAnswer] = useState(null);
  const [coachReply, setCoachReply] = useState(null);
  const [coachReplyLoading, setCoachReplyLoading] = useState(false);
  const [continuing, setContinuing] = useState(false);
  const [progression, setProgression] = useState(null);
  const [horizon, setHorizon] = useState([]);
  const [editing, setEditing] = useState(false);
  const {
    layout,
    updateLayout,
    saveLayout,
    beginEdit,
    saveError,
    sportsNewsEnabled,
  } = useDashboardLayout();
  // Layout as it was when edit mode opened — Done skips the PUT if unchanged.
  const editSnapshot = useRef(null);
  // Once-per-mount guards for the visibility-gated fetches below, so a widget
  // unhidden via Done fetches its data exactly once.
  const sessionFetched = useRef(false);
  const coachFetched = useRef(false);
  // Liveness for those fetches is scoped to the MOUNT, not to each effect run:
  // a hiddenKey change must not abandon an in-flight fetch (the fetched ref
  // already blocks any retry, so abandoning it would strand the loading state).
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const isVisible = (id) => !layout.hidden.includes(id);
  // Stable dep for the gated effects — hidden is a fresh array each resolve.
  const hiddenKey = layout.hidden.join(",");

  useEffect(() => {
    let alive = true;

    // Goals — active, top 2
    UserGoalProgress.list()
      .then((data) => {
        if (!alive) return;
        const active = (Array.isArray(data) ? data : [])
          .filter((g) => g.is_active && !g.completed_date)
          .slice(0, 2);
        setGoals(active);
      })
      .catch(() => {});

    // Progression — first in-progress skill ladder
    apiService.progressions
      .list()
      .then((data) => {
        if (!alive) return;
        const list = Array.isArray(data) ? data : [];
        const active =
          list.find((p) => p.userProgress?.status === "in_progress") || list[0];
        if (active) setProgression(active);
      })
      .catch(() => {});

    return () => {
      alive = false;
    };
  }, []);

  // Today's session — gated on the widget being visible because the
  // no-calendar-event path generates a persisted AI suggestion (an LLM call);
  // a hidden widget must not keep paying for it. Also paused while editing so
  // eye-toggles don't fire the paid call before Done commits them.
  useEffect(() => {
    if (editing || !isVisible("todaySession") || sessionFetched.current) return;
    sessionFetched.current = true;

    // Calendar first (same selection rule as the TrainNow page), then the
    // same server-persisted AI suggestion TrainNow uses, so both surfaces
    // always show the same thing.
    CalendarEvent.today()
      .then(async (events) => {
        if (!mounted.current) return;
        const { scheduledEvent, completedToday } = pickTodaySession(events);
        if (scheduledEvent) {
          setSession({
            title: scheduledEvent.title,
            type:
              scheduledEvent.workoutDetails?.type ||
              scheduledEvent.eventType ||
              "Workout",
            time: fmtTime(scheduledEvent.date),
            duration:
              scheduledEvent.workoutDetails?.durationMinutes ||
              scheduledEvent.workoutDetails?.estimatedDuration ||
              scheduledEvent.workoutTemplateId?.estimated_duration ||
              null,
            // Exercise count comes from the linked template; embedded list
            // is a legacy fallback for unmigrated events.
            exercises:
              scheduledEvent.workoutTemplateId?.blocks?.reduce(
                (n, b) => n + (b.exercises?.length || 0),
                0
              ) ||
              scheduledEvent.workoutDetails?.exercises?.length ||
              null,
            eventId: scheduledEvent.id,
          });
          setSessionLoading(false);
          return;
        }
        if (completedToday) {
          setSessionDone(true);
          setSessionLoading(false);
          return;
        }
        // No calendar event — fetch (or generate) today's persisted suggestion
        const data = await aiService.getTodayWorkout();
        if (!mounted.current) return;
        if (data?.suggestion) {
          const s = data.suggestion;
          if (s.type === "rest") {
            setSession({
              rest: true,
              title: s.name || "Rest Day",
              reasoning: s.reasoning || null,
            });
          } else {
            setSession({
              title: s.name || s.title,
              type: s.primary_disciplines?.[0] || "Workout",
              time: null,
              duration: s.estimated_duration || s.duration_minutes || null,
              exercises: s.exercises?.length || s.blocks?.length || null,
              eventId: null,
            });
          }
        }
        setSessionLoading(false);
      })
      .catch(() => {
        if (mounted.current) setSessionLoading(false);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hiddenKey, editing]);

  // Coach question — memory-driven; hits the ai-coach service, so gated the
  // same way as the session fetch above.
  useEffect(() => {
    if (editing || !isVisible("coachQuestion") || coachFetched.current) return;
    coachFetched.current = true;

    aiService
      .getCoachQuestion()
      .then((q) => {
        if (mounted.current && q) setCoach(q);
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hiddenKey, editing]);

  const startSession = () => {
    // TrainNow shows calendar-scheduled sessions as the "Scheduled Today" card
    // (same pickTodaySession selection) and owns the LiveWorkout launch flow,
    // including the active-session conflict guard.
    navigate(createPageUrl("TrainNow"));
  };

  // Tap an answer chip → short inline coach reply (no navigation)
  const handleCoachAnswer = async (chip) => {
    if (coachAnswer) return;
    setCoachAnswer(chip);
    setCoachReplyLoading(true);
    const reply = await aiService.getCoachReply(coach.question, chip);
    setCoachReply(
      reply || "Got it — I've noted that. Tap continue if you want to talk it through."
    );
    setCoachReplyLoading(false);
  };

  // Promote the mini check-in into a full, persisted conversation, then open it
  const continueInSensei = async () => {
    if (continuing) return;
    setContinuing(true);
    const convId = await aiService.continueCoachConversation(
      coach.question,
      coachAnswer,
      coachReply
    );
    if (convId) {
      try {
        localStorage.setItem("openConversationId", convId);
        localStorage.setItem("openConversationTime", String(Date.now()));
      } catch {
        /* ignore storage errors */
      }
    }
    navigate(createPageUrl("Chat"));
  };

  // Build a compact ladder (<=5 rungs) centered on the current step
  const rungs = buildRungs(progression);

  // Widget renderers, keyed by registry id. Order/visibility come from the
  // saved layout; adding a widget = registry entry + renderer here.
  const sections = {
    goals: () => (
      <React.Fragment key="goals">
        <div className="tv-goals-head">
          <span className="tv-h">Your goals</span>
          <span className="tv-all" onClick={() => navigate(createPageUrl("Goals"))}>
            See all
          </span>
        </div>
        <div className="tv-goals">
          {goals.length > 0 ? (
            goals.map((g) => {
              const c = goalColor(g.category || "skill");
              const pct = Math.min(((g.current_level || 0) / 10) * 100, 100);
              return (
                <div
                  key={g.id}
                  className="tv-goal"
                  style={{ "--goal-c": c }}
                  onClick={() =>
                    navigate(createPageUrl(`Goals?goal=${g.goal_id}`))
                  }
                >
                  <div className="tv-goal-kicker">
                    <span className="tv-swatch" />
                    {g.category || "Goal"}
                  </div>
                  <div className="tv-goal-title">{g.goal_name}</div>
                  <div className="tv-goal-sub">Level {g.current_level || 0}</div>
                  <div className="tv-goal-track">
                    <div className="tv-goal-fill" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })
          ) : (
            <div
              className="tv-goal tv-goal-empty"
              style={{ "--goal-c": GOAL_COLORS.default }}
              onClick={() => navigate(createPageUrl("Goals"))}
            >
              <div className="tv-goal-title">Set a goal</div>
              <div className="tv-goal-sub">Pick something to train toward</div>
            </div>
          )}
        </div>
      </React.Fragment>
    ),

    todaySession: () => (
      <div className="tv-hero" key="todaySession">
          {sessionLoading ? (
            <>
              <div className="tv-hero-kicker" style={{ color: "var(--tv-accent)" }}>
                <Sparkles className="tv-ico" />
                Coach is thinking
              </div>
              <div className="tv-hero-title" style={{ opacity: 0.55 }}>
                Preparing today's pick…
              </div>
              <div className="tv-hero-meta" style={{ opacity: 0.55 }}>
                One moment.
              </div>
            </>
          ) : sessionDone ? (
            <>
              <div className="tv-hero-kicker" style={{ color: "#22C55E" }}>
                <Check className="tv-ico" />
                Done for today
              </div>
              <div className="tv-hero-title">Session complete</div>
              <div className="tv-hero-meta">
                Nice work — recovery counts too.
              </div>
              <button className="tv-cta" onClick={() => navigate(createPageUrl("TrainNow"))}>
                <Play className="tv-ico" fill="currentColor" strokeWidth={0} />
                Train more
              </button>
            </>
          ) : session?.rest ? (
            <>
              <div className="tv-hero-kicker" style={{ color: "#6366F1" }}>
                <Sparkles className="tv-ico" />
                Sensei's advice
              </div>
              <div className="tv-hero-title">{session.title}</div>
              <div className="tv-hero-meta">
                {session.reasoning || "Your body needs time to recover today."}
              </div>
              <button className="tv-cta" onClick={() => navigate(createPageUrl("TrainNow"))}>
                <ChevronRight className="tv-ico" />
                View details
              </button>
            </>
          ) : session ? (
            <>
              <div className="tv-hero-kicker" style={{ color: typeColor(session.type) }}>
                <SessionIcon type={session.type} />
                {capitalize(session.type)}
                {session.time ? ` · ${session.time}` : ""}
                {session.eventId == null ? " · Today's pick" : ""}
              </div>
              <div className="tv-hero-title">{session.title}</div>
              <div className="tv-hero-meta">{sessionMeta(session)}</div>
              <button className="tv-cta" onClick={startSession}>
                <Play className="tv-ico" fill="currentColor" strokeWidth={0} />
                Start session
              </button>
            </>
          ) : (
            <>
              <div className="tv-hero-kicker" style={{ color: "var(--tv-accent)" }}>
                <Sparkles className="tv-ico" />
                Nothing scheduled
              </div>
              <div className="tv-hero-title">Free day</div>
              <div className="tv-hero-meta">
                Log a session or let the coach suggest one.
              </div>
              <button className="tv-cta" onClick={() => navigate(createPageUrl("TrainNow"))}>
                <Play className="tv-ico" fill="currentColor" strokeWidth={0} />
                Train now
              </button>
            </>
          )}
          {horizon.length > 0 && (
            <div className="tv-horizon">
              <ArrowRight className="tv-ico-sm" />
              {horizon.join(" · ")}
            </div>
          )}
        </div>
    ),

    // Memory-driven; self-hides when there's no question or it was dismissed
    coachQuestion: () =>
      coach && !coachDismissed && (
          <div className="tv-coach" key="coachQuestion">
            <span className="tv-sparkle">
              <Sparkles className="tv-ico" />
            </span>
            <div className="tv-coach-body">
              <div className="tv-coach-text">{coach.question}</div>

              {!coachAnswer ? (
                <>
                  <div className="tv-chips">
                    {coach.chips.map((chip, i) => (
                      <button
                        key={i}
                        className="tv-chip"
                        onClick={() => handleCoachAnswer(chip)}
                      >
                        {chip}
                      </button>
                    ))}
                  </div>
                  {coach.source && (
                    <span className="tv-coach-src">
                      <Sparkles className="tv-ico-sm" />
                      From memory — {coach.source}
                    </span>
                  )}
                </>
              ) : (
                <div className="tv-coach-answered">
                  <span className="tv-answer-pill">{coachAnswer}</span>
                  {coachReplyLoading ? (
                    <div className="tv-coach-reply tv-typing">
                      <span /><span /><span />
                    </div>
                  ) : (
                    <>
                      <div className="tv-coach-reply">{coachReply}</div>
                      <button
                        className="tv-continue"
                        onClick={continueInSensei}
                        disabled={continuing}
                      >
                        {continuing ? "Opening…" : "Continue with Sensei"}
                        {!continuing && <ChevronRight className="tv-ico-sm" />}
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>
            <span className="tv-coach-x" onClick={() => setCoachDismissed(true)}>
              <X className="tv-ico-sm" />
            </span>
          </div>
      ),

    // Self-hides when there's no active ladder
    progression: () =>
      progression && rungs.length > 0 && (
          <React.Fragment key="progression">
            <div className="tv-goals-head">
              <span className="tv-h">Progression</span>
              <span
                className="tv-all"
                onClick={() => navigate(createPageUrl("Progressions"))}
              >
                See all
              </span>
            </div>
            <div
              className="tv-prog"
              onClick={() => navigate(createPageUrl("Progressions"))}
            >
              <div className="tv-prog-head">
                <span className="tv-prog-title">
                  {progression.goalExercise?.name || progression.name}
                </span>
                <ChevronRight className="tv-ico-sm tv-muted" />
              </div>
              <div className="tv-ladder">
                {rungs.map((r, i) => (
                  <div
                    key={i}
                    className={`tv-rung ${r.state}`}
                    style={{ "--rung-c": "#CA8A04" }}
                  >
                    <span className="tv-node">
                      {r.state === "done" ? (
                        <Check className="tv-node-ico" strokeWidth={3} />
                      ) : r.state === "now" ? (
                        <span className="tv-node-dot" />
                      ) : null}
                    </span>
                    <span className="tv-lbl">{r.label}</span>
                  </div>
                ))}
              </div>
            </div>
          </React.Fragment>
      ),

    // Swipeable cards; self-hides on error or when disabled in Settings
    sportsNews: () => <SportsNewsCards key="sportsNews" />,
  };

  if (editing) {
    return (
      <div className="today-view">
        <DashboardEditMode
          layout={layout}
          sportsNewsEnabled={sportsNewsEnabled}
          onChange={updateLayout}
          onDone={() => {
            setEditing(false);
            // Skip the PUT when nothing changed — unless an earlier save
            // failed, in which case Done doubles as the retry.
            if (saveError || JSON.stringify(layout) !== editSnapshot.current) {
              saveLayout(layout);
            }
          }}
        />
      </div>
    );
  }

  return (
    <div className="today-view">
      <div className="tv-stack">
        <div className="tv-edit-row">
          <button
            className="tv-edit-btn"
            aria-label="Edit layout"
            onClick={() => {
              beginEdit();
              editSnapshot.current = JSON.stringify(layout);
              setEditing(true);
            }}
          >
            <SlidersHorizontal className="tv-ico-sm" />
          </button>
        </div>
        {saveError && (
          <div className="tv-save-error">
            Couldn&rsquo;t save your layout — it may reset when you leave this
            page. Edit again to retry.
          </div>
        )}
        {layout.order
          .filter((id) => !layout.hidden.includes(id))
          .map((id) => sections[id]?.() || null)}
      </div>
    </div>
  );
}

function SessionIcon({ type }) {
  const t = (type || "").toLowerCase();
  if (t.includes("cycl") || t.includes("ride") || t.includes("bike")) {
    return <Bike className="tv-ico" />;
  }
  return <Dumbbell className="tv-ico" />;
}

function capitalize(s) {
  if (!s) return "";
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function sessionMeta(session) {
  const parts = [];
  if (session.duration) parts.push(`${session.duration} min`);
  if (session.exercises) parts.push(`${session.exercises} exercises`);
  return parts.join(" · ") || "Tap to begin";
}

// Produce up to 5 rungs, marking completed / current / upcoming
function buildRungs(progression) {
  if (!progression?.steps?.length) return [];
  const steps = progression.steps;
  const currentIdx = Math.max(
    0,
    steps.findIndex((s) => !isStepDone(s, progression.userProgress))
  );

  const withState = steps.map((s, i) => ({
    label: s.name || s.exercise?.name || `Step ${i + 1}`,
    state:
      isStepDone(s, progression.userProgress)
        ? "done"
        : i === currentIdx
        ? "now"
        : "todo",
  }));

  // Window of 5 centered on current
  if (withState.length <= 5) return withState;
  let start = Math.max(0, currentIdx - 2);
  let end = Math.min(withState.length, start + 5);
  start = Math.max(0, end - 5);
  return withState.slice(start, end);
}

function isStepDone(step, userProgress) {
  const completed =
    userProgress?.completedSteps ||
    userProgress?.completed_steps ||
    [];
  const id = step._id || step.id;
  if (Array.isArray(completed) && id) {
    return completed.some((c) => String(c) === String(id));
  }
  return step.isCompleted === true || step.completed === true;
}
