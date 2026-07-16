import { useState, useCallback, useEffect, useRef } from "react";
import apiService from "@/services/api";
import { resolveLayout } from "@/components/dashboard/widgets/registry";

const readCachedSettings = () => {
  try {
    return JSON.parse(localStorage.getItem("authUser") || "{}")?.settings;
  } catch {
    return undefined;
  }
};

// Cache writes always store the full server user (top-level merge, same as
// Settings.jsx) — never a hand-crafted nested `settings` object, so cached
// theme/units/sportsNews can't be dropped by a partial write.
const cacheServerUser = (user) => {
  try {
    const cached = JSON.parse(localStorage.getItem("authUser") || "{}");
    localStorage.setItem("authUser", JSON.stringify({ ...cached, ...user }));
  } catch {
    /* cache only */
  }
};

// Mobile-dashboard widget layout: synchronous init from the authUser cache
// (no flash of default order), background server refresh, server-first save.
export function useDashboardLayout() {
  const [layout, setLayout] = useState(() =>
    resolveLayout(readCachedSettings()?.dashboard?.mobileLayout)
  );
  // The sports-news Settings kill switch, exposed so the layout editor can
  // disable that widget's eye toggle. Kept in sync by the me() refresh so an
  // out-of-band change (another device, Settings in another tab) shows up.
  const [sportsNewsEnabled, setSportsNewsEnabled] = useState(
    () => readCachedSettings()?.sportsNews?.enabled !== false
  );
  const [saveError, setSaveError] = useState(false);
  // Once the user enters edit mode (or a save fails), the background refresh
  // must not clobber their in-memory layout.
  const dirty = useRef(false);

  useEffect(() => {
    let cancelled = false;
    apiService.auth
      .me()
      .then((res) => {
        // apiService.request unwraps the { success, data } envelope
        const user = res?.user;
        if (!user || cancelled) return;
        setSportsNewsEnabled(user.settings?.sportsNews?.enabled !== false);
        if (dirty.current) return;
        cacheServerUser(user);
        setLayout(resolveLayout(user.settings?.dashboard?.mobileLayout));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const beginEdit = useCallback(() => {
    dirty.current = true;
  }, []);

  const updateLayout = useCallback((next) => {
    setLayout(next);
  }, []);

  const saveLayout = useCallback(async (next) => {
    try {
      const res = await apiService.auth.updateProfile({
        settings: { dashboard: { mobileLayout: next } }
      });
      if (res?.user) cacheServerUser(res.user);
      setSaveError(false);
      dirty.current = false;
    } catch (e) {
      // Keep the in-memory layout for this session, leave the cache and dirty
      // flag alone so nothing silently reverts it, and let the UI say so.
      console.error("Failed to save dashboard layout:", e);
      setSaveError(true);
    }
  }, []);

  return {
    layout,
    updateLayout,
    saveLayout,
    beginEdit,
    saveError,
    sportsNewsEnabled,
  };
}
