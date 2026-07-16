import React, { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import apiService from "@/services/api";
import { motion, AnimatePresence } from "framer-motion";
import { Newspaper, Star, ChevronRight, X, RotateCcw, CheckCircle2 } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

const DISMISSED_KEY = "sportsNews.dismissed";
// Once the user closes the "pick sports" nudge it never comes back (no TTL)
const NUDGE_DISMISSED_KEY = "sportsNews.nudgeDismissed";
// On touch devices, two-axis drag makes framer-motion set touch-action:none,
// turning the card into a page-scroll dead-zone. Horizontal-only drag there
// keeps vertical thumbs scrolling; mouse users keep any-direction swipes.
const IS_COARSE_POINTER =
  typeof window !== "undefined" && window.matchMedia?.("(pointer: coarse)")?.matches;
const DISMISS_TTL_MS = 14 * 24 * 60 * 60 * 1000; // articles can outlive their
// nominal cache TTL (refetch extends it), so prune well past it
const SWIPE_DISTANCE = 120;
const SWIPE_VELOCITY = 800;

function loadDismissed() {
  try {
    const raw = JSON.parse(localStorage.getItem(DISMISSED_KEY)) || [];
    const fresh = raw.filter((d) => Date.now() - d.ts < DISMISS_TTL_MS);
    if (fresh.length !== raw.length) {
      localStorage.setItem(DISMISSED_KEY, JSON.stringify(fresh));
    }
    return new Set(fresh.map((d) => d.id));
  } catch {
    return new Set();
  }
}

function saveDismissed(id) {
  try {
    const raw = JSON.parse(localStorage.getItem(DISMISSED_KEY)) || [];
    localStorage.setItem(DISMISSED_KEY, JSON.stringify([...raw, { id, ts: Date.now() }]));
  } catch {
    // localStorage unavailable — dismissals just won't persist
  }
}

function unsaveDismissed(ids) {
  try {
    const remove = new Set(ids);
    const raw = JSON.parse(localStorage.getItem(DISMISSED_KEY)) || [];
    localStorage.setItem(DISMISSED_KEY, JSON.stringify(raw.filter((d) => !remove.has(d.id))));
  } catch {
    // localStorage unavailable — nothing to remove
  }
}

export default function SportsNewsCards() {
  const navigate = useNavigate();
  const [allArticles, setAllArticles] = useState([]);
  const [stack, setStack] = useState([]);
  // Cards dismissed in this component instance, most recent last — the
  // undo button walks back through these one at a time
  const [history, setHistory] = useState([]);
  const [state, setState] = useState("loading"); // loading | ready | nudge | hidden
  // Direction of the last dismissing swipe, read by the exit animation
  const flyOut = useRef({ x: 0, y: 0 });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await apiService.news.list();
        if (cancelled) return;
        if (data?.enabled === false) {
          setState("hidden");
          return;
        }
        const dismissed = loadDismissed();
        const fetched = data?.articles || [];
        const articles = fetched.filter((a) => !dismissed.has(a.id));
        setAllArticles(fetched);
        if (articles.length > 0 || fetched.length > 0) {
          // Even with everything already dismissed, stay visible: the
          // caught-up card lets the user bring stories back
          setStack(articles);
          setState("ready");
        } else if (!data?.followsSports && !localStorage.getItem(NUDGE_DISMISSED_KEY)) {
          setState("nudge");
        } else {
          setState("hidden");
        }
      } catch {
        // News must never break the dashboard
        if (!cancelled) setState("hidden");
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const handleDragEnd = (_event, info) => {
    const distance = Math.hypot(info.offset.x, info.offset.y);
    const speed = Math.hypot(info.velocity.x, info.velocity.y);
    if (distance > SWIPE_DISTANCE || speed > SWIPE_VELOCITY) {
      flyOut.current = {
        x: info.offset.x + info.velocity.x * 0.2,
        y: info.offset.y + info.velocity.y * 0.2
      };
      const top = stack[0];
      saveDismissed(top.id);
      setHistory((prev) => [...prev, top]);
      setStack((prev) => prev.slice(1));
    }
  };

  // Step back one dismissal (this session's history)
  const undoDismiss = () => {
    const last = history[history.length - 1];
    if (!last) return;
    unsaveDismissed([last.id]);
    setHistory((prev) => prev.slice(0, -1));
    setStack((prev) => [last, ...prev]);
  };

  // Bring back every fetched story (covers dismissals from before reload,
  // where there is no session history to step through)
  const restoreAll = () => {
    unsaveDismissed(allArticles.map((a) => a.id));
    setHistory([]);
    setStack(allArticles);
  };

  if (state === "loading" || state === "hidden") return null;

  if (state === "nudge") {
    return (
      <div className="mt-2">
        <SectionHeader />
        <div className="relative">
          <button
            onClick={() => navigate(createPageUrl("Settings"))}
            className="w-full flex items-center justify-between bg-white rounded-2xl border border-gray-200 shadow-sm p-4 pr-16 text-left hover:bg-gray-50 transition-colors"
          >
            <div>
              <p className="font-medium text-gray-900">Follow your sports</p>
              <p className="text-sm text-gray-500">Pick sports you follow to see news here</p>
            </div>
            <ChevronRight className="w-5 h-5 text-gray-400 flex-shrink-0" />
          </button>
          <button
            onClick={() => {
              try { localStorage.setItem(NUDGE_DISMISSED_KEY, "1"); } catch { /* non-persistent */ }
              setState("hidden");
            }}
            className="absolute top-2 right-2 p-1.5 text-gray-400 hover:text-gray-600 rounded-full hover:bg-gray-100 transition-colors"
            title="Don't show again"
            aria-label="Dismiss"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
    );
  }

  if (stack.length === 0) {
    if (allArticles.length === 0) return null;
    // Everything swiped away — say so instead of vanishing, and offer a way back
    return (
      <div className="mt-2">
        <SectionHeader onUndo={history.length > 0 ? undoDismiss : undefined} />
        <div className="flex items-center justify-between bg-white rounded-2xl border border-gray-200 shadow-sm p-4">
          <div className="flex items-center gap-3">
            <CheckCircle2 className="w-5 h-5 text-emerald-500 flex-shrink-0" />
            <div>
              <p className="font-medium text-gray-900">You're all caught up</p>
              <p className="text-sm text-gray-500">New stories land every few hours</p>
            </div>
          </div>
          <button
            onClick={restoreAll}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-gray-600 bg-gray-100 rounded-full hover:bg-gray-200 transition-colors flex-shrink-0"
          >
            <RotateCcw className="w-3.5 h-3.5" /> Show again
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mt-2">
      <SectionHeader onUndo={history.length > 0 ? undoDismiss : undefined} />
      <div className="relative h-60 select-none">
        <AnimatePresence>
          {stack.slice(0, 3).map((article, i) => (
            <NewsCard
              key={article.id}
              article={article}
              depth={i}
              flyOut={flyOut}
              onDragEnd={handleDragEnd}
            />
          )).reverse()}
        </AnimatePresence>
      </div>
    </div>
  );
}

function SectionHeader({ onUndo }) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <Newspaper className="w-4 h-4 text-gray-500" />
      <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Sports news</h3>
      {onUndo && (
        <button
          onClick={onUndo}
          className="ml-auto flex items-center gap-1 text-xs font-medium text-gray-400 hover:text-gray-600 transition-colors"
          title="Bring back the last dismissed story"
          aria-label="Undo dismiss"
        >
          <RotateCcw className="w-3.5 h-3.5" /> Undo
        </button>
      )}
    </div>
  );
}

function NewsCard({ article, depth, flyOut, onDragEnd }) {
  const isTop = depth === 0;
  // The card follows the pointer while dragging, so the pointer never leaves
  // it and framer-motion's tap gesture fires even at the end of a swipe.
  // Gate the tap on actual pointer travel: only a still press opens the link.
  const dragDistance = useRef(0);
  const sport = article.sports?.[0];
  const publishedAgo = article.publishedAt
    ? formatDistanceToNow(new Date(article.publishedAt), { addSuffix: true })
    : null;

  return (
    <motion.div
      className="absolute inset-0 rounded-2xl overflow-hidden shadow-md bg-gray-900"
      style={{ cursor: isTop ? "grab" : "auto", zIndex: 10 - depth }}
      initial={{ scale: 1 - (depth + 1) * 0.05, y: (depth + 1) * 10, opacity: depth >= 2 ? 0 : 1 }}
      animate={{ scale: 1 - depth * 0.05, y: depth * 10, opacity: depth >= 2 ? 0.6 : 1 }}
      exit={{
        x: flyOut.current.x * 3,
        y: flyOut.current.y * 3,
        rotate: flyOut.current.x > 0 ? 20 : -20,
        opacity: 0,
        transition: { duration: 0.3 }
      }}
      drag={isTop && (IS_COARSE_POINTER ? "x" : true)}
      dragElastic={0.7}
      dragSnapToOrigin
      onDragEnd={isTop ? onDragEnd : undefined}
      whileDrag={{ cursor: "grabbing", scale: 1.02 }}
      onTapStart={isTop ? () => { dragDistance.current = 0; } : undefined}
      onDrag={isTop ? (_e, info) => { dragDistance.current = Math.hypot(info.offset.x, info.offset.y); } : undefined}
      onTap={isTop ? () => {
        if (dragDistance.current < 5) {
          window.open(article.articleUrl, "_blank", "noopener");
        }
      } : undefined}
    >
      {article.imageUrl ? (
        <img
          src={article.imageUrl}
          alt=""
          className="absolute inset-0 w-full h-full object-cover pointer-events-none"
          draggable={false}
        />
      ) : (
        <div className="absolute inset-0 bg-gradient-to-br from-indigo-600 to-purple-700" />
      )}
      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 via-black/60 to-transparent pt-12 pb-3 px-4">
        <div className="flex items-center gap-2 mb-1.5">
          {article.isTopEvent && (
            <span className="inline-flex items-center gap-1 bg-amber-400/95 text-amber-950 text-[11px] font-semibold px-2 py-0.5 rounded-full">
              <Star className="w-3 h-3" /> Top story
            </span>
          )}
          {sport && (
            <span className="bg-white/20 backdrop-blur-sm text-white text-[11px] font-medium px-2 py-0.5 rounded-full capitalize">
              {sport}
            </span>
          )}
        </div>
        <p className="text-white font-semibold leading-snug line-clamp-2">{article.headline}</p>
        <p className="text-white/60 text-xs mt-1">
          {article.source}
          {publishedAgo ? ` · ${publishedAgo}` : ""}
        </p>
      </div>
    </motion.div>
  );
}
