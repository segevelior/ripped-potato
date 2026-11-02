import { useEffect, useRef, useState } from "react";
import { Check, Sparkles, AlertCircle } from "lucide-react";
import { aiService } from "@/services/aiService";

const EXAMPLES = [
  "bench 60kg x10, 70 x8, 75 x6",
  "pullups, did 8 then 7 then 6",
  "bulgarian split squats 3x10 each leg, 12kg dumbbells",
];

const volumeLabel = (sets) => {
  if (!sets.length) return null;
  // Distance/time work comes back with 0 reps (the distance is in the notes).
  if (sets.every((s) => !s.reps)) return `${sets.length} ${sets.length === 1 ? "set" : "sets"}`;
  const sameReps = sets.every((s) => s.reps === sets[0].reps);
  return sameReps ? `${sets.length} × ${sets[0].reps}` : `${sets.length} sets · ${sets.map((s) => s.reps).join(" / ")}`;
};

// Read-only copy of LiveSession's exercise card, so the preview shows exactly
// what will land in the session.
function PreviewCard({ name, notes, sets }) {
  const rows = sets.length ? sets : [{ weight_kg: 0, reps: 0, open: true }];
  const done = sets.length;
  return (
    <div className="bg-white rounded-3xl overflow-hidden ring-1 ring-gray-200">
      <div className={`p-4 ${done ? "bg-green-50" : "bg-white"}`}>
        <div className="flex items-center justify-between mb-1 gap-2">
          <h3 className="text-lg font-bold text-gray-900 flex-1 min-w-0">{name}</h3>
          <div className={`px-2 py-1 rounded-full text-xs font-semibold shrink-0 ${
            done ? "bg-green-500 text-white" : "bg-gray-100 text-gray-600"
          }`}>
            {done}/{rows.length}
          </div>
        </div>
        {volumeLabel(sets) && <p className="text-sm font-medium text-primary-600">{volumeLabel(sets)}</p>}
        {notes && <p className="text-sm text-gray-500">{notes}</p>}
      </div>
      <div className="flex items-center h-8 px-4 bg-gray-100 text-xs text-gray-500 font-medium">
        <div className="w-8 shrink-0 text-center">SET</div>
        <div className="flex-1 text-center">WEIGHT</div>
        <div className="flex-1 text-center">REPS</div>
      </div>
      <div className="p-2 space-y-2">
        {rows.map((s, i) => (
          <div key={i} className={`flex items-center h-12 px-3 rounded-xl ${s.open ? "bg-gray-50" : "bg-green-50"}`}>
            <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm shrink-0 ${
              s.open ? "bg-white text-gray-600 border border-gray-200" : "bg-green-500 text-white"
            }`}>
              {s.open ? i + 1 : <Check className="w-4 h-4" />}
            </div>
            <div className="flex-1 text-center">
              <span className="font-semibold text-base">{s.weight_kg || 0}</span>
              <span className="text-xs text-gray-400 ml-0.5">kg</span>
            </div>
            <div className="flex-1 text-center">
              <span className="font-semibold text-base">{s.reps || 0}</span>
              <span className="text-xs text-gray-400 ml-0.5">reps</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * "Describe it" tab of the live-session add drawer: the athlete writes ONE
 * exercise in free text, the Sensei parses it, and the preview card is added
 * on confirm via onAdd({ exercise_id, name, notes, sets, raw_note }).
 * A name the catalog doesn't know is only created on confirm.
 */
export default function DescribeExercisePanel({ onAdd }) {
  const [text, setText] = useState("");
  const [phase, setPhase] = useState("compose"); // compose | reading | preview | adding
  const [result, setResult] = useState(null);
  const [choice, setChoice] = useState(null);    // candidate {id, name}, or "own" to save as their own exercise
  const [ownName, setOwnName] = useState("");
  const [error, setError] = useState(null);
  const abortRef = useRef(null);
  const mountedRef = useRef(true);

  // Closing the drawer unmounts the panel: abort a pending read, and never
  // add an exercise whose commit finishes after the athlete closed it.
  useEffect(() => () => {
    mountedRef.current = false;
    abortRef.current?.abort();
  }, []);

  const keepAsOwn = () => {
    setChoice("own");
    setOwnName(result.name);
  };

  const read = async () => {
    const note = text.trim();
    if (!note) return;
    setError(null);
    setPhase("reading");
    abortRef.current?.abort();
    abortRef.current = new AbortController();
    try {
      const res = await aiService.describeExercise(note, abortRef.current.signal);
      if (res.status === "unreadable") {
        setError(res.message || "Couldn't find an exercise in that. Try rephrasing.");
        setPhase("compose");
        return;
      }
      if (!mountedRef.current) return;
      setResult({ ...res, raw_note: note });
      setChoice(null);
      setOwnName("");
      setPhase("preview");
    } catch (e) {
      if (e?.name === "AbortError" || !mountedRef.current) return;
      setError("Sensei couldn't read that just now. Try again, or search the catalog instead.");
      setPhase("compose");
    }
  };

  const add = async () => {
    if (!result) return;
    setError(null);
    const ownChosen = choice === "own" || result.status === "new";
    let exerciseId = result.exercise_id || null;
    let name = result.name;
    if (choice && choice !== "own") {
      exerciseId = choice.id;
      name = choice.name;
    } else if (ownChosen) {
      // "new", or the athlete rejected the match/suggestions for their own name.
      const ownLabel = (choice === "own" ? ownName : result.name).trim();
      setPhase("adding");
      try {
        const created = await aiService.commitDescribedExercise({
          name: ownLabel,
          muscles: result.muscles,
          discipline: result.discipline,
          equipment: result.equipment,
        });
        if (!mountedRef.current) return;
        exerciseId = created.exercise_id;
        name = created.name;
      } catch {
        if (!mountedRef.current) return;
        setError(`Couldn't add “${ownLabel}”. Try again, or search the catalog instead.`);
        setPhase("preview");
        return;
      }
    }
    onAdd({
      exercise_id: exerciseId,
      name,
      notes: result.notes,
      sets: result.sets,
      raw_note: result.raw_note,
      discipline: result.discipline?.[0] || null,
    });
  };

  if (phase === "reading") {
    return (
      <div className="flex items-center justify-center gap-2 py-12 text-sm text-gray-500">
        <span className="w-4 h-4 rounded-full border-2 border-primary-100 border-t-primary-500 animate-spin" />
        Sensei is reading your note…
      </div>
    );
  }

  if ((phase === "preview" || phase === "adding") && result) {
    const isAmbiguous = result.status === "ambiguous";
    const shownName = choice === "own"
      ? (ownName.trim() || result.name)
      : choice ? choice.name : result.name;
    const canAdd = phase !== "adding" && (!isAmbiguous || choice) && (choice !== "own" || ownName.trim());
    return (
      <div className="space-y-3">
        <div>
          <div className="flex items-center gap-1.5 text-xs font-bold text-primary-700">
            <span className="w-[18px] h-[18px] rounded-md bg-primary-500 text-white flex items-center justify-center">
              <Sparkles className="w-3 h-3" />
            </span>
            Sensei understood
          </div>
          <p className="text-xs text-gray-500 italic mt-1">“{result.raw_note}”</p>
        </div>

        <PreviewCard name={shownName} notes={result.notes} sets={result.sets} />

        {isAmbiguous && (
          <div className="bg-amber-50 rounded-xl p-3 text-sm text-amber-900 space-y-2">
            <p>Not sure which exercise this is. Did you mean:</p>
            <div className="flex flex-wrap gap-2">
              {result.candidates.map((c) => (
                <button
                  key={c.id}
                  onClick={() => setChoice(c)}
                  className={`px-3 py-1.5 rounded-full text-xs font-semibold ${
                    choice?.id === c.id ? "bg-amber-600 text-white" : "bg-white text-amber-900"
                  }`}
                >
                  {c.name}
                </button>
              ))}
              <button
                onClick={keepAsOwn}
                className={`px-3 py-1.5 rounded-full text-xs font-semibold ${
                  choice === "own" ? "bg-amber-600 text-white" : "bg-white text-amber-900"
                }`}
              >
                None of these, save my own
              </button>
            </div>
          </div>
        )}
        {result.status === "matched" && choice !== "own" && (
          <button onClick={keepAsOwn} className="text-sm text-gray-500 underline underline-offset-2">
            Not {result.name}? Save it as my own exercise
          </button>
        )}
        {choice === "own" && (
          <div className="space-y-1">
            <label htmlFor="describe-own-name" className="text-xs font-semibold text-gray-600">
              Save as your own exercise, named
            </label>
            <input
              id="describe-own-name"
              value={ownName}
              maxLength={100}
              onChange={(e) => setOwnName(e.target.value)}
              className="w-full rounded-xl border border-gray-300 px-3 py-2 text-base focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </div>
        )}
        {result.status === "new" && (
          <p className="bg-indigo-50 text-indigo-900 rounded-xl p-3 text-sm">
            Not in the catalog yet. It will be added as your own exercise.
          </p>
        )}
        {result.multiple_exercises && (
          <p className="bg-gray-50 text-gray-600 rounded-xl p-3 text-sm">
            Looks like more than one exercise. This adds the first one; add the others one at a time.
          </p>
        )}
        {!result.sets.length && (
          <p className="text-xs text-gray-500">No sets in your note. Fill them in on the card.</p>
        )}
        {error && (
          <div className="flex items-start gap-2 text-sm text-red-700 bg-red-50 rounded-xl p-3">
            <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
            {error}
          </div>
        )}

        <button
          onClick={add}
          disabled={!canAdd}
          className="w-full py-3 bg-primary-500 text-white rounded-xl font-semibold disabled:opacity-50"
        >
          {phase === "adding" ? "Adding…" : "Add to session"}
        </button>
        <button
          onClick={() => { setPhase("compose"); setError(null); }}
          disabled={phase === "adding"}
          className="w-full py-2.5 bg-gray-100 text-gray-700 rounded-xl font-semibold"
        >
          Edit note
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="rounded-2xl border-2 border-primary-500 px-3 py-2">
        <textarea
          id="describe-exercise-note"
          autoFocus
          rows={3}
          maxLength={500}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="e.g. bench 60kg x10, 70 x8, 75 x6"
          aria-label="Describe the exercise you did"
          className="w-full resize-none bg-transparent text-base text-gray-900 placeholder:text-gray-400 focus:outline-none"
        />
      </div>
      <div className="flex flex-wrap gap-1.5">
        {EXAMPLES.map((ex) => (
          <button
            key={ex}
            onClick={() => setText(ex)}
            className="px-2.5 py-1 rounded-full bg-gray-100 text-xs text-gray-600 hover:bg-gray-200"
          >
            {ex}
          </button>
        ))}
      </div>
      {error && (
        <div className="flex items-start gap-2 text-sm text-red-700 bg-red-50 rounded-xl p-3">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
          {error}
        </div>
      )}
      <button
        onClick={read}
        disabled={!text.trim()}
        className="w-full py-3 bg-primary-500 text-white rounded-xl font-semibold flex items-center justify-center gap-2 disabled:opacity-50"
      >
        <Sparkles className="w-4 h-4" />
        Fill in with Sensei
      </button>
    </div>
  );
}
