import Layout from "./Layout.jsx";

import Dashboard from "./Dashboard";

import Calendar from "./Calendar";

import PredefinedWorkouts from "./PredefinedWorkouts";

import CreatePredefinedWorkout from "./CreatePredefinedWorkout";

import TrainNow from "./TrainNow";

import LiveWorkout from "./LiveWorkout";

import Exercises from "./Exercises";

import CreateExercise from "./CreateExercise";

import Goals from "./Goals";

import Plans from "./Plans";

import CreatePlan from "./CreatePlan";

import Chat from "./Chat";

import Documentation from "./Documentation";

import Auth from "./Auth";

import { BrowserRouter as Router, Route, Routes, useLocation } from 'react-router-dom';

const PAGES = {
    
    Dashboard: Dashboard,
    
    Calendar: Calendar,
    
    PredefinedWorkouts: PredefinedWorkouts,
    
    CreatePredefinedWorkout: CreatePredefinedWorkout,
    
    TrainNow: TrainNow,
    
    LiveWorkout: LiveWorkout,
    
    Exercises: Exercises,
    
    CreateExercise: CreateExercise,
    
    Goals: Goals,
    
    Plans: Plans,
    
    CreatePlan: CreatePlan,
    
    Chat: Chat,
    
    Documentation: Documentation,
    
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
    
    // Check if we're on the auth page
    if (location.pathname === '/auth') {
        return <Auth />;
    }
    
    // Check if user is authenticated
    const token = localStorage.getItem('authToken');
    if (!token) {
        // Redirect to auth if not authenticated
        window.location.href = '/auth';
        return null;
    }
    
    return (
        <Layout currentPageName={currentPage}>
            <Routes>            
                
                    <Route path="/" element={<Dashboard />} />
                
                
                <Route path="/Dashboard" element={<Dashboard />} />
                
                <Route path="/Calendar" element={<Calendar />} />
                
                <Route path="/PredefinedWorkouts" element={<PredefinedWorkouts />} />
                
                <Route path="/CreatePredefinedWorkout" element={<CreatePredefinedWorkout />} />
                
                <Route path="/TrainNow" element={<TrainNow />} />
                
                <Route path="/LiveWorkout" element={<LiveWorkout />} />
                
                <Route path="/Exercises" element={<Exercises />} />
                
                <Route path="/CreateExercise" element={<CreateExercise />} />
                
                <Route path="/Goals" element={<Goals />} />
                
                <Route path="/Plans" element={<Plans />} />
                
                <Route path="/CreatePlan" element={<CreatePlan />} />
                
                <Route path="/Chat" element={<Chat />} />
                
                <Route path="/Documentation" element={<Documentation />} />
                
            </Routes>
        </Layout>
    );
}

export default function Pages() {
    return (
        <Router>
            <PagesContent />
        </Router>
    );
}