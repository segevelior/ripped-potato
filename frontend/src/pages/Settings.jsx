import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Camera, Moon, Sun, Loader2, Brain, Link, Unlink, RefreshCw, CheckCircle, AlertCircle, Trash2, Copy, Sparkles, KeyRound, X, Target, HeartPulse, Newspaper } from 'lucide-react';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Switch } from '@/components/ui/switch';
import { useTheme } from '@/contexts/ThemeContext';
import { StravaIntegration } from '@/api/entities';
import apiService from '@/services/api';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
} from '@/components/ui/alert-dialog';

export default function Settings() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { theme, toggleTheme, isDark } = useTheme();
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState(null);
  const [user, setUser] = useState(null);
  const [editingField, setEditingField] = useState(null);
  const [newGoal, setNewGoal] = useState('');
  const [newInjury, setNewInjury] = useState('');

  // Sports-news follows state (free-text add flow)
  const [newsQuery, setNewsQuery] = useState('');
  const [newsAdding, setNewsAdding] = useState(false);
  const [newsError, setNewsError] = useState(null);
  const [newsSuggestions, setNewsSuggestions] = useState([]);

  // Strava integration state
  const [stravaStatus, setStravaStatus] = useState(null);
  const [stravaLoading, setStravaLoading] = useState(false);
  const [stravaSyncing, setStravaSyncing] = useState(false);
  const [stravaMessage, setStravaMessage] = useState(null);
  const [showDisconnectDialog, setShowDisconnectDialog] = useState(false);

  // Sign-in & security (set/change password) state
  const [showPwForm, setShowPwForm] = useState(false);
  const [pwForm, setPwForm] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });
  const [pwSaving, setPwSaving] = useState(false);
  const [pwMessage, setPwMessage] = useState(null);

  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    dateOfBirth: '',
    address: '',
    profilePicture: '',
    profile: {
      weight: '',
      height: '',
      gender: '',
      fitnessLevel: '',
      sportPreferences: [],
      goals: [],
      injuries: [],
    },
    settings: {
      units: 'metric',
      notifications: true,
      theme: 'light',
      weekStartDay: 0, // 0 = Sunday, 1 = Monday
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      sportsNews: { enabled: true, follows: [] }
    }
  });

  useEffect(() => {
    fetchUserProfile();
    fetchStravaStatus();
    fetchNewsSuggestions();
  }, []);

  // Handle Strava OAuth callback
  useEffect(() => {
    const stravaSuccess = searchParams.get('strava');
    if (stravaSuccess === 'connected') {
      setStravaMessage({ type: 'success', text: 'Strava connected successfully! Syncing your activities...' });
      fetchStravaStatus();
      // Clear the URL params
      searchParams.delete('strava');
      setSearchParams(searchParams);
    } else if (stravaSuccess === 'error') {
      setStravaMessage({ type: 'error', text: 'Failed to connect Strava. Please try again.' });
      searchParams.delete('strava');
      setSearchParams(searchParams);
    }
  }, [searchParams]);

  // Handle Google account-linking return (from "Connect Google")
  useEffect(() => {
    const google = searchParams.get('google');
    if (!google) return;
    if (google === 'connected') {
      setPwMessage({ type: 'success', text: 'Google connected. You can now sign in with Google.' });
      fetchUserProfile();
    } else if (google === 'error') {
      const reasons = {
        google_in_use: 'That Google account is already linked to a different account.',
        invalid_session: 'Your session expired. Please sign in again and retry.',
        server_error: 'Something went wrong connecting Google. Please try again.'
      };
      const reason = searchParams.get('reason');
      setPwMessage({ type: 'error', text: reasons[reason] || 'Failed to connect Google. Please try again.' });
    }
    searchParams.delete('google');
    searchParams.delete('reason');
    setSearchParams(searchParams);
  }, [searchParams]);

  const fetchUserProfile = async () => {
    setIsLoading(true);
    try {
      const token = localStorage.getItem('authToken');
      const response = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:5001'}/api/v1/auth/profile`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (response.ok) {
        const data = await response.json();
        const userData = data.data.user;
        setUser(userData);
        setFormData({
          name: userData.name || '',
          email: userData.email || '',
          phone: userData.phone || '',
          dateOfBirth: userData.dateOfBirth ? new Date(userData.dateOfBirth).toISOString().split('T')[0] : '',
          address: userData.address || '',
          profilePicture: userData.profilePicture || '',
          profile: {
            weight: userData.profile?.weight || '',
            height: userData.profile?.height || '',
            gender: userData.profile?.gender || '',
            fitnessLevel: userData.profile?.fitnessLevel || 'beginner',
            sportPreferences: userData.profile?.sportPreferences || [],
            goals: userData.profile?.goals || [],
            injuries: userData.profile?.injuries || [],
          },
          settings: {
            units: userData.settings?.units || 'metric',
            notifications: userData.settings?.notifications ?? true,
            theme: userData.settings?.theme || 'light',
            weekStartDay: userData.settings?.weekStartDay ?? 0,
            timezone: userData.settings?.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone,
            sportsNews: {
              enabled: userData.settings?.sportsNews?.enabled ?? true,
              follows: userData.settings?.sportsNews?.follows || []
            }
          }
        });
      }
    } catch (error) {
      console.error('Error fetching profile:', error);
    } finally {
      setIsLoading(false);
    }
  };

  // Unset weight/height/gender live in form state as '' — the schema wants
  // Number/enum there, so empty values must be omitted, not sent as ''.
  const buildProfilePayload = () => {
    const { weight, height, gender, ...rest } = formData.profile;
    const profile = { ...rest };
    if (weight !== '') profile.weight = Number(weight);
    if (height !== '') profile.height = Number(height);
    if (gender !== '') profile.gender = gender;
    return profile;
  };

  const handleSave = async () => {
    setIsSaving(true);
    setSaveMessage(null);
    try {
      const token = localStorage.getItem('authToken');
      const response = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:5001'}/api/v1/auth/profile`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          name: formData.name,
          phone: formData.phone,
          dateOfBirth: formData.dateOfBirth || null,
          address: formData.address,
          profilePicture: formData.profilePicture,
          profile: buildProfilePayload(),
          settings: formData.settings
        })
      });

      if (response.ok) {
        const data = await response.json();
        // Update local storage
        const authUser = JSON.parse(localStorage.getItem('authUser') || '{}');
        localStorage.setItem('authUser', JSON.stringify({ ...authUser, ...data.data.user }));
        setUser(data.data.user);
        setEditingField(null);
      } else {
        const data = await response.json().catch(() => null);
        setSaveMessage({ type: 'error', text: data?.message || 'Failed to save changes. Please try again.' });
      }
    } catch (error) {
      console.error('Error saving profile:', error);
      setSaveMessage({ type: 'error', text: 'Failed to save changes. Please try again.' });
    } finally {
      setIsSaving(false);
    }
  };

  // Persist a full profile object (goals/injuries edits save immediately). The
  // backend deep-merges profile, and we send the whole current profile so no
  // other field is dropped.
  const commitProfile = async (nextProfile) => {
    setFormData((prev) => ({ ...prev, profile: nextProfile }));
    setIsSaving(true);
    try {
      const token = localStorage.getItem('authToken');
      const response = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:5001'}/api/v1/auth/profile`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ profile: nextProfile })
      });
      if (response.ok) {
        const data = await response.json();
        const authUser = JSON.parse(localStorage.getItem('authUser') || '{}');
        localStorage.setItem('authUser', JSON.stringify({ ...authUser, ...data.data.user }));
        setUser(data.data.user);
      }
    } catch (error) {
      console.error('Error saving profile arrays:', error);
    } finally {
      setIsSaving(false);
    }
  };

  // Persist a full settings object immediately (like commitProfile). The
  // server applies dot-path sets per key; sportsNews.follows is ignored here
  // by design — only POST /news/follows can write it.
  const commitSettings = async (nextSettings) => {
    setFormData((prev) => ({ ...prev, settings: nextSettings }));
    setIsSaving(true);
    try {
      const token = localStorage.getItem('authToken');
      const response = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:5001'}/api/v1/auth/profile`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ settings: nextSettings })
      });
      if (response.ok) {
        const data = await response.json();
        const authUser = JSON.parse(localStorage.getItem('authUser') || '{}');
        localStorage.setItem('authUser', JSON.stringify({ ...authUser, ...data.data.user }));
        setUser(data.data.user);
      }
    } catch (error) {
      console.error('Error saving settings:', error);
    } finally {
      setIsSaving(false);
    }
  };

  const fetchNewsSuggestions = async () => {
    try {
      const data = await apiService.news.suggestions();
      setNewsSuggestions(data.suggestions || []);
    } catch {
      setNewsSuggestions([]);
    }
  };

  // Follows are written only via the news endpoints (feeds are LLM-resolved
  // and live-validated server-side) — never through commitSettings, which
  // only carries the enabled flag.
  const applyFollows = (follows) => {
    setFormData((prev) => ({
      ...prev,
      settings: { ...prev.settings, sportsNews: { ...prev.settings.sportsNews, follows } }
    }));
    const authUser = JSON.parse(localStorage.getItem('authUser') || '{}');
    localStorage.setItem('authUser', JSON.stringify({
      ...authUser,
      settings: {
        ...(authUser.settings || {}),
        sportsNews: { ...(authUser.settings?.sportsNews || {}), follows }
      }
    }));
  };

  const addNewsFollow = async (query) => {
    const q = (query || '').trim();
    if (!q || newsAdding) return;
    setNewsAdding(true);
    setNewsError(null);
    try {
      // Server resolves via LLM + live ESPN checks — can take up to ~35s.
      const data = await apiService.news.addFollow(q);
      applyFollows(data.follows || []);
      setNewsQuery('');
      fetchNewsSuggestions();
    } catch (error) {
      setNewsError(error.message || `Couldn't find ESPN coverage for "${q}" — try a league name`);
    } finally {
      setNewsAdding(false);
    }
  };

  const removeNewsFollow = async (label) => {
    try {
      const data = await apiService.news.removeFollow(label);
      applyFollows(data.follows || []);
      fetchNewsSuggestions();
    } catch (error) {
      setNewsError(error.message || 'Failed to remove');
    }
  };

  const addProfileItem = (key, value, clear) => {
    const v = (value || '').trim();
    if (!v) return;
    const current = formData.profile[key] || [];
    if (current.some((x) => x.toLowerCase() === v.toLowerCase())) { clear(); return; }
    commitProfile({ ...formData.profile, [key]: [...current, v] });
    clear();
  };

  const removeProfileItem = (key, value) => {
    const current = formData.profile[key] || [];
    commitProfile({ ...formData.profile, [key]: current.filter((x) => x !== value) });
  };

  const renderSaveMessage = () => saveMessage && (
    <div className="mt-2 p-3 rounded-lg flex items-center gap-2 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400">
      <AlertCircle className="w-5 h-5 flex-shrink-0" />
      <span className="text-sm">{saveMessage.text}</span>
    </div>
  );

  // Plain render function (NOT a nested component — that would remount the input
  // and drop focus on each keystroke).
  const renderChipEditor = (title, itemKey, Icon, inputValue, setInputValue, placeholder) => (
    <div className="py-4 border-b border-gray-100 dark:border-gray-800">
      <div className="flex items-center gap-2 mb-2">
        <Icon className="w-4 h-4 text-primary-400" />
        <p className="text-sm font-bold text-gray-500 dark:text-gray-400 tracking-wide">{title}</p>
      </div>
      <div className="flex flex-wrap gap-2 mb-2">
        {(formData.profile[itemKey] || []).length === 0 ? (
          <span className="text-sm text-gray-400 dark:text-gray-500">Not set</span>
        ) : (
          (formData.profile[itemKey] || []).map((item) => (
            <span
              key={item}
              className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-primary-100 dark:bg-primary-900/30 text-sm text-gray-800 dark:text-gray-200"
            >
              {item}
              <button onClick={() => removeProfileItem(itemKey, item)} className="hover:text-red-500" title="Remove">
                <X className="w-3.5 h-3.5" />
              </button>
            </span>
          ))
        )}
      </div>
      <div className="flex gap-2">
        <input
          type="text"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              addProfileItem(itemKey, inputValue, () => setInputValue(''));
            }
          }}
          placeholder={placeholder}
          className="flex-1 px-4 py-2 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-400/50"
        />
        <button
          onClick={() => addProfileItem(itemKey, inputValue, () => setInputValue(''))}
          disabled={!inputValue.trim() || isSaving}
          className="px-4 py-2 bg-primary-400 text-gray-900 font-semibold rounded-xl hover:bg-primary-500 transition-colors disabled:opacity-50"
        >
          Add
        </button>
      </div>
    </div>
  );

  // Strava functions
  const fetchStravaStatus = async () => {
    setStravaLoading(true);
    try {
      const status = await StravaIntegration.getStatus();
      setStravaStatus(status);
    } catch (error) {
      console.error('Error fetching Strava status:', error);
      setStravaStatus({ connected: false });
    } finally {
      setStravaLoading(false);
    }
  };

  const handleStravaConnect = async () => {
    setStravaLoading(true);
    try {
      const { url } = await StravaIntegration.getAuthUrl();
      if (url) {
        window.location.href = url;
      }
    } catch (error) {
      console.error('Error getting Strava auth URL:', error);
      setStravaMessage({ type: 'error', text: 'Failed to initiate Strava connection.' });
      setStravaLoading(false);
    }
  };

  const handleStravaSync = async () => {
    setStravaSyncing(true);
    setStravaMessage(null);
    try {
      const result = await StravaIntegration.sync(false, 30);
      setStravaMessage({
        type: 'success',
        text: `Synced ${result.newActivities || 0} new activities from Strava.`
      });
      fetchStravaStatus();
    } catch (error) {
      console.error('Error syncing Strava:', error);
      setStravaMessage({ type: 'error', text: 'Failed to sync activities from Strava.' });
    } finally {
      setStravaSyncing(false);
    }
  };

  const handleStravaDisconnect = async (deleteActivities = false) => {
    setShowDisconnectDialog(false);
    setStravaLoading(true);
    try {
      await StravaIntegration.disconnect(deleteActivities);
      setStravaStatus({ connected: false });
      setStravaMessage({
        type: 'success',
        text: deleteActivities
          ? 'Strava disconnected and all activities deleted.'
          : 'Strava disconnected successfully. Your activities have been kept.'
      });
    } catch (error) {
      console.error('Error disconnecting Strava:', error);
      setStravaMessage({ type: 'error', text: 'Failed to disconnect Strava.' });
    } finally {
      setStravaLoading(false);
    }
  };

  // Link Google to THIS logged-in account. We forward the current session JWT
  // as OAuth `state=link:<token>` so the backend binds googleId to this exact
  // user (never by email match, which could otherwise switch/spawn accounts).
  const handleConnectGoogle = () => {
    const token = localStorage.getItem('authToken');
    if (!token) return;
    const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:5001';
    window.location.href = `${apiUrl}/api/v1/auth/google?state=link:${encodeURIComponent(token)}`;
  };

  // Set (Google-only account) or change the account password.
  const handleSetPassword = async () => {
    setPwMessage(null);
    if (pwForm.newPassword.length < 6) {
      setPwMessage({ type: 'error', text: 'Password must be at least 6 characters.' });
      return;
    }
    if (pwForm.newPassword !== pwForm.confirmPassword) {
      setPwMessage({ type: 'error', text: 'Passwords do not match.' });
      return;
    }
    setPwSaving(true);
    try {
      const res = await apiService.auth.setPassword(
        pwForm.newPassword,
        user?.hasPassword ? pwForm.currentPassword : undefined
      );
      setPwMessage({ type: 'success', text: res?.message || 'Password updated successfully.' });
      setPwForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
      setShowPwForm(false);
      fetchUserProfile();
    } catch (error) {
      setPwMessage({ type: 'error', text: error.message || 'Failed to set password.' });
    } finally {
      setPwSaving(false);
    }
  };

  const formatDate = (dateString) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  };

  const personalDataFields = [
    { key: 'name', label: 'Name', value: formData.name, type: 'text' },
    { key: 'email', label: 'Email', value: formData.email, type: 'email', disabled: true },
    { key: 'phone', label: 'Phone', value: formData.phone, type: 'tel', placeholder: '+1 202-555-0138' },
    { key: 'dateOfBirth', label: 'Date of birth', value: formData.dateOfBirth, displayValue: formatDate(formData.dateOfBirth), type: 'date', placeholder: 'Select date' },
  ];

  const fitnessFields = [
    { key: 'weight', label: 'Weight', value: formData.profile.weight, type: 'number', placeholder: formData.settings.units === 'metric' ? 'kg' : 'lbs', unit: formData.settings.units === 'metric' ? 'kg' : 'lbs' },
    { key: 'height', label: 'Height', value: formData.profile.height, type: 'number', placeholder: formData.settings.units === 'metric' ? 'cm' : 'in', unit: formData.settings.units === 'metric' ? 'cm' : 'in' },
    {
      key: 'gender',
      label: 'Gender',
      value: formData.profile.gender,
      type: 'select',
      options: [
        { value: '', label: 'Select gender' },
        { value: 'male', label: 'Male' },
        { value: 'female', label: 'Female' },
        { value: 'other', label: 'Other' },
        { value: 'prefer_not_to_say', label: 'Prefer not to say' }
      ]
    },
    {
      key: 'fitnessLevel',
      label: 'Fitness Level',
      value: formData.profile.fitnessLevel,
      type: 'select',
      options: [
        { value: 'beginner', label: 'Beginner' },
        { value: 'intermediate', label: 'Intermediate' },
        { value: 'advanced', label: 'Advanced' }
      ]
    },
  ];

  if (isLoading) {
    return (
      <div className="min-h-screen bg-white dark:bg-gray-900 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary-400" />
      </div>
    );
  }

  return (
    <div className="-mx-4 -mt-4 -mb-24 md:-mx-6 md:-mt-6 md:-mb-8 lg:-mx-8 lg:-mt-8 min-h-full bg-white dark:bg-gray-900 pb-24 md:pb-8">
      {/* Header */}
      <div className="sticky -top-4 md:-top-6 lg:-top-8 z-40 bg-white dark:bg-gray-900 border-b border-gray-100 dark:border-gray-800 shadow-sm">
        <div className="flex items-center justify-between px-4 md:px-6 py-4">
          <button
            onClick={() => navigate(-1)}
            className="p-2 -ml-2 rounded-xl bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
          >
            <ChevronLeft className="w-5 h-5 text-gray-900 dark:text-white" />
          </button>
          <h1 className="text-lg font-bold text-gray-900 dark:text-white">Personal Data</h1>
          <div className="w-9" /> {/* Spacer for centering */}
        </div>
      </div>

      <div className="px-6 py-6 max-w-lg mx-auto">
        {/* Profile Picture */}
        <div className="flex justify-center mb-8">
          <div className="relative">
            <Avatar className="w-28 h-28 ring-4 ring-primary-300 dark:ring-primary-400/50">
              <AvatarImage src={formData.profilePicture} alt={formData.name} />
              <AvatarFallback className="text-2xl font-bold bg-primary-100 dark:bg-primary-900 text-primary-600 dark:text-primary-300">
                {formData.name?.charAt(0)?.toUpperCase() || 'U'}
              </AvatarFallback>
            </Avatar>
            <button className="absolute bottom-0 right-0 w-8 h-8 bg-primary-400 rounded-full flex items-center justify-center shadow-lg hover:bg-primary-500 transition-colors">
              <Camera className="w-4 h-4 text-gray-900" />
            </button>
          </div>
        </div>

        {/* Personal Data Section */}
        <div className="space-y-1">
          {personalDataFields.map((field) => (
            <div key={field.key} className="py-4 border-b border-gray-100 dark:border-gray-800">
              {editingField === field.key && !field.disabled ? (
                <div className="space-y-2">
                  <label className="text-sm font-bold text-gray-500 dark:text-gray-400 tracking-wide">
                    {field.label}
                  </label>
                  <input
                    type={field.type}
                    value={field.value}
                    onChange={(e) => setFormData({ ...formData, [field.key]: e.target.value })}
                    placeholder={field.placeholder}
                    className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-400/50 focus:border-primary-400"
                    autoFocus
                  />
                  <div className="flex gap-2 pt-2">
                    <button
                      onClick={() => setEditingField(null)}
                      className="flex-1 px-4 py-2 text-sm font-medium text-gray-600 dark:text-gray-400 bg-gray-100 dark:bg-gray-800 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleSave}
                      disabled={isSaving}
                      className="flex-1 px-4 py-2 text-sm font-medium text-gray-900 bg-white rounded-lg hover:bg-gray-100 transition-colors disabled:opacity-50 shadow-sm border border-gray-200"
                    >
                      {isSaving ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : 'Save'}
                    </button>
                  </div>
                  {renderSaveMessage()}
                </div>
              ) : (
                <button
                  onClick={() => !field.disabled && setEditingField(field.key)}
                  className="w-full flex items-center justify-between group"
                  disabled={field.disabled}
                >
                  <div className="text-left">
                    <p className="text-sm font-bold text-gray-500 dark:text-gray-400 tracking-wide">
                      {field.label}
                    </p>
                    <p className={`text-base font-medium mt-1 ${field.value ? 'text-gray-900 dark:text-white' : 'text-gray-400 dark:text-gray-500'}`}>
                      {field.displayValue || field.value || field.placeholder || 'Not set'}
                    </p>
                  </div>
                  {!field.disabled && (
                    <ChevronRight className="w-5 h-5 text-primary-300 dark:text-primary-400 group-hover:translate-x-1 transition-transform" />
                  )}
                </button>
              )}
            </div>
          ))}
        </div>

        {/* Fitness Settings Section */}
        <div className="mt-8">
          <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-4">Fitness Profile</h2>
          <div className="space-y-1">
            {fitnessFields.map((field) => (
              <div key={field.key} className="py-4 border-b border-gray-100 dark:border-gray-800">
                {editingField === `profile.${field.key}` ? (
                  <div className="space-y-2">
                    <label className="text-sm font-bold text-gray-500 dark:text-gray-400 tracking-wide">
                      {field.label}
                    </label>
                    {field.type === 'select' ? (
                      <select
                        value={field.value}
                        onChange={(e) => setFormData({
                          ...formData,
                          profile: { ...formData.profile, [field.key]: e.target.value }
                        })}
                        className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-400/50 focus:border-primary-400"
                      >
                        {field.options.map((opt) => (
                          <option key={opt.value} value={opt.value}>{opt.label}</option>
                        ))}
                      </select>
                    ) : (
                      <div className="relative">
                        <input
                          type={field.type}
                          value={field.value}
                          onChange={(e) => setFormData({
                            ...formData,
                            profile: { ...formData.profile, [field.key]: e.target.value }
                          })}
                          placeholder={field.placeholder}
                          className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-400/50 focus:border-primary-400 pr-12"
                          autoFocus
                        />
                        {field.unit && (
                          <span className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-500 dark:text-gray-400 text-sm">
                            {field.unit}
                          </span>
                        )}
                      </div>
                    )}
                    <div className="flex gap-2 pt-2">
                      <button
                        onClick={() => setEditingField(null)}
                        className="flex-1 px-4 py-2 text-sm font-medium text-gray-600 dark:text-gray-400 bg-gray-100 dark:bg-gray-800 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={handleSave}
                        disabled={isSaving}
                        className="flex-1 px-4 py-2 text-sm font-medium text-gray-900 bg-white rounded-lg hover:bg-gray-100 transition-colors disabled:opacity-50 shadow-sm border border-gray-200"
                      >
                        {isSaving ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : 'Save'}
                      </button>
                    </div>
                    {renderSaveMessage()}
                  </div>
                ) : (
                  <button
                    onClick={() => setEditingField(`profile.${field.key}`)}
                    className="w-full flex items-center justify-between group"
                  >
                    <div className="text-left">
                      <p className="text-sm font-bold text-gray-500 dark:text-gray-400 tracking-wide">
                        {field.label}
                      </p>
                      <p className={`text-base font-medium mt-1 ${field.value ? 'text-gray-900 dark:text-white' : 'text-gray-400 dark:text-gray-500'}`}>
                        {field.type === 'select'
                          ? field.options.find(o => o.value === field.value)?.label || 'Not set'
                          : field.value
                            ? `${field.value} ${field.unit || ''}`
                            : 'Not set'
                        }
                      </p>
                    </div>
                    <ChevronRight className="w-5 h-5 text-primary-300 dark:text-primary-400 group-hover:translate-x-1 transition-transform" />
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Goals & Injuries Section — profile arrays the coach reads */}
        <div className="mt-8">
          <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-1">Goals & Injuries</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
            Your coach uses these directly when planning. Injuries here are your standing baseline —
            the coach also tracks day-to-day notes in Sensei Memory.
          </p>
          <div className="space-y-1">
            {renderChipEditor('Goals', 'goals', Target, newGoal, setNewGoal, 'e.g. 20 consecutive pull-ups')}
            {renderChipEditor('Injuries', 'injuries', HeartPulse, newInjury, setNewInjury, 'e.g. right shoulder — avoid overhead')}
          </div>
        </div>

        {/* Sports News Section */}
        <div className="mt-8">
          <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-1">Sports News</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
            News from sports you follow shows up as cards on your dashboard.
          </p>
          <div className="space-y-1">
            <div className="py-4 border-b border-gray-100 dark:border-gray-800">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Newspaper className="w-5 h-5 text-primary-400" />
                  <div>
                    <p className="text-sm font-bold text-gray-500 dark:text-gray-400 tracking-wide">
                      Show Sports News
                    </p>
                    <p className="text-base font-medium text-gray-900 dark:text-white mt-1">
                      {formData.settings.sportsNews?.enabled ? 'Enabled' : 'Disabled'}
                    </p>
                  </div>
                </div>
                <Switch
                  checked={formData.settings.sportsNews?.enabled ?? true}
                  onCheckedChange={(checked) => commitSettings({
                    ...formData.settings,
                    sportsNews: { ...formData.settings.sportsNews, enabled: checked }
                  })}
                  className="data-[state=checked]:bg-primary-400"
                />
              </div>
            </div>
            <div className="py-4 border-b border-gray-100 dark:border-gray-800">
              <p className="text-sm font-bold text-gray-500 dark:text-gray-400 tracking-wide mb-2">
                Sports I Follow
              </p>
              <div className="flex flex-wrap gap-2 mb-2">
                {(formData.settings.sportsNews?.follows || []).length === 0 ? (
                  <span className="text-sm text-gray-400 dark:text-gray-500">
                    Not following anything yet — add a sport or league below
                  </span>
                ) : (
                  (formData.settings.sportsNews?.follows || []).map((follow) => (
                    <span
                      key={follow.label}
                      className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-primary-100 dark:bg-primary-900/30 text-sm text-gray-800 dark:text-gray-200"
                    >
                      {follow.label}
                      <button onClick={() => removeNewsFollow(follow.label)} className="hover:text-red-500" title="Unfollow">
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </span>
                  ))
                )}
              </div>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newsQuery}
                  onChange={(e) => { setNewsQuery(e.target.value); setNewsError(null); }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      addNewsFollow(newsQuery);
                    }
                  }}
                  disabled={newsAdding}
                  maxLength={100}
                  placeholder="e.g. Premier League, F1, college football"
                  className="flex-1 px-4 py-2 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-400/50 disabled:opacity-60"
                />
                <button
                  onClick={() => addNewsFollow(newsQuery)}
                  disabled={!newsQuery.trim() || newsAdding}
                  className="px-4 py-2 bg-primary-400 text-gray-900 font-semibold rounded-xl hover:bg-primary-500 transition-colors disabled:opacity-50 inline-flex items-center gap-2"
                >
                  {newsAdding && <Loader2 className="w-4 h-4 animate-spin" />}
                  {newsAdding ? 'Finding…' : 'Follow'}
                </button>
              </div>
              {newsAdding && (
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">
                  Finding ESPN coverage — this can take a little while…
                </p>
              )}
              {newsError && (
                <div className="mt-2 p-3 rounded-lg flex items-center gap-2 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  <span className="text-sm">{newsError}</span>
                </div>
              )}
              {newsSuggestions.length > 0 && (
                <div className="mt-3">
                  <p className="text-xs text-gray-400 dark:text-gray-500 mb-1.5">Popular</p>
                  <div className="flex flex-wrap gap-2">
                    {newsSuggestions.map((label) => (
                      <button
                        key={label}
                        onClick={() => addNewsFollow(label)}
                        disabled={newsAdding}
                        className="px-3 py-1 rounded-full text-sm bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors disabled:opacity-50"
                      >
                        + {label}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Sensei Memory Section */}
        <div className="mt-8">
          <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-4">Sensei Memory</h2>
          <div className="space-y-1">
            <div className="py-4 border-b border-gray-100 dark:border-gray-800">
              <button
                onClick={() => navigate('/Settings/Memories')}
                className="w-full flex items-center justify-between group"
              >
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-primary-100 dark:bg-primary-900/30">
                    <Brain className="w-5 h-5 text-primary-500 dark:text-primary-400" />
                  </div>
                  <div className="text-left">
                    <p className="text-sm font-bold text-gray-500 dark:text-gray-400 tracking-wide">
                      Manage Memories
                    </p>
                    <p className="text-base font-medium text-gray-900 dark:text-white mt-1">
                      Help Sensei remember your preferences
                    </p>
                  </div>
                </div>
                <ChevronRight className="w-5 h-5 text-primary-300 dark:text-primary-400 group-hover:translate-x-1 transition-transform" />
              </button>
            </div>
          </div>
        </div>

        {/* App Settings Section */}
        <div className="mt-8">
          <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-4">App Settings</h2>
          <div className="space-y-1">
            {/* Dark Mode Toggle */}
            <div className="py-4 border-b border-gray-100 dark:border-gray-800">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  {isDark ? (
                    <Moon className="w-5 h-5 text-primary-400" />
                  ) : (
                    <Sun className="w-5 h-5 text-yellow-500" />
                  )}
                  <div>
                    <p className="text-sm font-bold text-gray-500 dark:text-gray-400 tracking-wide">
                      Dark Mode
                    </p>
                    <p className="text-base font-medium text-gray-900 dark:text-white mt-1">
                      {isDark ? 'Enabled' : 'Disabled'}
                    </p>
                  </div>
                </div>
                <Switch
                  checked={isDark}
                  onCheckedChange={toggleTheme}
                  className="data-[state=checked]:bg-primary-400"
                />
              </div>
            </div>

            {/* Units Toggle */}
            <div className="py-4 border-b border-gray-100 dark:border-gray-800">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-bold text-gray-500 dark:text-gray-400 tracking-wide">
                    Units
                  </p>
                  <p className="text-base font-medium text-gray-900 dark:text-white mt-1">
                    {formData.settings.units === 'metric' ? 'Metric (kg, cm)' : 'Imperial (lbs, in)'}
                  </p>
                </div>
                <button
                  onClick={() => {
                    const newUnits = formData.settings.units === 'metric' ? 'imperial' : 'metric';
                    setFormData({
                      ...formData,
                      settings: { ...formData.settings, units: newUnits }
                    });
                    handleSave();
                  }}
                  className="px-4 py-2 text-sm font-medium text-primary-600 dark:text-primary-400 bg-primary-50 dark:bg-primary-900/30 rounded-lg hover:bg-primary-100 dark:hover:bg-primary-900/50 transition-colors"
                >
                  Switch
                </button>
              </div>
            </div>

            {/* Week Start Day Toggle */}
            <div className="py-4 border-b border-gray-100 dark:border-gray-800">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-bold text-gray-500 dark:text-gray-400 tracking-wide">
                    Week Starts On
                  </p>
                  <p className="text-base font-medium text-gray-900 dark:text-white mt-1">
                    {formData.settings.weekStartDay === 0 ? 'Sunday' : 'Monday'}
                  </p>
                </div>
                <button
                  onClick={() => {
                    const newWeekStartDay = formData.settings.weekStartDay === 0 ? 1 : 0;
                    setFormData({
                      ...formData,
                      settings: { ...formData.settings, weekStartDay: newWeekStartDay }
                    });
                    handleSave();
                  }}
                  className="px-4 py-2 text-sm font-medium text-primary-600 dark:text-primary-400 bg-primary-50 dark:bg-primary-900/30 rounded-lg hover:bg-primary-100 dark:hover:bg-primary-900/50 transition-colors"
                >
                  Switch
                </button>
              </div>
            </div>

            {/* Timezone Setting */}
            <div className="py-4 border-b border-gray-100 dark:border-gray-800">
              <div className="flex items-center justify-between">
                <div className="flex-1 mr-4">
                  <p className="text-sm font-bold text-gray-500 dark:text-gray-400 tracking-wide">
                    Timezone
                  </p>
                  <p className="text-base font-medium text-gray-900 dark:text-white mt-1">
                    {formData.settings.timezone || 'Not set'}
                  </p>
                </div>
                <button
                  onClick={() => {
                    const detectedTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
                    setFormData({
                      ...formData,
                      settings: { ...formData.settings, timezone: detectedTimezone }
                    });
                    handleSave();
                  }}
                  className="px-4 py-2 text-sm font-medium text-primary-600 dark:text-primary-400 bg-primary-50 dark:bg-primary-900/30 rounded-lg hover:bg-primary-100 dark:hover:bg-primary-900/50 transition-colors"
                >
                  Detect
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Sign-in & Security Section */}
        <div className="mt-8">
          <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-4">Sign-in &amp; Security</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
            Choose how you sign in. You can use Google, an email &amp; password, or both.
          </p>

          {pwMessage && (
            <div className={`mb-4 p-3 rounded-lg flex items-center gap-2 ${
              pwMessage.type === 'success'
                ? 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400'
                : 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400'
            }`}>
              {pwMessage.type === 'success' ? (
                <CheckCircle className="w-5 h-5 flex-shrink-0" />
              ) : (
                <AlertCircle className="w-5 h-5 flex-shrink-0" />
              )}
              <span className="text-sm">{pwMessage.text}</span>
            </div>
          )}

          <div className="space-y-1">
            {/* Google sign-in method */}
            <div className="py-4 border-b border-gray-100 dark:border-gray-800">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-gray-100 dark:bg-gray-800">
                    <svg className="w-5 h-5" viewBox="0 0 24 24">
                      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/>
                      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                    </svg>
                  </div>
                  <div className="text-left">
                    <p className="text-sm font-bold text-gray-500 dark:text-gray-400 tracking-wide">
                      Google
                    </p>
                    {user?.googleLinked ? (
                      <p className="text-base font-medium text-gray-900 dark:text-white mt-1 flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-green-500"></span>
                        Connected
                      </p>
                    ) : (
                      <p className="text-base font-medium text-gray-400 dark:text-gray-500 mt-1">
                        Not connected
                      </p>
                    )}
                  </div>
                </div>
                {!user?.googleLinked && (
                  <button
                    onClick={handleConnectGoogle}
                    className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-900 dark:text-white bg-gray-100 dark:bg-gray-800 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
                  >
                    <Link className="w-4 h-4" />
                    Connect
                  </button>
                )}
              </div>
            </div>

            {/* Password sign-in method */}
            <div className="py-4 border-b border-gray-100 dark:border-gray-800">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-primary-100 dark:bg-primary-900/30">
                    <KeyRound className="w-5 h-5 text-primary-500 dark:text-primary-400" />
                  </div>
                  <div className="text-left">
                    <p className="text-sm font-bold text-gray-500 dark:text-gray-400 tracking-wide">
                      Email &amp; Password
                    </p>
                    {user?.hasPassword ? (
                      <p className="text-base font-medium text-gray-900 dark:text-white mt-1 flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-green-500"></span>
                        Password set
                      </p>
                    ) : (
                      <p className="text-base font-medium text-gray-400 dark:text-gray-500 mt-1">
                        No password yet
                      </p>
                    )}
                  </div>
                </div>
                {!showPwForm && (
                  <button
                    onClick={() => { setShowPwForm(true); setPwMessage(null); }}
                    className="px-4 py-2 text-sm font-medium text-primary-600 dark:text-primary-400 bg-primary-50 dark:bg-primary-900/30 rounded-lg hover:bg-primary-100 dark:hover:bg-primary-900/50 transition-colors"
                  >
                    {user?.hasPassword ? 'Change' : 'Set password'}
                  </button>
                )}
              </div>

              {showPwForm && (
                <div className="mt-4 space-y-3">
                  {user?.hasPassword && (
                    <input
                      type="password"
                      value={pwForm.currentPassword}
                      onChange={(e) => setPwForm({ ...pwForm, currentPassword: e.target.value })}
                      placeholder="Current password"
                      autoComplete="current-password"
                      className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-400/50 focus:border-primary-400"
                    />
                  )}
                  <input
                    type="password"
                    value={pwForm.newPassword}
                    onChange={(e) => setPwForm({ ...pwForm, newPassword: e.target.value })}
                    placeholder="New password (min 6 characters)"
                    autoComplete="new-password"
                    className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-400/50 focus:border-primary-400"
                  />
                  <input
                    type="password"
                    value={pwForm.confirmPassword}
                    onChange={(e) => setPwForm({ ...pwForm, confirmPassword: e.target.value })}
                    placeholder="Confirm new password"
                    autoComplete="new-password"
                    className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-400/50 focus:border-primary-400"
                  />
                  <div className="flex gap-2 pt-1">
                    <button
                      onClick={() => {
                        setShowPwForm(false);
                        setPwForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
                        setPwMessage(null);
                      }}
                      className="flex-1 px-4 py-2 text-sm font-medium text-gray-600 dark:text-gray-400 bg-gray-100 dark:bg-gray-800 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleSetPassword}
                      disabled={pwSaving}
                      className="flex-1 px-4 py-2 text-sm font-medium text-gray-900 bg-white rounded-lg hover:bg-gray-100 transition-colors disabled:opacity-50 shadow-sm border border-gray-200"
                    >
                      {pwSaving ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : (user?.hasPassword ? 'Update password' : 'Set password')}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Connected Apps Section */}
        <div className="mt-8">
          <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-4">Connected Apps</h2>

          {/* Strava Message */}
          {stravaMessage && (
            <div className={`mb-4 p-3 rounded-lg flex items-center gap-2 ${
              stravaMessage.type === 'success'
                ? 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400'
                : 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400'
            }`}>
              {stravaMessage.type === 'success' ? (
                <CheckCircle className="w-5 h-5 flex-shrink-0" />
              ) : (
                <AlertCircle className="w-5 h-5 flex-shrink-0" />
              )}
              <span className="text-sm">{stravaMessage.text}</span>
            </div>
          )}

          <div className="space-y-1">
            {/* Strava Integration */}
            <div className="py-4 border-b border-gray-100 dark:border-gray-800">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  {/* Strava Logo */}
                  <div className="p-2 rounded-lg bg-[#FC4C02]/10">
                    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="#FC4C02">
                      <path d="M15.387 17.944l-2.089-4.116h-3.065L15.387 24l5.15-10.172h-3.066m-7.008-5.599l2.836 5.598h4.172L10.463 0l-7 13.828h4.169"/>
                    </svg>
                  </div>
                  <div className="text-left">
                    <p className="text-sm font-bold text-gray-500 dark:text-gray-400 tracking-wide">
                      Strava
                    </p>
                    {stravaLoading ? (
                      <p className="text-base font-medium text-gray-400 dark:text-gray-500 mt-1 flex items-center gap-2">
                        <Loader2 className="w-3 h-3 animate-spin" />
                        Loading...
                      </p>
                    ) : stravaStatus?.connected ? (
                      <div className="mt-1">
                        <p className="text-base font-medium text-gray-900 dark:text-white flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full bg-green-500"></span>
                          Connected as {stravaStatus.athlete?.name || stravaStatus.athlete?.username}
                        </p>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                          {stravaStatus.totalActivitiesSynced || 0} activities synced
                        </p>
                      </div>
                    ) : (
                      <p className="text-base font-medium text-gray-400 dark:text-gray-500 mt-1">
                        Not connected
                      </p>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {stravaStatus?.connected ? (
                    <>
                      <button
                        onClick={handleStravaSync}
                        disabled={stravaSyncing}
                        className="p-2 text-[#FC4C02] bg-[#FC4C02]/10 rounded-lg hover:bg-[#FC4C02]/20 transition-colors disabled:opacity-50"
                        title="Sync activities"
                      >
                        <RefreshCw className={`w-5 h-5 ${stravaSyncing ? 'animate-spin' : ''}`} />
                      </button>
                      <button
                        onClick={() => setShowDisconnectDialog(true)}
                        disabled={stravaLoading}
                        className="p-2 text-red-500 bg-red-50 dark:bg-red-900/20 rounded-lg hover:bg-red-100 dark:hover:bg-red-900/40 transition-colors disabled:opacity-50"
                        title="Disconnect"
                      >
                        <Unlink className="w-5 h-5" />
                      </button>
                    </>
                  ) : (
                    <button
                      onClick={handleStravaConnect}
                      disabled={stravaLoading}
                      className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-[#FC4C02] rounded-lg hover:bg-[#e04502] transition-colors disabled:opacity-50"
                    >
                      {stravaLoading ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Link className="w-4 h-4" />
                      )}
                      Connect
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Claude Connector (MCP) */}
            <div className="py-4 border-b border-gray-100 dark:border-gray-800">
              <div className="flex items-start gap-3">
                <div className="p-2 rounded-lg bg-primary-100 dark:bg-primary-900/30">
                  <Sparkles className="w-5 h-5 text-primary-500 dark:text-primary-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-gray-500 dark:text-gray-400 tracking-wide">
                    Claude (Model Context Protocol)
                  </p>
                  <p className="text-sm text-gray-600 dark:text-gray-300 mt-1">
                    Manage your workouts from Claude on any device. In Claude, open
                    Settings → Connectors → Add custom connector, then paste this URL
                    and sign in with your SynergyFit account:
                  </p>
                  <div className="mt-3 flex items-center gap-2">
                    <code className="flex-1 min-w-0 px-3 py-2 text-xs bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-gray-900 dark:text-white overflow-x-auto whitespace-nowrap">
                      {`${import.meta.env.VITE_API_URL || 'http://localhost:5001'}/mcp`}
                    </code>
                    <button
                      onClick={() => navigator.clipboard?.writeText(`${import.meta.env.VITE_API_URL || 'http://localhost:5001'}/mcp`)}
                      className="p-2 text-primary-600 dark:text-primary-400 bg-primary-50 dark:bg-primary-900/30 rounded-lg hover:bg-primary-100 dark:hover:bg-primary-900/50 transition-colors"
                      title="Copy connector URL"
                    >
                      <Copy className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Save All Changes Button */}
        <div className="mt-8 pb-4">
          {saveMessage && <div className="mb-4">{renderSaveMessage()}</div>}
          <button
            onClick={handleSave}
            disabled={isSaving}
            className="w-full py-4 bg-white dark:bg-white text-gray-900 font-semibold rounded-xl shadow-lg hover:bg-gray-100 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {isSaving ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                Saving...
              </>
            ) : (
              'Save Changes'
            )}
          </button>
        </div>
      </div>

      {/* Strava Disconnect Dialog */}
      <AlertDialog open={showDisconnectDialog} onOpenChange={setShowDisconnectDialog}>
        <AlertDialogContent className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-gray-900 dark:text-white">
              Disconnect Strava
            </AlertDialogTitle>
            <AlertDialogDescription className="text-gray-600 dark:text-gray-400">
              Do you want to delete all your synced Strava activities? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col sm:flex-row gap-2">
            <AlertDialogCancel
              onClick={() => setShowDisconnectDialog(false)}
              className="bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-white hover:bg-gray-200 dark:hover:bg-gray-600 border-0"
            >
              Cancel
            </AlertDialogCancel>
            <button
              onClick={() => handleStravaDisconnect(false)}
              className="inline-flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 rounded-md hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
            >
              <Unlink className="w-4 h-4" />
              Keep Activities
            </button>
            <button
              onClick={() => handleStravaDisconnect(true)}
              className="inline-flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-md hover:bg-red-700 transition-colors"
            >
              <Trash2 className="w-4 h-4" />
              Delete All Activities
            </button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
