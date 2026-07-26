import { Calendar, Clock, Link2, Plus } from 'lucide-react';

/**
 * CalendarPreviewCard — renders the dry-run preview of schedule_to_calendar
 * as a structured card in chat.
 *
 * Usage in AI response (emitted by the orchestrator, never by the model):
 * <calendar-preview payload="<base64 JSON>"></calendar-preview>
 *
 * The tag must be explicitly closed: rehype-raw (parse5) ignores the
 * self-closing slash on unknown elements, and a dangling open tag would
 * swallow all following siblings as children.
 */
function decodePayload(payload) {
  try {
    return JSON.parse(atob(payload));
  } catch {
    return null;
  }
}

function formatDate(isoDate) {
  const d = new Date(`${isoDate}T00:00:00`);
  if (Number.isNaN(d.getTime())) return isoDate;
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

const TYPE_LABELS = { workout: 'Workout', deload: 'Deload', rest: 'Rest day' };

export default function CalendarPreviewCard({ payload }) {
  const card = decodePayload(payload);
  if (!card || !card.title) return null;

  const { title, date, relativeDay, type, durationMin, link = {}, exercises = [] } = card;

  return (
    <div className="my-3 rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden not-prose">
      <div className="px-4 pt-3 pb-2 bg-gray-50 border-b border-gray-100">
        <div className="text-[11px] uppercase tracking-wide text-gray-400 font-medium mb-1">
          Preview — not scheduled yet
        </div>
        <div className="flex items-start gap-2">
          <Calendar className="w-4 h-4 text-primary-600 mt-0.5 shrink-0" />
          <div className="min-w-0 flex-1">
            <div className="text-sm font-semibold text-gray-900 truncate">{title}</div>
            <div className="flex flex-wrap items-center gap-1.5 mt-1">
              {relativeDay && (
                <span className="px-1.5 py-0.5 rounded-full bg-primary-50 text-primary-700 text-xs font-medium">
                  {relativeDay}
                </span>
              )}
              {date && <span className="text-xs text-gray-500">{formatDate(date)}</span>}
              {type && (
                <span className="px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-600 text-xs">
                  {TYPE_LABELS[type] || type}
                </span>
              )}
              {durationMin != null && (
                <span className="inline-flex items-center gap-0.5 text-xs text-gray-500">
                  <Clock className="w-3 h-3" /> ~{durationMin} min
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* divs, not p/ul: react-markdown puts this element inside a <p>, and
          nested p/ul there trips React's validateDOMNesting in dev */}
      {exercises.length > 0 && (
        <div className="px-4 py-2 divide-y divide-gray-50">
          {exercises.map((ex, i) => (
            <div key={i} className="py-1.5 flex items-center justify-between gap-2 text-sm">
              <div className="min-w-0 flex-1">
                <span className="text-gray-800">{ex.name}</span>
                {ex.isNew && (
                  <span className="ml-1.5 px-1.5 py-0.5 rounded-full bg-amber-50 text-amber-700 text-[11px] font-medium">
                    new
                  </span>
                )}
                {ex.matchedFrom && (
                  <span className="ml-1.5 text-xs text-gray-400">
                    matched from &ldquo;{ex.matchedFrom}&rdquo;
                  </span>
                )}
              </div>
              {ex.volume && <span className="text-xs text-gray-500 tabular-nums shrink-0">{ex.volume}</span>}
            </div>
          ))}
        </div>
      )}

      {link.mode === 'links_existing' && (
        <div className="px-4 py-2 border-t border-gray-100 flex items-center gap-1.5 text-xs text-gray-500">
          <Link2 className="w-3 h-3 shrink-0" />
          <span>
            Links your existing workout <span className="font-medium text-gray-700">{link.name}</span> — nothing new is created
          </span>
        </div>
      )}
      {link.mode === 'creates_new' && (
        <div className="px-4 py-2 border-t border-gray-100 flex items-center gap-1.5 text-xs text-gray-500">
          <Plus className="w-3 h-3 shrink-0" />
          <span>
            Creates a new library workout <span className="font-medium text-gray-700">{link.name}</span>
          </span>
        </div>
      )}
    </div>
  );
}
