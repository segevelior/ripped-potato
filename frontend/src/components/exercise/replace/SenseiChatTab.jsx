import { useState, useEffect, useRef } from "react";
import { Sparkles, AlertTriangle, Plus, Send, Loader2 } from "lucide-react";
import { aiService } from "@/services/aiService";
import ExerciseResultRow from "./ExerciseResultRow";

// Conversation starters for the empty state — this is where "why do you want
// to swap" lives now that the modal has no reason-chip row.
const STARTERS = [
  "My shoulder hurts on these",
  "I don't have the equipment",
  "Want something harder",
  "Want some variety",
];

/**
 * Conversational "Ask the Sensei" tab. History is client-held and
 * session-scoped (discarded when the modal closes); each turn sends the last
 * few {role, content} messages and the server re-grounds on the catalog.
 * Assistant suggestions render as tappable cards that flow through the same
 * pick pipeline as the Browse tab.
 */
export default function SenseiChatTab({ exerciseId, exerciseName, onPickOption, materializingId }) {
  const [messages, setMessages] = useState([]); // {role, content, options?, routed?}
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [failedMessage, setFailedMessage] = useState(null);
  const abortRef = useRef(null);
  const bottomRef = useRef(null);

  useEffect(() => () => { if (abortRef.current) abortRef.current.abort(); }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [messages, sending]);

  const send = async (text) => {
    const message = (text || "").trim();
    if (!message || sending) return;

    const history = messages.map((m) => ({ role: m.role, content: m.content }));
    setMessages((prev) => [...prev, { role: "user", content: message }]);
    setInput("");
    setFailedMessage(null);
    setSending(true);

    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const res = await aiService.substituteChat(
        { exercise_id: exerciseId, exercise_name: exerciseName, history, message },
        controller.signal
      );
      setMessages((prev) => [...prev, {
        role: "assistant",
        content: res?.reply || "…",
        options: res?.options || [],
        routed: res?.routed,
      }]);
    } catch (err) {
      if (err?.name === "AbortError") return;
      // Roll the user message back into the input so nothing typed is lost.
      setMessages((prev) => prev.slice(0, -1));
      setInput(message);
      setFailedMessage(
        /rate|429|busy/i.test(err?.message || "")
          ? "The Sensei is busy — try again in a bit, or use the Browse tab."
          : "Couldn't reach the Sensei. Check your connection and try again."
      );
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
      setSending(false);
    }
  };

  return (
    <div className="flex flex-col min-h-[40vh]">
      <div className="flex-1 space-y-4">
        {messages.length === 0 && !sending && (
          <div className="text-center py-6">
            <Sparkles className="w-10 h-10 text-primary-500 mx-auto mb-3" />
            <p className="text-gray-600 text-sm mb-1">
              Tell the Sensei why you want to swap “{exerciseName}”.
            </p>
            <p className="text-gray-400 text-xs mb-4">e.g. “my knee acts up”, “no bar today”</p>
            <div className="flex flex-wrap justify-center gap-2">
              {STARTERS.map((s) => (
                <button
                  key={s}
                  onClick={() => send(s)}
                  className="px-3 py-1.5 rounded-full text-sm font-medium border bg-white text-gray-600 border-gray-200 hover:border-primary-400 hover:text-primary-600 transition-colors"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((m, i) => (
          <div key={i}>
            {m.role === "user" ? (
              <div className="flex justify-end">
                <div className="bg-primary-600 text-white rounded-2xl rounded-br-md px-4 py-2.5 text-sm max-w-[85%]">
                  {m.content}
                </div>
              </div>
            ) : (
              <div className="space-y-2.5">
                <div
                  className={`rounded-2xl rounded-bl-md px-4 py-2.5 text-sm max-w-[92%] ${
                    m.routed === "safety"
                      ? "bg-amber-50 border border-amber-200 text-amber-800"
                      : "bg-gray-100 text-gray-800"
                  }`}
                >
                  {m.routed === "safety" && <AlertTriangle className="w-4 h-4 mb-1.5" />}
                  {m.content}
                </div>
                {m.options?.length > 0 && (
                  <div className="space-y-2 pl-1">
                    {m.options.map((opt, j) => (
                      <ExerciseResultRow
                        key={opt.id || `${opt.name}-${i}-${j}`}
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
                  </div>
                )}
              </div>
            )}
          </div>
        ))}

        {sending && (
          <div className="flex items-center gap-2 text-sm text-gray-500">
            <Loader2 className="w-4 h-4 animate-spin text-primary-500" />
            The Sensei is thinking…
          </div>
        )}

        {failedMessage && <p className="text-sm text-red-600">{failedMessage}</p>}
        <div ref={bottomRef} />
      </div>

      {/* Input row stays at the bottom of the tab panel */}
      <form
        className="flex items-center gap-2 pt-3 mt-2 border-t border-gray-100 sticky bottom-0 bg-white"
        onSubmit={(e) => { e.preventDefault(); send(input); }}
      >
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Why do you want to swap?"
          maxLength={1000}
          className="flex-1 px-3.5 py-2.5 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent text-sm"
        />
        <button
          type="submit"
          disabled={!input.trim() || sending}
          className="p-2.5 bg-primary-600 text-white rounded-xl hover:bg-primary-700 disabled:opacity-40 shrink-0"
          aria-label="Send"
        >
          <Send className="w-4 h-4" />
        </button>
      </form>
    </div>
  );
}
