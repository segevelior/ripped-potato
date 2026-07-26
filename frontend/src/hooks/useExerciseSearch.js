import { useState, useEffect, useRef } from "react";
import { apiService } from "@/services/api";

/**
 * Debounced server-side exercise search over the catalog.
 *
 * Searches via apiService.exercises.list({ search, limit }) so it never
 * downloads the whole catalog. Out-of-order responses (an older keystroke
 * resolving after a newer one) are dropped.
 *
 * @param {string} query - raw input value; terms shorter than 2 chars return no results
 * @param {{ excludeId?: string, limit?: number }} [options]
 * @returns {{ results: Object[], isLoading: boolean, error: string|null }}
 */
export default function useExerciseSearch(query, { excludeId, limit = 20 } = {}) {
  const [results, setResults] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const reqIdRef = useRef(0);

  useEffect(() => {
    const term = query.trim();
    if (term.length < 2) {
      setResults([]);
      setIsLoading(false);
      setError(null);
      return;
    }

    setIsLoading(true);
    setError(null);
    const reqId = ++reqIdRef.current;

    const timeoutId = setTimeout(async () => {
      try {
        const list = await apiService.exercises.list({ search: term, limit });
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
  }, [query, excludeId, limit]);

  return { results, isLoading, error };
}
