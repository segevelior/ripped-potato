import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Camera, Moon, Sun, Loader2, Brain, Link, Unlink, RefreshCw, CheckCircle, AlertCircle, Trash2 } from 'lucide-react';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Switch } from '@/components/ui/switch';
import { useTheme } from '@/contexts/ThemeContext';
import { StravaIntegration } from '@/api/entities';
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
  const [user, setUser] = useState(null);
  const [editingField, setEditingField] = useState(null);

  // Strava integration state
  const [stravaStatus, setStravaStatus] = useState(null);
  const [stravaLoading, setStravaLoading] = useState(false);
  const [stravaSyncing, setStravaSyncing] = useState(false);
  const [stravaMessage, setStravaMessage] = useState(null);
  const [showDisconnectDialog, setShowDisconnectDialog] = useState(false);

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
    },
    settings: {
      units: 'metric',
      notifications: true,
      theme: 'light',
      weekStartDay: 0, // 0 = Sunday, 1 = Monday
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone
    }
  });

  useEffect(() => {
    fetchUserProfile();
    fetchStravaStatus();
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
          },
          settings: {
            units: userData.settings?.units || 'metric',
            notifications: userData.settings?.notifications ?? true,
            theme: userData.settings?.theme || 'light',
            weekStartDay: userData.settings?.weekStartDay ?? 0,
            timezone: userData.settings?.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone
          }
        });
      }
    } catch (error) {
      console.error('Error fetching profile:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
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
          profile: formData.profile,
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
      }
    } catch (error) {
      console.error('Error saving profile:', error);
    } finally {
      setIsSaving(false);
    }
  };

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
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary-400" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white dark:bg-gray-900 pb-24 md:pb-8">
      {/* Header */}
      <div className="sticky top-0 z-40 bg-white dark:bg-gray-900 border-b border-gray-100 dark:border-gray-800 shadow-sm">
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
          </div>
        </div>

        {/* Save All Changes Button */}
        <div className="mt-8 pb-4">
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
