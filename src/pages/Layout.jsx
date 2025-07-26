

import React from "react";
import { Link, useLocation } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { Activity, Calendar, Dumbbell, Zap, Target, FileText, Bot } from "lucide-react"; // Added Bot
import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarFooter,
  SidebarProvider,
} from "@/components/ui/sidebar";
import FloatingAIAssistant from "@/components/FloatingAIAssistant";

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
    title: "AI Coach",
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

export default function Layout({ children }) {
  const location = useLocation();

  return (
    <SidebarProvider>
      <div className="flex h-screen bg-gray-50/50" style={{'--primary': '#1a1a1a', '--secondary': '#737373', '--accent': '#007aff', '--background': '#f9fafb', '--card-background': '#ffffff', '--separator': '#e5e5e5', '--text-primary': '#1a1a1a', '--text-secondary': '#737373', '--neu-light': '#ffffff', '--neu-dark': '#d1d9e6'}}>
        <Sidebar>
          <SidebarHeader>
            <div className="flex items-center gap-2">
              <Activity className="w-6 h-6" style={{color: 'var(--accent)'}} />
              <h1 className="text-xl font-bold" style={{color: 'var(--text-primary)'}}>SynergyFit</h1>
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
                    className={`flex items-center gap-3 rounded-lg px-3 py-2 transition-all text-sm font-medium ${
                      isActive
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
            {/* User profile section can go here */}
          </SidebarFooter>
        </Sidebar>

        <main className="flex-1 overflow-y-auto p-6 md:p-8">
          {children}
        </main>

        <FloatingAIAssistant />
      </div>
    </SidebarProvider>
  );
}

