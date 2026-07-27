import Layout from "./Layout.jsx";

import Dashboard from "./Dashboard";

import Calendar from "./Calendar";

import Sessions from "./Sessions";

import CreateSessionTemplate from "./CreateSessionTemplate";

import TrainNow from "./TrainNow";

import LiveSession from "./LiveSession";

import Exercises from "./Exercises";

import CreateExercise from "./CreateExercise";

import Goals from "./Goals";

import Plans from "./Plans";

import CreatePlan from "./CreatePlan";

import Chat from "./ChatWithStreaming";

import Documentation from "./Documentation";

import Progressions from "./Progressions";

import Settings from "./Settings";

import MemoriesSettings from "./MemoriesSettings";

import Auth from "./Auth";

import AuthCallback from "./AuthCallback";

import Onboarding from "./Onboarding";

import AdminJobs from "./AdminJobs";

import { BrowserRouter as Router, Route, Routes, useLocation, Navigate } from 'react-router-dom';

const PAGES = {
    
    Dashboard: Dashboard,
    
    Calendar: Calendar,
    
    Sessions: Sessions,

    CreateSessionTemplate: CreateSessionTemplate,

    TrainNow: TrainNow,

    LiveSession: LiveSession,
    
    Exercises: Exercises,
    
    CreateExercise: CreateExercise,
    
    Goals: Goals,
    
    Plans: Plans,
    
    CreatePlan: CreatePlan,
    
    Chat: Chat,

    Documentation: Documentation,

    Progressions: Progressions,

    Settings: Settings,

}

/**
 * Permanent legacy page-URL redirects (workout → session rename).
 *
 * Page URLs are bookmarkable and get pasted into chats, so unlike the API
 * routes (hard cutover) these keep working forever. React Router matches
 * `path` case-insensitively by default, so `/predefinedworkouts` and
 * `/PredefinedWorkouts` both land here.
 */
const LEGACY_PAGE_REDIRECTS = {
    '/PredefinedWorkouts': '/Sessions',
    '/CreatePredefinedWorkout': '/CreateSessionTemplate',
    '/LiveWorkout': '/LiveSession',
};

// Redirects to `to` while carrying the query string over (LiveWorkout?id=... is
// still a live entry point into the session hand-off).
function LegacyRedirect({ to }) {
    const location = useLocation();
    return <Navigate to={`${to}${location.search}${location.hash}`} replace />;
}

function _getCurrentPage(url) {
    if (url.endsWith('/')) {
        url = url.slice(0, -1);
    }
    let urlLastPart = url.split('/').pop();
    if (urlLastPart.includes('?')) {
        urlLastPart = urlLastPart.split('?')[0];
    }

    const pageName = Object.keys(PAGES).find(page => page.toLowerCase() === urlLastPart.toLowerCase());
    return pageName || Object.keys(PAGES)[0];
}

// Create a wrapper component that uses useLocation inside the Router context
function PagesContent() {
    const location = useLocation();
    const currentPage = _getCurrentPage(location.pathname);
    
    // Check if user is authenticated
    const token = localStorage.getItem('authToken');
    const isAuthPage = location.pathname === '/auth';
    const isAuthCallback = location.pathname === '/auth/callback';
    
    // If not authenticated and not on auth page or callback, redirect to auth
    if (!token && !isAuthPage && !isAuthCallback) {
        return <Navigate to="/auth" replace />;
    }
    
    // If authenticated and on auth page, redirect to dashboard
    if (token && isAuthPage) {
        return <Navigate to="/" replace />;
    }
    
    return (
        <Routes>
            <Route path="/onboarding" element={<Onboarding />} />
            <Route path="/auth" element={<Auth />} />
            <Route path="/auth/callback" element={<AuthCallback />} />
            <Route element={<Layout currentPageName={currentPage} />}>
                <Route path="/" element={<Dashboard />} />
                
                
                <Route path="/Dashboard" element={<Dashboard />} />
                
                <Route path="/Calendar" element={<Calendar />} />
                
                <Route path="/Sessions" element={<Sessions />} />

                <Route path="/CreateSessionTemplate" element={<CreateSessionTemplate />} />

                <Route path="/TrainNow" element={<TrainNow />} />

                <Route path="/LiveSession" element={<LiveSession />} />

                {Object.entries(LEGACY_PAGE_REDIRECTS).map(([from, to]) => (
                    <Route key={from} path={from} element={<LegacyRedirect to={to} />} />
                ))}

                <Route path="/Exercises" element={<Exercises />} />
                
                <Route path="/CreateExercise" element={<CreateExercise />} />
                
                <Route path="/Goals" element={<Goals />} />
                
                <Route path="/Plans" element={<Plans />} />
                
                <Route path="/CreatePlan" element={<CreatePlan />} />
                
                <Route path="/Chat" element={<Chat />} />
                
                <Route path="/Documentation" element={<Documentation />} />

                <Route path="/Progressions" element={<Progressions />} />

                <Route path="/Settings" element={<Settings />} />

                <Route path="/Settings/Memories" element={<MemoriesSettings />} />

                <Route path="/Admin/Jobs" element={<AdminJobs />} />
            </Route>
            <Route path="*" element={<Navigate to="/auth" replace />} />
        </Routes>
    );
}

export default function Pages() {
    return (
        <Router>
            <PagesContent />
        </Router>
    );
}