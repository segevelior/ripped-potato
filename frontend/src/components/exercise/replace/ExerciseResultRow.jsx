import { ArrowRight } from "lucide-react";

export default function ExerciseResultRow({ name, subtitle, badge, onPick, disabled }) {
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
