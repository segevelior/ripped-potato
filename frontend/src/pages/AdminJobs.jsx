import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ChevronLeft,
  Play,
  Calendar,
  Database,
  Loader2,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Clock,
  RefreshCw,
  User
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { apiService } from '@/services/api';

const formatDuration = (ms) => {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60000).toFixed(1)}min`;
};

const formatDate = (dateString) => {
  if (!dateString) return 'Never';
  return new Date(dateString).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
};

// Job Result Display Component
const JobResultCard = ({ result, onClose }) => {
  if (!result) return null;

  const { success, stats, duration, error } = result;

  return (
    <Card className={`border-2 ${success ? 'border-green-500/50 bg-green-50 dark:bg-green-900/10' : 'border-red-500/50 bg-red-50 dark:bg-red-900/10'}`}>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            {success ? (
              <CheckCircle2 className="w-5 h-5 text-green-500" />
            ) : (
              <XCircle className="w-5 h-5 text-red-500" />
            )}
            Job {success ? 'Completed Successfully' : 'Failed'}
          </CardTitle>
          <Button variant="ghost" size="sm" onClick={onClose}>
            Close
          </Button>
        </div>
        {duration && (
          <CardDescription className="flex items-center gap-1">
            <Clock className="w-3 h-3" />
            Duration: {duration}
          </CardDescription>
        )}
      </CardHeader>
      <CardContent>
        {error && (
          <div className="mb-4 p-3 bg-red-100 dark:bg-red-900/30 rounded-lg text-red-700 dark:text-red-300 text-sm">
            {error}
          </div>
        )}

        {stats && (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <div className="p-3 bg-white dark:bg-gray-800 rounded-lg">
              <div className="text-2xl font-bold text-blue-600">{stats.workoutLogsProcessed || 0}</div>
              <div className="text-xs text-gray-500">WorkoutLogs Processed</div>
            </div>
            <div className="p-3 bg-white dark:bg-gray-800 rounded-lg">
              <div className="text-2xl font-bold text-green-600">{stats.workoutLogsFixed || 0}</div>
              <div className="text-xs text-gray-500">WorkoutLogs Fixed</div>
            </div>
            <div className="p-3 bg-white dark:bg-gray-800 rounded-lg">
              <div className="text-2xl font-bold text-blue-600">{stats.externalActivitiesProcessed || 0}</div>
              <div className="text-xs text-gray-500">Strava Activities Processed</div>
            </div>
            <div className="p-3 bg-white dark:bg-gray-800 rounded-lg">
              <div className="text-2xl font-bold text-green-600">{stats.externalActivitiesFixed || 0}</div>
              <div className="text-xs text-gray-500">Strava Activities Fixed</div>
            </div>
            <div className="p-3 bg-white dark:bg-gray-800 rounded-lg">
              <div className="text-2xl font-bold text-orange-600">{stats.orphanedCalendarEventsDeleted || 0}</div>
              <div className="text-xs text-gray-500">Orphaned Events Deleted</div>
            </div>
            <div className="p-3 bg-white dark:bg-gray-800 rounded-lg">
              <div className="text-2xl font-bold text-red-600">{stats.errors?.length || 0}</div>
              <div className="text-xs text-gray-500">Errors</div>
            </div>
          </div>
        )}

        {stats?.errors?.length > 0 && (
          <div className="mt-4">
            <h4 className="text-sm font-medium mb-2 text-red-600">Errors:</h4>
            <ScrollArea className="h-32 border rounded-lg p-2 bg-white dark:bg-gray-800">
              {stats.errors.map((err, idx) => (
                <div key={idx} className="text-xs text-red-500 mb-1 font-mono">
                  [{err.phase}] {err.error}
                </div>
              ))}
            </ScrollArea>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

// Job Card Component
const JobCard = ({ job, onRun, isRunning }) => {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-lg ${job.color}`}>
              {job.icon}
            </div>
            <div>
              <CardTitle className="text-lg">{job.name}</CardTitle>
              <CardDescription>{job.description}</CardDescription>
            </div>
          </div>
          <Badge variant="outline" className="text-xs">
            {job.schedule}
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          <div className="text-sm text-gray-600 dark:text-gray-400">
            {job.details}
          </div>
          <div className="flex gap-2">
            <Button
              onClick={() => onRun('all')}
              disabled={isRunning}
              className="gap-2"
            >
              {isRunning ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Play className="w-4 h-4" />
              )}
              Run Now
            </Button>
            {job.supportsUser && (
              <Button
                variant="outline"
                onClick={() => onRun('user')}
                disabled={isRunning}
                className="gap-2"
              >
                <User className="w-4 h-4" />
                Run for User
              </Button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default function AdminJobs() {
  const navigate = useNavigate();
  const [isRunning, setIsRunning] = useState({});
  const [lastResults, setLastResults] = useState({});
  const [userIdModal, setUserIdModal] = useState({ isOpen: false, jobId: null });
  const [userId, setUserId] = useState('');

  // Check authorization
  useEffect(() => {
    const authUser = JSON.parse(localStorage.getItem('authUser') || '{}');
    if (authUser.role !== 'superAdmin') {
      navigate('/');
    }
  }, [navigate]);

  const jobs = [
    {
      id: 'calendar-consistency',
      name: 'Calendar Consistency Sync',
      description: 'Ensures data consistency between CalendarEvent and linked collections',
      details: 'This job scans WorkoutLog and ExternalActivity collections to ensure each has a corresponding CalendarEvent. It also removes orphaned CalendarEvents that point to non-existent documents.',
      icon: <Calendar className="w-5 h-5 text-white" />,
      color: 'bg-blue-500',
      schedule: 'Every 6 hours',
      supportsUser: true,
      run: async (userId) => {
        if (userId) {
          return await apiService.adminJobs.runCalendarConsistencyForUser(userId);
        }
        return await apiService.adminJobs.runCalendarConsistency();
      }
    }
  ];

  const handleRunJob = async (jobId, mode) => {
    if (mode === 'user') {
      setUserIdModal({ isOpen: true, jobId });
      return;
    }

    const job = jobs.find(j => j.id === jobId);
    if (!job) return;

    setIsRunning(prev => ({ ...prev, [jobId]: true }));
    setLastResults(prev => ({ ...prev, [jobId]: null }));

    try {
      const result = await job.run();
      setLastResults(prev => ({
        ...prev,
        [jobId]: {
          success: result.success !== false,
          stats: result.stats,
          duration: result.duration || result.data?.duration,
          timestamp: new Date().toISOString()
        }
      }));
    } catch (error) {
      setLastResults(prev => ({
        ...prev,
        [jobId]: {
          success: false,
          error: error.message,
          timestamp: new Date().toISOString()
        }
      }));
    } finally {
      setIsRunning(prev => ({ ...prev, [jobId]: false }));
    }
  };

  const handleRunForUser = async () => {
    if (!userId.trim()) return;

    const jobId = userIdModal.jobId;
    const job = jobs.find(j => j.id === jobId);
    if (!job) return;

    setUserIdModal({ isOpen: false, jobId: null });
    setIsRunning(prev => ({ ...prev, [jobId]: true }));
    setLastResults(prev => ({ ...prev, [jobId]: null }));

    try {
      const result = await job.run(userId.trim());
      setLastResults(prev => ({
        ...prev,
        [jobId]: {
          success: result.success !== false,
          stats: result.stats,
          duration: result.duration || result.data?.duration,
          userId: userId.trim(),
          timestamp: new Date().toISOString()
        }
      }));
    } catch (error) {
      setLastResults(prev => ({
        ...prev,
        [jobId]: {
          success: false,
          error: error.message,
          timestamp: new Date().toISOString()
        }
      }));
    } finally {
      setIsRunning(prev => ({ ...prev, [jobId]: false }));
      setUserId('');
    }
  };

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
          <h1 className="text-lg font-bold text-gray-900 dark:text-white">Admin Jobs</h1>
          <div className="w-10" /> {/* Spacer for centering */}
        </div>
      </div>

      <div className="px-4 md:px-6 py-6 max-w-4xl mx-auto space-y-6">
        {/* Info Card */}
        <Card className="bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800">
          <CardContent className="py-4">
            <div className="flex items-start gap-3">
              <Database className="w-5 h-5 text-blue-500 mt-0.5" />
              <div>
                <h3 className="font-medium text-blue-900 dark:text-blue-100">Background Jobs</h3>
                <p className="text-sm text-blue-700 dark:text-blue-300 mt-1">
                  These jobs run automatically on a schedule in production. You can also trigger them manually here for testing or to fix data inconsistencies.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Job Cards */}
        {jobs.map(job => (
          <div key={job.id} className="space-y-4">
            <JobCard
              job={job}
              onRun={(mode) => handleRunJob(job.id, mode)}
              isRunning={isRunning[job.id]}
            />

            {/* Result Card */}
            {lastResults[job.id] && (
              <JobResultCard
                result={lastResults[job.id]}
                onClose={() => setLastResults(prev => ({ ...prev, [job.id]: null }))}
              />
            )}
          </div>
        ))}
      </div>

      {/* User ID Modal */}
      <Dialog open={userIdModal.isOpen} onOpenChange={(open) => setUserIdModal({ isOpen: open, jobId: null })}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Run Job for Specific User</DialogTitle>
            <DialogDescription>
              Enter the MongoDB User ID to run this job for a specific user only.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Label htmlFor="userId">User ID</Label>
            <Input
              id="userId"
              value={userId}
              onChange={(e) => setUserId(e.target.value)}
              placeholder="e.g., 507f1f77bcf86cd799439011"
              className="mt-2 font-mono"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setUserIdModal({ isOpen: false, jobId: null })}>
              Cancel
            </Button>
            <Button onClick={handleRunForUser} disabled={!userId.trim()}>
              Run Job
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
