

import React, { useState, useEffect, useRef } from "react";
import { Link, useLocation, useNavigate, Outlet } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { Activity, Calendar, Dumbbell, Zap, Target, FileText, Bot, TrendingUp, Settings } from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarFooter,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";

const navigationItems = [
  {
    title: "Dashboard",
    url: createPageUrl("Dashboard"),
    icon: Activity,
  },
  {
    title: "Calendar",
    url: createPageUrl("Calendar"),
    icon: Calendar,
  },
  {
    title: "Train Now",
    url: createPageUrl("TrainNow"),
    icon: Zap,
  },
  {
    title: "Plans",
    url: createPageUrl("Plans"),
    icon: FileText,
  },
  {
    title: "Goals",
    url: createPageUrl("Goals"),
    icon: Target,
  },
  {
    title: "Progressions",
    url: createPageUrl("Progressions"),
    icon: TrendingUp,
  },
  {
    title: "Sensei",
    url: createPageUrl("Chat"),
    icon: Bot,
  },
  {
    title: "Predefined Workouts",
    url: createPageUrl("PredefinedWorkouts"),
    icon: Dumbbell,
  },
  {
    title: "Exercises",
    url: createPageUrl("Exercises"),
    icon: Target,
  },
];

// Simple throttle utility
const throttle = (func, limit) => {
  let inThrottle;
  return function () {
    const args = arguments;
    const context = this;
    if (!inThrottle) {
      func.apply(context, args);
      inThrottle = true;
      setTimeout(() => inThrottle = false, limit);
    }
  }
};

export default function Layout({ children }) {
  const location = useLocation();
  const navigate = useNavigate();
  const [isNavVisible, setIsNavVisible] = useState(true);
  const lastScrollY = useRef(0);
  const mainContentRef = useRef(null);

  // Check if we're on the chat page - it has its own full-screen layout
  const isChatPage = location.pathname === '/chat' || location.pathname === '/Chat';

  useEffect(() => {
    const handleScroll = throttle(() => {
      if (!mainContentRef.current) return;

      const currentScrollY = mainContentRef.current.scrollTop;

      if (currentScrollY > lastScrollY.current && currentScrollY > 50) {
        // Scrolling down & past threshold
        setIsNavVisible(false);
      } else {
        // Scrolling up
        setIsNavVisible(true);
      }

      lastScrollY.current = currentScrollY;
    }, 100);

    const mainElement = mainContentRef.current;
    if (mainElement) {
      mainElement.addEventListener('scroll', handleScroll, { passive: true });
    }

    return () => {
      if (mainElement) {
        mainElement.removeEventListener('scroll', handleScroll);
      }
    };
  }, []);

  return (
    <SidebarProvider>
      <div className="flex h-screen bg-gray-50/50 dark:bg-gray-900 w-full" style={{ '--primary': '#1a1a1a', '--secondary': '#737373', '--accent': '#007aff', '--background': '#f9fafb', '--card-background': '#ffffff', '--separator': '#e5e5e5', '--text-primary': '#1a1a1a', '--text-secondary': '#737373', '--neu-light': '#ffffff', '--neu-dark': '#d1d9e6' }}>
        {/* Desktop Sidebar - Hidden on Mobile */}
        <div className="hidden md:block">
          <Sidebar>
            <SidebarHeader>
              <div className="flex items-center gap-2">
                <img src="/logo.png" alt="Torii Logo" className="w-8 h-8 object-contain" />
                <h1 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>Torii</h1>
              </div>
            </SidebarHeader>
            <SidebarContent>
              <div className="flex flex-col gap-1 p-2">
                {navigationItems.map((item, index) => {
                  const isActive = location.pathname === item.url;
                  return (
                    <Link
                      key={index}
                      to={item.url}
                      className={`flex items-center gap-3 rounded-lg px-3 py-2 transition-all text-sm font-medium ${isActive
                        ? 'bg-gray-100 text-gray-900'
                        : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                        }`}
                    >
                      <item.icon className="w-5 h-5" />
                      {item.title}
                    </Link>
                  );
                })}
              </div>
            </SidebarContent>
            <SidebarFooter>
              <div className="p-4 border-t space-y-3">
                <Link
                  to={createPageUrl("Settings")}
                  className={`flex items-center gap-3 rounded-lg px-3 py-2 transition-all text-sm font-medium ${
                    location.pathname === createPageUrl("Settings")
                      ? 'bg-gray-100 text-gray-900'
                      : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                  }`}
                >
                  <Settings className="w-5 h-5" />
                  Settings
                </Link>
                <div className="flex items-center gap-3">
                  <Link to={createPageUrl("Settings")} className="w-10 h-10 bg-purple-600 rounded-full flex items-center justify-center hover:bg-purple-700 transition-colors">
                    <span className="text-white font-medium">
                      {JSON.parse(localStorage.getItem('authUser') || '{}')?.name?.charAt(0)?.toUpperCase() || 'U'}
                    </span>
                  </Link>
                  <div className="flex-1">
                    <p className="text-sm font-medium">{JSON.parse(localStorage.getItem('authUser') || '{}')?.name || 'User'}</p>
                    <p className="text-xs text-muted-foreground">{JSON.parse(localStorage.getItem('authUser') || '{}')?.email || ''}</p>
                  </div>
                  <button
                    onClick={() => {
                      localStorage.removeItem('authToken');
                      localStorage.removeItem('authUser');
                      navigate('/auth');
                    }}
                    className="text-sm text-muted-foreground hover:text-primary"
                  >
                    Sign Out
                  </button>
                </div>
              </div>
            </SidebarFooter>
          </Sidebar>
        </div>

        <div className="flex-1 flex flex-col h-full overflow-hidden">
          {/* Mobile Sticky Header - Hidden on Chat page */}
          <header className={`flex items-center justify-between gap-4 border-b bg-white/80 dark:bg-gray-900/80 dark:border-gray-800 backdrop-blur-md px-4 py-3 md:hidden sticky top-0 z-50 ${isChatPage ? 'hidden' : ''}`}>
            <Link to={createPageUrl("Dashboard")} className="flex items-center gap-2">
              <img src="/logo.png" alt="Torii Logo" className="w-8 h-8 object-contain" />
              <span className="font-bold text-lg dark:text-white">Torii</span>
            </Link>
            <div className="flex items-center gap-3">
              <Link to={createPageUrl("Calendar")} className="p-2 text-gray-600 dark:text-gray-400 hover:text-purple-600 dark:hover:text-purple-400 transition-colors">
                <Calendar className="w-5 h-5" />
              </Link>
              <Link to={createPageUrl("TrainNow")} className="p-2 text-gray-600 dark:text-gray-400 hover:text-purple-600 dark:hover:text-purple-400 transition-colors">
                <Zap className="w-5 h-5" />
              </Link>
              <Link to={createPageUrl("Chat")} className="p-2 text-gray-600 dark:text-gray-400 hover:text-purple-600 dark:hover:text-purple-400 transition-colors">
                <Bot className="w-5 h-5" />
              </Link>
              <Link to={createPageUrl("Settings")} className="p-2 text-gray-600 dark:text-gray-400 hover:text-purple-600 dark:hover:text-purple-400 transition-colors">
                <Settings className="w-5 h-5" />
              </Link>
              <SidebarTrigger className="md:hidden" />
            </div>
          </header>

          {/* Main Content Area */}
          <main
            ref={mainContentRef}
            className={`flex-1 overflow-y-auto scroll-smooth ${isChatPage ? 'p-0' : 'p-4 md:p-6 lg:p-8 pb-24 md:pb-8'}`}
          >
            <Outlet />
          </main>

          {/* Mobile Bottom Navigation - Hidden on Chat page */}
          <nav
            className={`
              md:hidden fixed bottom-0 left-0 right-0 bg-white/90 dark:bg-gray-900/90 backdrop-blur-lg border-t border-gray-200 dark:border-gray-800 pb-[env(safe-area-inset-bottom)] z-50 transition-transform duration-300 ease-in-out
              ${isNavVisible && !isChatPage ? 'translate-y-0' : 'translate-y-full'}
              ${isChatPage ? 'hidden' : ''}
            `}
          >
            <div className="flex items-center justify-around h-14 px-2">
              {[
                navigationItems.find(i => i.title === "Goals"),
                navigationItems.find(i => i.title === "Plans"),
                navigationItems.find(i => i.title === "Predefined Workouts"),
                navigationItems.find(i => i.title === "Exercises")
              ].filter(Boolean).map((item, index) => {
                const isActive = location.pathname === item.url;
                return (
                  <Link
                    key={index}
                    to={item.url}
                    className={`flex flex-col items-center justify-center min-w-[64px] h-full gap-0.5 px-1 ${isActive ? 'text-purple-600' : 'text-gray-500'
                      }`}
                  >
                    <item.icon className={`w-5 h-5 ${isActive ? 'fill-current' : ''}`} strokeWidth={isActive ? 2.5 : 2} />
                    <span className="text-[10px] font-medium whitespace-nowrap">
                      {item.title === "Predefined Workouts" ? "Workouts" : item.title}
                    </span>
                  </Link>
                );
              })}
            </div>
          </nav>
        </div>

      </div>
    </SidebarProvider>
  );
}

