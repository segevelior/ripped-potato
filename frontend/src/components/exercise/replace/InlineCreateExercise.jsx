import { useState, useEffect, useRef } from "react";
import { Loader2, Sparkles } from "lucide-react";
import { apiService } from "@/services/api";
import { aiService } from "@/services/aiService";

// Same catalog vocabulary as CreateExercise.jsx / the server-side VALID_MUSCLES.
const MUSCLES = ["chest", "back", "shoulders", "biceps", "triceps", "forearms", "abs", "hip_flexors", "glutes", "quads", "hamstrings", "calves", "full_body"];

/**
 * Mid-workout "add a missing exercise on the fly" mini-form.
 * Streams Sensei enrichment for the typed name; the user can correct
 * name/muscles/equipment while description/discipline/strain are applied
 * silently. Saves to the user's catalog, then hands the created exercise
 * back so it flows through the normal replace pipeline.
 */
export default function InlineCreateExercise({ initialName, onCreated, onCancel }) {
  const [name, setName] = useState(initialName);
  const [suggestedName, setSuggestedName] = useState(null);
  const [muscles, setMuscles] = useState([]);
  const [equipment, setEquipment] = useState("");
  const [streaming, setStreaming] = useState(true);
  const [streamFailed, setStreamFailed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  // Fields we apply silently on save; strain arrives snake_case from the
  // stream but the Exercise model stores camelCase — mapped in save().
  const autoRef = useRef({ description: "", discipline: null, strain: null, difficulty: null });
  const touchedRef = useRef({ muscles: false, equipment: false });
  const abortRef = useRef(null);

  useEffect(() => {
    setStreaming(true);
    setStreamFailed(false);
    abortRef.current = aiService.streamSuggestExercise(
      initialName,
      (field, value) => {
        if (field === "suggested_name" && value && value.toLowerCase() !== initialName.toLowerCase()) {
          setSuggestedName(value);
        } else if (field === "muscles" && Array.isArray(value) && !touchedRef.current.muscles) {
          setMuscles(value.filter((m) => MUSCLES.includes(m)));
        } else if (field === "equipment" && Array.isArray(value) && !touchedRef.current.equipment) {
          setEquipment(value.join(", "));
        } else if (field === "description") {
          autoRef.current.description = value;
        } else if (field === "discipline") {
          autoRef.current.discipline = value;
        } else if (field === "difficulty") {
          autoRef.current.difficulty = value;
        } else if (field === "strain") {
          autoRef.current.strain = value;
        }
      },
      () => setStreaming(false),
      () => { setStreaming(false); setStreamFailed(true); }
    );
    return () => { if (abortRef.current) abortRef.current(); };
  }, [initialName]);

  const toggleMuscle = (m) => {
    touchedRef.current.muscles = true;
    setMuscles((prev) => (prev.includes(m) ? prev.filter((x) => x !== m) : [...prev, m]));
  };

  const valid = name.trim().length > 0 && muscles.length > 0;

  const save = async () => {
    if (!valid || saving) return;
    if (abortRef.current) abortRef.current(); // stop any in-flight stream
    setSaving(true);
    setError(null);
    try {
      // Dedup by exact name so we don't pollute the catalog with near-copies.
      const matches = await apiService.exercises.list({ search: name.trim(), limit: 5 });
      const existing = (Array.isArray(matches) ? matches : []).find(
        (e) => (e.name || "").toLowerCase() === name.trim().toLowerCase()
      );
      if (existing) { onCreated(existing); return; }

      const s = autoRef.current.strain;
      const created = await apiService.exercises.create({
        name: name.trim(),
        muscles,
        secondaryMuscles: [],
        discipline: autoRef.current.discipline?.length ? autoRef.current.discipline : ["strength"],
        equipment: equipment.split(",").map((x) => x.trim()).filter(Boolean),
        difficulty: autoRef.current.difficulty || "beginner",
        description: autoRef.current.description || undefined,
        strain: s
          ? { intensity: s.intensity, load: s.load, durationType: s.duration_type, typicalVolume: s.typical_volume }
          : undefined,
      });
      onCreated(created);
    } catch (err) {
      console.error("Failed to create exercise:", err);
      setError("Couldn't save. Check your connection and try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="border border-gray-200 rounded-xl p-4 space-y-3 bg-gray-50">
      <div className="flex items-center gap-1.5 text-sm text-gray-600">
        {streaming ? (
          <>
            <Loader2 className="w-3.5 h-3.5 animate-spin text-primary-500" />
            <span>The Sensei is filling in details…</span>
          </>
        ) : streamFailed ? (
          <span className="text-gray-500">Sensei unavailable — fill in manually.</span>
        ) : (
          <>
            <Sparkles className="w-3.5 h-3.5 text-primary-500" />
            <span>Review and save your new exercise.</span>
          </>
        )}
      </div>

      <div>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Exercise name"
          className="w-full px-3 py-2.5 border border-gray-300 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent font-medium"
        />
        {suggestedName && suggestedName.toLowerCase() !== name.trim().toLowerCase() && (
          <button
            onClick={() => { setName(suggestedName); setSuggestedName(null); }}
            className="mt-1.5 text-xs text-primary-600 hover:underline"
          >
            Did you mean: <span className="font-semibold">{suggestedName}</span>?
          </button>
        )}
      </div>

      <div>
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Muscles</p>
        <div className="flex flex-wrap gap-1.5">
          {MUSCLES.map((m) => (
            <button
              key={m}
              onClick={() => toggleMuscle(m)}
              className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${
                muscles.includes(m)
                  ? "bg-primary-600 text-white border-primary-600"
                  : "bg-white text-gray-600 border-gray-200 hover:border-gray-300"
              }`}
            >
              {m.replace("_", " ")}
            </button>
          ))}
        </div>
      </div>

      <div>
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Equipment</p>
        <input
          type="text"
          value={equipment}
          onChange={(e) => { touchedRef.current.equipment = true; setEquipment(e.target.value); }}
          placeholder="e.g. pull-up bar, rings (leave empty for none)"
          className="w-full px-3 py-2.5 border border-gray-300 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent text-base sm:text-sm"
        />
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex gap-2 pt-1">
        <button
          onClick={onCancel}
          disabled={saving}
          className="flex-1 py-2.5 bg-white border border-gray-300 text-gray-700 rounded-xl font-medium hover:border-gray-400 disabled:opacity-50"
        >
          Cancel
        </button>
        <button
          onClick={save}
          disabled={!valid || saving}
          className="flex-1 py-2.5 bg-primary-600 text-white rounded-xl font-semibold hover:bg-primary-700 disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {saving && <Loader2 className="w-4 h-4 animate-spin" />}
          Add &amp; swap in
        </button>
      </div>
    </div>
  );
}
