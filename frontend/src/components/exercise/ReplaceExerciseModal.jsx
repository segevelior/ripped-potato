import { useState, useEffect, useRef } from "react";
import { X, Sparkles, Search, Layers, ArrowRight, Loader2, AlertTriangle, Plus } from "lucide-react";
import { apiService } from "@/services/api";
import { aiService } from "@/services/aiService";
import ExerciseSearchInput from "./ExerciseSearchInput";

const TABS = [
  { key: "similar", label: "Similar", icon: Layers },
  { key: "sensei", label: "Ask the Sensei", icon: Sparkles },
  { key: "search", label: "Search", icon: Search },
];

// The `reason` drives both the Sensei prompt and the safety gate (pain → caution).
const REASONS = [
  { key: "equipment", label: "No equipment" },
  { key: "variety", label: "Want variety" },
  { key: "difficulty", label: "Too hard / easy" },
  { key: "pain", label: "Pain / injury" },
];

const REASON_TEXT = {
  equipment: "I don't have the equipment",
  variety: "I want variety",
  difficulty: "It's too hard or too easy",
  pain: "pain or injury",
};

function ExerciseResultRow({ name, subtitle, badge, onPick, disabled }) {
  return (
    <button
      onClick={onPick}
      disabled={disabled}
      className="w-full bg-white border border-gray-200 rounded-xl p-4 hover:shadow-md hover:border-gray-300 transition-all flex items-center justify-between gap-3 text-left disabled:opacity-50"
    >
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <h3 className="font-semibold text-gray-900 truncate">{name}</h3>
          {badge}
        </div>
        {subtitle && <p className="text-sm text-gray-500 truncate mt-0.5">{subtitle}</p>}
      </div>
      <ArrowRight className="w-4 h-4 text-gray-400 shrink-0" />
    </button>
  );
}

export default function ReplaceExerciseModal({ exercise, onClose, onReplace }) {
  const [tab, setTab] = useState("similar");
  const [reason, setReason] = useState(null);
  const [error, setError] = useState(null);
  const [materializingId, setMaterializingId] = useState(null);

  const exerciseId = exercise?.exercise_id || null;
  const exerciseName = exercise?.exercise_name || "";

  // If there's no real id we can't query "similar" — default to Search.
  useEffect(() => {
    if (!exerciseId) setTab("search");
  }, [exerciseId]);

  // --- Similar tab ---
  const [similar, setSimilar] = useState(null); // null = not loaded, [] = loaded empty
  const [similarLoading, setSimilarLoading] = useState(false);

  useEffect(() => {
    if (tab !== "similar" || !exerciseId || similar !== null) return;
    let cancelled = false;
    setSimilarLoading(true);
    apiService.exercises
      .similar(exerciseId, 8)
      .then((list) => { if (!cancelled) setSimilar(Array.isArray(list) ? list : []); })
      .catch(() => { if (!cancelled) setSimilar([]); })
      .finally(() => { if (!cancelled) setSimilarLoading(false); });
    return () => { cancelled = true; };
  }, [tab, exerciseId, similar]);

  // --- Sensei tab ---
  const [sensei, setSensei] = useState(null);       // { options?, routed?, message? }
  const [senseiLoading, setSenseiLoading] = useState(false);
  const senseiAbortRef = useRef(null);

  const runSensei = () => {
    if (senseiAbortRef.current) senseiAbortRef.current.abort();
    const controller = new AbortController();
    senseiAbortRef.current = controller;
    setSenseiLoading(true);
    setSensei(null);
    setError(null);
    aiService
      .rankSubstitutes(
        { exercise_id: exerciseId, exercise_name: exerciseName, reason: reason ? REASON_TEXT[reason] : undefined },
        controller.signal
      )
      .then((res) => setSensei(res || { options: [] }))
      .catch((err) => {
        if (err?.name === "AbortError") return;
        setError("The Sensei couldn't fetch options. Try again.");
        setSensei({ options: [] });
      })
      .finally(() => {
        if (senseiAbortRef.current === controller) senseiAbortRef.current = null;
        setSenseiLoading(false);
      });
  };

  const cancelSensei = () => {
    if (senseiAbortRef.current) senseiAbortRef.current.abort();
    senseiAbortRef.current = null;
    setSenseiLoading(false);
  };

  useEffect(() => () => { if (senseiAbortRef.current) senseiAbortRef.current.abort(); }, []);

  // Materialize a generated (source:"new") exercise into the catalog before swapping,
  // so it carries a real id. Dedup by name first to avoid polluting the catalog.
  const pickGenerated = async (opt) => {
    setError(null);
    setMaterializingId(opt.name);
    try {
      const matches = await apiService.exercises.list({ search: opt.name, limit: 5 });
      const existing = (Array.isArray(matches) ? matches : []).find(
        (e) => (e.name || "").toLowerCase() === (opt.name || "").toLowerCase()
      );
      if (existing) { onReplace(existing); return; }

      const created = await apiService.exercises.create({
        name: opt.name,
        muscles: opt.muscles || [],
        secondaryMuscles: opt.secondaryMuscles || [],
        discipline: opt.discipline || ["strength"],
        equipment: opt.equipment || [],
        difficulty: opt.difficulty || "beginner",
        strain: opt.strain || undefined,
      });
      onReplace(created);
    } catch (err) {
      console.error("Failed to create generated exercise:", err);
      setError(`Couldn't add “${opt.name}”. Pick another option or search instead.`);
    } finally {
      setMaterializingId(null);
    }
  };

  const pickOption = (opt) => {
    if (opt.source === "new") return pickGenerated(opt);
    return onReplace(opt); // catalog pick already has a real id + strain
  };

  const availableTabs = TABS.filter((t) => t.key !== "similar" || exerciseId);

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[55] flex items-end sm:items-center justify-center sm:p-4">
      <div className="bg-white rounded-t-3xl sm:rounded-2xl shadow-2xl w-full sm:max-w-lg max-h-[92vh] flex flex-col">
        {/* Header */}
        <div className="p-5 border-b border-gray-100">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="text-xl font-bold text-gray-900 truncate">Replace “{exerciseName}”</h2>
              <p className="text-sm text-gray-500 mt-0.5">Find an exercise with a similar stimulus</p>
            </div>
            <button onClick={onClose} className="p-2 rounded-lg hover:bg-gray-100 shrink-0">
              <X className="w-5 h-5 text-gray-400" />
            </button>
          </div>

          {/* Reason chips */}
          <div className="flex flex-wrap gap-2 mt-4">
            {REASONS.map((r) => (
              <button
                key={r.key}
                onClick={() => setReason(reason === r.key ? null : r.key)}
                className={`px-3 py-1.5 rounded-full text-sm font-medium border transition-colors ${
                  reason === r.key
                    ? "bg-primary-600 text-white border-primary-600"
                    : "bg-white text-gray-600 border-gray-200 hover:border-gray-300"
                }`}
              >
                {r.label}
              </button>
            ))}
          </div>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-100 px-2">
          {availableTabs.map((t) => {
            const Icon = t.icon;
            return (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`flex-1 flex items-center justify-center gap-1.5 py-3 text-sm font-medium border-b-2 transition-colors ${
                  tab === t.key
                    ? "border-primary-600 text-primary-600"
                    : "border-transparent text-gray-500 hover:text-gray-700"
                }`}
              >
                <Icon className="w-4 h-4" />
                {t.label}
              </button>
            );
          })}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5">
          {error && (
            <div className="mb-4 flex items-start gap-2 text-sm text-red-700 bg-red-50 rounded-xl p-3">
              <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Similar */}
          {tab === "similar" && (
            <div className="space-y-3">
              {similarLoading && (
                <div className="space-y-3">
                  {Array(4).fill(0).map((_, i) => (
                    <div key={i} className="animate-pulse bg-gray-100 h-16 rounded-xl" />
                  ))}
                </div>
              )}
              {!similarLoading && similar && similar.length > 0 && similar.map((ex) => (
                <ExerciseResultRow
                  key={ex._id || ex.id}
                  name={ex.name}
                  subtitle={(ex.muscles || []).join(", ")}
                  onPick={() => onReplace(ex)}
                />
              ))}
              {!similarLoading && similar && similar.length === 0 && (
                <p className="text-center text-gray-500 py-8 text-sm">
                  No similar exercises found. Try “Ask the Sensei” or search below.
                </p>
              )}
            </div>
          )}

          {/* Ask the Sensei */}
          {tab === "sensei" && (
            <div>
              {!sensei && !senseiLoading && (
                <div className="text-center py-8">
                  <Sparkles className="w-10 h-10 text-primary-500 mx-auto mb-3" />
                  <p className="text-gray-600 mb-4 text-sm">
                    Get AI-picked alternatives{reason ? ` for “${REASONS.find((r) => r.key === reason)?.label}”` : ""}.
                  </p>
                  <button
                    onClick={runSensei}
                    className="px-5 py-2.5 bg-primary-600 text-white rounded-xl font-semibold hover:bg-primary-700"
                  >
                    Get options
                  </button>
                </div>
              )}

              {senseiLoading && (
                <div className="text-center py-8">
                  <Loader2 className="w-8 h-8 text-primary-500 mx-auto mb-3 animate-spin" />
                  <p className="text-gray-500 text-sm mb-4">The Sensei is thinking…</p>
                  <button onClick={cancelSensei} className="text-sm text-gray-500 underline">Cancel</button>
                </div>
              )}

              {sensei?.routed === "safety" && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-800">
                  <AlertTriangle className="w-5 h-5 mb-2" />
                  {sensei.message}
                </div>
              )}

              {sensei && !sensei.routed && (sensei.options?.length > 0) && (
                <div className="space-y-3">
                  {sensei.options.map((opt, i) => (
                    <ExerciseResultRow
                      key={opt.id || `${opt.name}-${i}`}
                      name={opt.name}
                      subtitle={opt.note || (opt.muscles || []).join(", ")}
                      disabled={materializingId === opt.name}
                      badge={
                        opt.source === "new" ? (
                          <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-purple-100 text-purple-700 text-[11px] font-medium">
                            <Plus className="w-3 h-3" /> New
                          </span>
                        ) : null
                      }
                      onPick={() => pickOption(opt)}
                    />
                  ))}
                  <button onClick={runSensei} className="w-full text-sm text-gray-500 py-2 hover:text-gray-700">
                    Regenerate options
                  </button>
                </div>
              )}

              {sensei && !sensei.routed && sensei.options?.length === 0 && !senseiLoading && (
                <p className="text-center text-gray-500 py-8 text-sm">
                  No options came back. Try a different reason or search below.
                </p>
              )}
            </div>
          )}

          {/* Search */}
          {tab === "search" && (
            <ExerciseSearchInput
              autoFocus
              excludeId={exerciseId}
              placeholder="Search for a replacement…"
              onSelect={(ex) => onReplace(ex)}
            />
          )}
        </div>
      </div>
    </div>
  );
}
