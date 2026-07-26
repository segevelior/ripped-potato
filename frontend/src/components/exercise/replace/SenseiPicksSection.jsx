import { useState, useEffect, useRef } from "react";
import { Sparkles, AlertTriangle, Plus } from "lucide-react";
import { aiService } from "@/services/aiService";
import ExerciseResultRow from "./ExerciseResultRow";

/**
 * Auto-loading "Sensei picks" section for the Browse tab.
 * Fires one substitute-rank call per mount (i.e. per modal open) and offers
 * cancel/regenerate. Works by exercise_name alone when there's no catalog id.
 */
export default function SenseiPicksSection({ exerciseId, exerciseName, onPickOption, materializingId }) {
  const [sensei, setSensei] = useState(null); // { options?, routed?, message?, fallback? }
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const abortRef = useRef(null);

  const run = () => {
    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);
    setSensei(null);
    setError(null);
    aiService
      .rankSubstitutes({ exercise_id: exerciseId, exercise_name: exerciseName, count: 5 }, controller.signal)
      .then((res) => setSensei(res || { options: [] }))
      .catch((err) => {
        if (err?.name === "AbortError") return;
        setError("The Sensei couldn't fetch options.");
        setSensei({ options: [] });
      })
      .finally(() => {
        if (abortRef.current === controller) abortRef.current = null;
        setLoading(false);
      });
  };

  useEffect(() => {
    run();
    return () => { if (abortRef.current) abortRef.current.abort(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const cancel = () => {
    if (abortRef.current) abortRef.current.abort();
    abortRef.current = null;
    setLoading(false);
  };

  return (
    <div>
      <div className="flex items-center gap-1.5 mb-2">
        <Sparkles className="w-4 h-4 text-primary-500" />
        <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Sensei picks</h4>
      </div>

      {loading && (
        <div className="space-y-3">
          {Array(3).fill(0).map((_, i) => (
            <div key={i} className="animate-pulse bg-gray-100 h-16 rounded-xl" />
          ))}
          <button onClick={cancel} className="w-full text-sm text-gray-500 py-1 underline">Cancel</button>
        </div>
      )}

      {error && !loading && (
        <p className="text-sm text-gray-500">
          {error}{" "}
          <button onClick={run} className="text-primary-600 underline">Try again</button>
        </p>
      )}

      {sensei?.routed === "safety" && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-800">
          <AlertTriangle className="w-5 h-5 mb-2" />
          {sensei.message}
        </div>
      )}

      {sensei && !sensei.routed && sensei.options?.length > 0 && (
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
              onPick={() => onPickOption(opt)}
            />
          ))}
          <button onClick={run} className="w-full text-sm text-gray-500 py-1 hover:text-gray-700">
            Regenerate picks
          </button>
        </div>
      )}

      {sensei && !sensei.routed && !error && sensei.options?.length === 0 && !loading && (
        <p className="text-sm text-gray-500">No picks came back — search for a replacement below.</p>
      )}
    </div>
  );
}
