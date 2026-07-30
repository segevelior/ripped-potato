import React from "react";
import { BLOCK_TYPES, BLOCK_TYPE_META } from "@/constants/blocks";

// Sensible starting values applied when the author switches a block's type
// and the relevant fields are still empty. Tabata gets its 8x20/10 convention.
const TYPE_DEFAULTS = {
  straight_sets: { rounds: 1 },
  circuit: { rounds: 3, rest_seconds: 60 },
  tabata: { rounds: 8, work_seconds: 20, rest_seconds: 10 },
  amrap: { duration_seconds: 600 },
  emom: { rounds: 10, work_seconds: 40 },
  interval: { rounds: 4, rest_seconds: 90 },
  duration: { duration_seconds: 1200 },
};

const TYPE_LABELS = {
  straight_sets: "Sets × reps",
  circuit: "Circuit",
  tabata: "Tabata",
  amrap: "AMRAP",
  emom: "EMOM",
  interval: "Intervals",
  duration: "Continuous",
};

const numberOrNull = (raw) => {
  const value = parseInt(raw, 10);
  return Number.isFinite(value) && value >= 0 ? value : null;
};

const SecondsField = ({ label, value, onChange }) => (
  <div className="w-24">
    <label className="text-[10px] font-semibold text-gray-400 uppercase mb-1 block">{label}</label>
    <div className="relative">
      <input
        type="number"
        min="0"
        value={value ?? ""}
        onChange={(e) => onChange(numberOrNull(e.target.value))}
        className="w-full bg-white border-none rounded-lg text-sm py-2 pl-3 pr-7 font-medium text-gray-700 focus:ring-2 focus:ring-[#FE755D]/20 shadow-sm"
        placeholder="—"
      />
      <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-gray-400">sec</span>
    </div>
  </div>
);

/**
 * Structural controls for a session block: type select plus the fields that
 * matter for that type (rounds / work / rest / total duration) and optional
 * block-level instructions. Shared by CreateSessionTemplate and
 * CreateSessionModal so the two editors can't drift.
 *
 * @param {{block: Object, onUpdate: (patch: Object) => void}} props
 *   onUpdate merges a partial block patch in one state update (a field-by-field
 *   API would drop keys when several fields change in the same tick, e.g. on
 *   type switch).
 */
export default function BlockStructureControls({ block, onUpdate }) {
  const type = block.type || "straight_sets";
  const fields = BLOCK_TYPE_META[type]?.fields || [];

  const handleTypeChange = (nextType) => {
    const patch = { type: nextType };
    const defaults = TYPE_DEFAULTS[nextType] || {};
    for (const [field, value] of Object.entries(defaults)) {
      if (block[field] == null || (field === "rounds" && (block.rounds || 1) <= 1)) {
        patch[field] = value;
      }
    }
    onUpdate(patch);
  };

  return (
    <div className="px-4 py-3 bg-gray-50/50 border-b border-gray-100">
      <div className="flex flex-wrap items-end gap-3">
        <div className="w-36">
          <label className="text-[10px] font-semibold text-gray-400 uppercase mb-1 block">Block type</label>
          <select
            value={type}
            onChange={(e) => handleTypeChange(e.target.value)}
            className="w-full bg-white border-none rounded-lg text-sm py-2 px-3 font-medium text-gray-700 focus:ring-2 focus:ring-[#FE755D]/20 shadow-sm appearance-none cursor-pointer"
          >
            {BLOCK_TYPES.map((t) => (
              <option key={t} value={t}>{TYPE_LABELS[t] || t}</option>
            ))}
          </select>
        </div>

        {fields.includes("rounds") && (
          <div className="w-20">
            <label className="text-[10px] font-semibold text-gray-400 uppercase mb-1 block">
              {type === "emom" ? "Minutes" : "Rounds"}
            </label>
            <input
              type="number"
              min="1"
              value={block.rounds ?? 1}
              onChange={(e) => onUpdate({ rounds: Math.max(1, parseInt(e.target.value, 10) || 1) })}
              className="w-full bg-white border-none rounded-lg text-sm py-2 px-3 font-medium text-gray-700 focus:ring-2 focus:ring-[#FE755D]/20 shadow-sm"
            />
          </div>
        )}

        {fields.includes("work_seconds") && (
          <SecondsField
            label="Work"
            value={block.work_seconds}
            onChange={(value) => onUpdate({ work_seconds: value })}
          />
        )}

        {fields.includes("rest_seconds") && (
          <SecondsField
            label="Rest"
            value={block.rest_seconds}
            onChange={(value) => onUpdate({ rest_seconds: value })}
          />
        )}

        {fields.includes("duration_seconds") && (
          <SecondsField
            label={type === "amrap" ? "Time cap" : "Duration"}
            value={block.duration_seconds}
            onChange={(value) => onUpdate({ duration_seconds: value })}
          />
        )}
      </div>

      {type !== "straight_sets" && (
        <input
          type="text"
          placeholder="Block instructions (e.g. stay below pump, all-out on work intervals)..."
          value={block.instructions || ""}
          onChange={(e) => onUpdate({ instructions: e.target.value })}
          className="mt-3 w-full bg-white border-none rounded-lg text-sm py-2 px-3 text-gray-600 placeholder-gray-400 focus:ring-2 focus:ring-[#FE755D]/20 shadow-sm"
        />
      )}
    </div>
  );
}
