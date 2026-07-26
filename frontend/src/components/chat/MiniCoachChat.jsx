import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Send, Sparkles, Loader2, ExternalLink } from "lucide-react";
import ReactMarkdown from "react-markdown";
import rehypeRaw from "rehype-raw";
import { useStreamingChat } from "@/hooks/useStreamingChat";
import { MARKDOWN_COMPONENTS } from "@/components/chat/markdownComponents";
import { parseQuickReplies } from "@/components/chat/QuickReplies";
import { parseActionButtons } from "@/components/chat/ActionButtons";
import { stripContextMarkers, buildExerciseSwapMessage } from "@/utils/chatMarkers";
import { createPageUrl } from "@/utils";

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5001';
const REHYPE = [rehypeRaw];

const STARTERS = [
  "It hurts when I do these",
  "I don't have the equipment",
  "Want something harder",
  "Want some variety",
];

/**
 * The real Sensei coach chat, compact, embedded in the replace-exercise modal.
 *
 * Same conversation infrastructure as the main chat page: streams via
 * useStreamingChat, persists to chatConversations (so it shows up in main chat
 * history), full tool access (videos, catalog search, swap proposals). The
 * first send of each modal open carries an [EXERCISE SWAP ...] marker with the
 * authoritative live-session state; the marker is never displayed.
 *
 * One conversation per workout: the id is stashed by the parent in the
 * session state and passed back on reopen.
 */
export default function MiniCoachChat({
  exercise,
  workoutTitle,
  sourceWorkoutId,
  exercises,
  elapsedMinutes,
  conversationId,
  onConversationId,
}) {
  const navigate = useNavigate();
  const [messages, setMessages] = useState([]); // {role, content}
  const [input, setInput] = useState("");
  const [historyLoading, setHistoryLoading] = useState(false);
  const [error, setError] = useState(null);
  const sentContextRef = useRef(false); // marker goes on the first send per modal open
  const bottomRef = useRef(null);
  const convIdRef = useRef(conversationId || null);

  const { isStreaming, streamingMessage, sendStreamingMessage, stopStreaming } = useStreamingChat();

  const authToken = localStorage.getItem("authToken");

  // Resume the workout's conversation on open.
  useEffect(() => {
    if (!conversationId || !authToken) return;
    let cancelled = false;
    setHistoryLoading(true);
    fetch(`${API_BASE_URL}/api/v1/conversations/${conversationId}`, {
      headers: { Authorization: `Bearer ${authToken}` },
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (cancelled || !data?.messages) return;
        setMessages(
          data.messages.map((m) => ({
            role: m.role === "human" ? "user" : "assistant",
            content: m.role === "human" ? stripContextMarkers(m.content) : m.content,
          }))
        );
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setHistoryLoading(false); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Mirror the in-flight stream into the last assistant message.
  useEffect(() => {
    if (!isStreaming) return;
    setMessages((prev) => {
      if (prev.length === 0 || prev[prev.length - 1].role !== "assistant" || !prev[prev.length - 1].isStreaming) {
        return prev;
      }
      const next = prev.slice(0, -1);
      next.push({ role: "assistant", content: streamingMessage, isStreaming: true });
      return next;
    });
  }, [streamingMessage, isStreaming]);

  // Finalize when the stream ends.
  useEffect(() => {
    if (isStreaming) return;
    setMessages((prev) => {
      const last = prev[prev.length - 1];
      if (!last?.isStreaming) return prev;
      const next = prev.slice(0, -1);
      next.push({ role: "assistant", content: last.content });
      return next;
    });
  }, [isStreaming]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [messages, isStreaming]);

  useEffect(() => () => stopStreaming(), [stopStreaming]);

  const send = useCallback(async (text) => {
    const typed = (text || "").trim();
    if (!typed || isStreaming || !authToken) return;

    const wireMessage = sentContextRef.current
      ? typed
      : buildExerciseSwapMessage({
          exercise,
          workoutTitle,
          sourceWorkoutId,
          exercises,
          elapsedMinutes,
          text: typed,
        });
    sentContextRef.current = true;

    setMessages((prev) => [
      ...prev,
      { role: "user", content: typed },
      { role: "assistant", content: "", isStreaming: true },
    ]);
    setInput("");
    setError(null);

    try {
      const newConvId = await sendStreamingMessage(wireMessage, authToken, convIdRef.current);
      if (newConvId && newConvId !== convIdRef.current) {
        convIdRef.current = newConvId;
        onConversationId?.(newConvId);
      }
    } catch {
      setMessages((prev) => prev.filter((m) => !m.isStreaming));
      setInput(typed);
      setError("Couldn't reach the Sensei. Check your connection and try again.");
    }
  }, [isStreaming, authToken, exercise, workoutTitle, sourceWorkoutId, exercises, elapsedMinutes, sendStreamingMessage, onConversationId]);

  const openInSensei = () => {
    if (!convIdRef.current) return;
    localStorage.setItem("openConversationId", convIdRef.current);
    localStorage.setItem("openConversationTime", Date.now().toString());
    navigate(createPageUrl("Chat"));
  };

  return (
    <div className="flex flex-col">
      {convIdRef.current && (
        <button
          onClick={openInSensei}
          className="self-end mb-1 inline-flex items-center gap-1 text-xs text-gray-400 hover:text-primary-600"
        >
          Open in Sensei <ExternalLink className="w-3 h-3" />
        </button>
      )}

      <div className="space-y-3">
        {historyLoading && (
          <div className="flex items-center gap-2 text-sm text-gray-500 py-2">
            <Loader2 className="w-4 h-4 animate-spin text-primary-500" /> Loading conversation…
          </div>
        )}

        {messages.length === 0 && !historyLoading && !isStreaming && (
          <div className="text-center py-4">
            <Sparkles className="w-9 h-9 text-primary-500 mx-auto mb-2.5" />
            <p className="text-gray-600 text-sm mb-1">
              Tell the Sensei why you want to swap “{exercise?.exercise_name}”.
            </p>
            <p className="text-gray-400 text-xs mb-3.5">Same chat as the Sensei tab — it shows in your history.</p>
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

        {messages.map((m, i) => {
          if (m.role === "user") {
            return (
              <div key={i} className="flex justify-end">
                <div className="bg-primary-600 text-white rounded-2xl rounded-br-md px-4 py-2.5 text-sm max-w-[85%]">
                  {m.content}
                </div>
              </div>
            );
          }
          const { cleanContent: afterQuick, quickReplies } = parseQuickReplies(m.content || "");
          const { cleanContent } = parseActionButtons(afterQuick);
          const isLast = i === messages.length - 1;
          return (
            <div key={i} className="text-sm">
              {m.isStreaming && !m.content ? (
                <div className="flex items-center gap-2 text-gray-500 py-1">
                  <Loader2 className="w-4 h-4 animate-spin text-primary-500" /> The Sensei is thinking…
                </div>
              ) : (
                <ReactMarkdown rehypePlugins={REHYPE} components={MARKDOWN_COMPONENTS}>
                  {cleanContent}
                </ReactMarkdown>
              )}
              {isLast && !m.isStreaming && quickReplies.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-2">
                  {quickReplies.map((qr) => (
                    <button
                      key={qr}
                      onClick={() => send(qr)}
                      className="px-3 py-1.5 rounded-full text-sm font-medium border bg-white text-gray-600 border-gray-200 hover:border-primary-400 hover:text-primary-600 transition-colors"
                    >
                      {qr}
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })}

        {error && <p className="text-sm text-red-600">{error}</p>}
        <div ref={bottomRef} />
      </div>

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
          className="flex-1 px-3.5 py-2.5 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent text-base sm:text-sm"
        />
        <button
          type="submit"
          disabled={!input.trim() || isStreaming}
          className="p-2.5 bg-primary-600 text-white rounded-xl hover:bg-primary-700 disabled:opacity-40 shrink-0"
          aria-label="Send"
        >
          <Send className="w-4 h-4" />
        </button>
      </form>
    </div>
  );
}
