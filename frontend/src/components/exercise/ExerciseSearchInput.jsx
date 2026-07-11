import { useState, useEffect, useRef } from "react";
import { Search, Loader2, X } from "lucide-react";
import { apiService } from "@/services/api";

/**
 * Debounced type-to-search combobox over the exercise catalog.
 *
 * Searches server-side via apiService.exercises.list({ search, limit }) so it never
 * downloads the whole catalog (works at scale). Matching quality upgrades to Atlas
 * $search transparently once the RAG search index lands — no change needed here.
 *
 * @param {(exercise: Object) => void} onSelect - called with the full catalog exercise
 * @param {string} [placeholder]
 * @param {string} [excludeId] - an exercise id to hide from results (e.g. the one being replaced)
 * @param {boolean} [autoFocus]
 */
export default function ExerciseSearchInput({ onSelect, placeholder = "Search exercises...", excludeId, autoFocus }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const reqIdRef = useRef(0);

  useEffect(() => {
    const term = query.trim();
    if (term.length < 2) {
      setResults([]);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);
    const reqId = ++reqIdRef.current;

    const timeoutId = setTimeout(async () => {
      try {
        const list = await apiService.exercises.list({ search: term, limit: 20 });
        // Ignore out-of-order responses (a newer keystroke already fired).
        if (reqId !== reqIdRef.current) return;
        const filtered = (Array.isArray(list) ? list : []).filter(
          (ex) => (ex._id || ex.id) !== excludeId
        );
        setResults(filtered);
      } catch (err) {
        if (reqId !== reqIdRef.current) return;
        console.error("Exercise search failed:", err);
        setError("Search failed. Try again.");
        setResults([]);
      } finally {
        if (reqId === reqIdRef.current) setIsLoading(false);
      }
    }, 250);

    return () => clearTimeout(timeoutId);
  }, [query, excludeId]);

  const handleSelect = (exercise) => {
    setQuery("");
    setResults([]);
    onSelect(exercise);
  };

  const showEmpty = !isLoading && !error && query.trim().length >= 2 && results.length === 0;

  return (
    <div className="w-full">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input
          type="text"
          value={query}
          autoFocus={autoFocus}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={placeholder}
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

      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}

      {results.length > 0 && (
        <ul className="mt-2 max-h-64 overflow-y-auto rounded-xl border border-gray-200 divide-y divide-gray-100">
          {results.map((ex) => (
            <li key={ex._id || ex.id}>
              <button
                onClick={() => handleSelect(ex)}
                className="w-full text-left px-4 py-3 hover:bg-gray-50 flex items-center justify-between gap-3"
              >
                <div className="min-w-0">
                  <p className="font-medium text-gray-900 truncate">{ex.name}</p>
                  {(ex.muscles || []).length > 0 && (
                    <p className="text-xs text-gray-500 truncate">{ex.muscles.join(", ")}</p>
                  )}
                </div>
                {ex.strain?.typicalVolume && (
                  <span className="shrink-0 text-xs text-gray-400">{ex.strain.typicalVolume}</span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}

      {showEmpty && (
        <p className="mt-3 text-sm text-gray-500 text-center py-4">No exercises found for “{query.trim()}”.</p>
      )}
    </div>
  );
}
