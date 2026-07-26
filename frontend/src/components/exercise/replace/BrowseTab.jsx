import { useState, useEffect } from "react";
import { Search, Loader2, X, Plus } from "lucide-react";
import { apiService } from "@/services/api";
import useExerciseSearch from "@/hooks/useExerciseSearch";
import ExerciseResultRow from "./ExerciseResultRow";
import SenseiPicksSection from "./SenseiPicksSection";
import InlineCreateExercise from "./InlineCreateExercise";

/**
 * Unified Browse tab: search on top; while the query is empty it shows
 * Similar exercises + auto-loaded Sensei picks. Searching replaces the
 * sections with server results, and a missing name can be added on the
 * fly via InlineCreateExercise.
 */
export default function BrowseTab({ exerciseId, exerciseName, onPick, onPickOption, materializingId }) {
  const [query, setQuery] = useState("");
  const [creating, setCreating] = useState(false);
  const { results, isLoading, error } = useExerciseSearch(query, { excludeId: exerciseId });

  const term = query.trim();
  const searching = term.length >= 2;

  // --- Similar section (only when the session exercise has a real catalog id) ---
  const [similar, setSimilar] = useState(null); // null = not loaded, [] = loaded empty
  const [similarLoading, setSimilarLoading] = useState(false);

  useEffect(() => {
    if (!exerciseId) return;
    let cancelled = false;
    setSimilarLoading(true);
    apiService.exercises
      .similar(exerciseId, 8)
      .then((list) => { if (!cancelled) setSimilar(Array.isArray(list) ? list : []); })
      .catch(() => { if (!cancelled) setSimilar([]); })
      .finally(() => { if (!cancelled) setSimilarLoading(false); });
    return () => { cancelled = true; };
  }, [exerciseId]);

  const exactMatch = results.some((ex) => (ex.name || "").toLowerCase() === term.toLowerCase());
  const showAddRow = searching && term.length >= 3 && !isLoading && !exactMatch && !creating;

  if (creating) {
    return (
      <InlineCreateExercise
        initialName={term}
        onCreated={(ex) => { setCreating(false); onPick(ex); }}
        onCancel={() => setCreating(false)}
      />
    );
  }

  return (
    <div className="space-y-5">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search for a replacement…"
          className="w-full pl-10 pr-9 py-2.5 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
        />
        {isLoading && (
          <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 animate-spin" />
        )}
        {!isLoading && query && (
          <button
            onClick={() => setQuery("")}
            className="absolute right-3 top-1/2 -translate-y-1/2 p-0.5 text-gray-400 hover:text-gray-600"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {!searching && (
        <>
          {exerciseId && (
            <div>
              <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Similar</h4>
              {similarLoading && (
                <div className="space-y-3">
                  {Array(3).fill(0).map((_, i) => (
                    <div key={i} className="animate-pulse bg-gray-100 h-16 rounded-xl" />
                  ))}
                </div>
              )}
              {!similarLoading && similar && similar.length > 0 && (
                <div className="space-y-3">
                  {similar.map((ex) => (
                    <ExerciseResultRow
                      key={ex._id || ex.id}
                      name={ex.name}
                      subtitle={(ex.muscles || []).join(", ")}
                      onPick={() => onPick(ex)}
                    />
                  ))}
                </div>
              )}
              {!similarLoading && similar && similar.length === 0 && (
                <p className="text-sm text-gray-500">No similar exercises found.</p>
              )}
            </div>
          )}

          <SenseiPicksSection
            exerciseId={exerciseId}
            exerciseName={exerciseName}
            onPickOption={onPickOption}
            materializingId={materializingId}
          />
        </>
      )}

      {searching && (
        <div className="space-y-3">
          {error && <p className="text-sm text-red-600">{error}</p>}
          {results.map((ex) => (
            <ExerciseResultRow
              key={ex._id || ex.id}
              name={ex.name}
              subtitle={(ex.muscles || []).join(", ")}
              onPick={() => onPick(ex)}
            />
          ))}
          {!isLoading && !error && results.length === 0 && (
            <p className="text-center text-gray-500 py-4 text-sm">No exercises found for “{term}”.</p>
          )}
          {showAddRow && (
            <button
              onClick={() => setCreating(true)}
              className={`w-full border border-dashed rounded-xl p-4 flex items-center gap-2 text-left transition-colors ${
                results.length === 0
                  ? "border-primary-400 bg-primary-50 text-primary-700 hover:bg-primary-100"
                  : "border-gray-300 text-gray-600 hover:border-gray-400"
              }`}
            >
              <Plus className="w-4 h-4 shrink-0" />
              <span className="font-medium truncate">Add “{term}”</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
}
