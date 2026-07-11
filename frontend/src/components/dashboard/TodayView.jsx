import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { CalendarEvent, UserGoalProgress } from "@/api/entities";
import apiService from "@/services/api";
import aiService from "@/services/aiService";
import { getDisciplineColor } from "@/styles/designTokens";
import {
  Play, Sparkles, X, ChevronRight, ArrowRight, Check, Bike, Dumbbell,
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
  const [coach, setCoach] = useState(null);
  const [coachDismissed, setCoachDismissed] = useState(false);
  const [coachAnswer, setCoachAnswer] = useState(null);
  const [coachReply, setCoachReply] = useState(null);
  const [coachReplyLoading, setCoachReplyLoading] = useState(false);
  const [continuing, setContinuing] = useState(false);
  const [progression, setProgression] = useState(null);
  const [horizon, setHorizon] = useState([]);

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

    // Today's session — first not-yet-done calendar event, else cached AI suggestion
    CalendarEvent.today()
      .then((events) => {
        if (!alive) return;
        const list = Array.isArray(events) ? events : [];
        const next =
          list.find((e) => (e.status || "scheduled") !== "completed") || list[0];
        if (next) {
          setSession({
            title: next.title,
            type: next.workoutDetails?.type || next.eventType || "Workout",
            time: fmtTime(next.date),
            duration:
              next.workoutDetails?.durationMinutes ||
              next.workoutDetails?.estimatedDuration ||
              null,
            exercises: next.workoutDetails?.exercises?.length || null,
            eventId: next.id,
          });
        } else {
          const cached = aiService.getCachedTodayWorkout();
          if (cached?.suggestion) {
            const s = cached.suggestion;
            setSession({
              title: s.name || s.title,
              type: s.type || s.primary_disciplines?.[0] || "Workout",
              time: null,
              duration: s.estimated_duration || s.duration_minutes || null,
              exercises: s.exercises?.length || s.blocks?.length || null,
              eventId: null,
            });
          }
        }
      })
      .catch(() => {});

    // Coach question — memory-driven
    aiService
      .getCoachQuestion()
      .then((q) => {
        if (alive && q) setCoach(q);
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

  const startSession = () => {
    if (session?.eventId) {
      navigate(createPageUrl(`Calendar`));
    } else {
      navigate(createPageUrl("TrainNow"));
    }
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

  return (
    <div className="today-view">
      <div className="tv-stack">
        {/* GOALS — on top */}
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

        {/* HERO SESSION */}
        <div className="tv-hero">
          {session ? (
            <>
              <div className="tv-hero-kicker" style={{ color: typeColor(session.type) }}>
                <SessionIcon type={session.type} />
                {capitalize(session.type)}
                {session.time ? ` · ${session.time}` : ""}
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

        {/* COACH QUESTION — memory-driven */}
        {coach && !coachDismissed && (
          <div className="tv-coach">
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
        )}

        {/* PROGRESSION — horizontal ladder */}
        {progression && rungs.length > 0 && (
          <>
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
          </>
        )}
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
