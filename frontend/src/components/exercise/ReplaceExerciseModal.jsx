import { useState, useEffect, useRef } from "react";
import { X, Sparkles, Search, AlertTriangle, Plus, Loader2 } from "lucide-react";
import { apiService } from "@/services/api";
import { aiService } from "@/services/aiService";
import ExerciseResultRow from "./replace/ExerciseResultRow";
import BrowseTab from "./replace/BrowseTab";

const TABS = [
  { key: "browse", label: "Browse", icon: Search },
  { key: "sensei", label: "Ask the Sensei", icon: Sparkles },
];

export default function ReplaceExerciseModal({ exercise, onClose, onReplace, canPersist = false, isCommonTemplate = false }) {
  const [tab, setTab] = useState("browse");
  const [error, setError] = useState(null);
  const [materializingId, setMaterializingId] = useState(null);
  // When the session is linked to a template, a pick pauses on a scope step
  // ("just this session" vs "from now on") instead of replacing immediately.
  const [pendingPick, setPendingPick] = useState(null);

  const exerciseId = exercise?.exercise_id || null;
  const exerciseName = exercise?.exercise_name || "";

  const handlePick = (ex) => {
    if (canPersist) setPendingPick(ex);
    else onReplace(ex, { permanent: false });
  };

  // --- Sensei tab (one-shot) ---
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
      .rankSubstitutes({ exercise_id: exerciseId, exercise_name: exerciseName }, controller.signal)
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
  const materializeAndPick = async (opt) => {
    setError(null);
    setMaterializingId(opt.name);
    try {
      const matches = await apiService.exercises.list({ search: opt.name, limit: 5 });
      const existing = (Array.isArray(matches) ? matches : []).find(
        (e) => (e.name || "").toLowerCase() === (opt.name || "").toLowerCase()
      );
      if (existing) { handlePick(existing); return; }

      const created = await apiService.exercises.create({
        name: opt.name,
        muscles: opt.muscles || [],
        secondaryMuscles: opt.secondaryMuscles || [],
        discipline: opt.discipline || ["strength"],
        equipment: opt.equipment || [],
        difficulty: opt.difficulty || "beginner",
        strain: opt.strain || undefined,
      });
      handlePick(created);
    } catch (err) {
      console.error("Failed to create generated exercise:", err);
      setError(`Couldn't add “${opt.name}”. Pick another option or search instead.`);
    } finally {
      setMaterializingId(null);
    }
  };

  const pickOption = (opt) => {
    if (opt.source === "new") return materializeAndPick(opt);
    return handlePick(opt); // catalog pick already has a real id + strain
  };

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
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-100 px-2">
          {TABS.map((t) => {
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

        {/* Body — panels stay mounted so state survives tab switches */}
        <div className="flex-1 overflow-y-auto p-5">
          {error && (
            <div className="mb-4 flex items-start gap-2 text-sm text-red-700 bg-red-50 rounded-xl p-3">
              <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div className={tab === "browse" ? "" : "hidden"}>
            <BrowseTab
              exerciseId={exerciseId}
              exerciseName={exerciseName}
              onPick={handlePick}
              onPickOption={pickOption}
              materializingId={materializingId}
            />
          </div>

          <div className={tab === "sensei" ? "" : "hidden"}>
            {!sensei && !senseiLoading && (
              <div className="text-center py-8">
                <Sparkles className="w-10 h-10 text-primary-500 mx-auto mb-3" />
                <p className="text-gray-600 mb-4 text-sm">Get AI-picked alternatives.</p>
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
                No options came back. Try the Browse tab instead.
              </p>
            )}
          </div>
        </div>

        {/* Scope step: only reachable when the session is template-linked */}
        {pendingPick && (
          <div className="border-t border-gray-100 p-5 space-y-2.5 bg-gray-50 rounded-b-3xl sm:rounded-b-2xl">
            <p className="text-sm text-gray-700">
              Swap in <span className="font-semibold text-gray-900">{pendingPick.name}</span> — for how long?
            </p>
            <button
              onClick={() => onReplace(pendingPick, { permanent: false })}
              className="w-full py-3 bg-primary-600 text-white rounded-xl font-semibold hover:bg-primary-700"
            >
              Just this session
            </button>
            <button
              onClick={() => onReplace(pendingPick, { permanent: true })}
              className="w-full py-3 bg-white border border-gray-300 text-gray-800 rounded-xl font-semibold hover:border-gray-400"
            >
              From now on
              <span className="block text-xs font-normal text-gray-500 mt-0.5">
                {isCommonTemplate ? "Creates your own copy of this workout" : "Updates this workout"}
              </span>
            </button>
            <button
              onClick={() => setPendingPick(null)}
              className="w-full text-sm text-gray-500 py-1.5 hover:text-gray-700"
            >
              Choose something else
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
