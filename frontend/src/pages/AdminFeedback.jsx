import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ChevronLeft,
  ThumbsUp,
  ThumbsDown,
  MessageSquare,
  Bot,
  FileText,
  Download,
  RefreshCw,
  ArrowUpDown,
  Loader2,
  X,
  AlertTriangle,
  Expand,
  Sparkles,
  PanelRightOpen,
  PanelRightClose,
  User,
  Clock,
  GripVertical,
  Maximize2,
  Minimize2
} from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { apiService } from '@/services/api';
import ReactMarkdown from 'react-markdown';

const STATUS_OPTIONS = [
  { value: 'new', label: 'New', color: 'bg-blue-500' },
  { value: 'reviewed', label: 'Reviewed', color: 'bg-yellow-500' },
  { value: 'addressed', label: 'Addressed', color: 'bg-green-500' },
  { value: 'resolved', label: 'Resolved', color: 'bg-gray-500' },
  { value: 'dismissed', label: 'Dismissed', color: 'bg-red-500' },
];

const CATEGORY_OPTIONS = [
  { value: 'general', label: 'General' },
  { value: 'bug', label: 'Bug' },
  { value: 'feature_request', label: 'Feature Request' },
  { value: 'ui_ux', label: 'UI/UX' },
  { value: 'performance', label: 'Performance' },
  { value: 'other', label: 'Other' },
];

const formatDate = (dateString) => {
  if (!dateString) return 'N/A';
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
};

const UserProfileBadges = ({ profile }) => {
  if (!profile) return <span className="text-gray-400 text-xs">No profile</span>;

  return (
    <div className="flex flex-wrap gap-1">
      {profile.fitnessLevel && (
        <Badge variant="secondary" className="text-xs">
          {profile.fitnessLevel}
        </Badge>
      )}
      {profile.goals?.slice(0, 2).map((goal, i) => (
        <Badge key={i} variant="outline" className="text-xs">
          {goal}
        </Badge>
      ))}
      {profile.goals?.length > 2 && (
        <Badge variant="outline" className="text-xs">
          +{profile.goals.length - 2}
        </Badge>
      )}
    </div>
  );
};

// Truncated text component with max lines
const TruncatedText = ({ text, maxLines = 3, className = '' }) => {
  if (!text) return <span className="text-gray-400 italic text-sm">No comment</span>;

  return (
    <p
      className={`text-sm overflow-hidden ${className}`}
      style={{
        display: '-webkit-box',
        WebkitLineClamp: maxLines,
        WebkitBoxOrient: 'vertical',
        wordBreak: 'break-word'
      }}
      title={text}
    >
      {text}
    </p>
  );
};

// Resizable column hook
const useResizableColumns = (initialWidths) => {
  const [columnWidths, setColumnWidths] = useState(initialWidths);
  const resizingRef = useRef(null);
  const startXRef = useRef(0);
  const startWidthRef = useRef(0);

  const handleMouseDown = (columnKey, e) => {
    e.preventDefault();
    resizingRef.current = columnKey;
    startXRef.current = e.clientX;
    startWidthRef.current = columnWidths[columnKey];
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };

  const handleMouseMove = useCallback((e) => {
    if (!resizingRef.current) return;
    const diff = e.clientX - startXRef.current;
    const newWidth = Math.max(80, startWidthRef.current + diff);
    setColumnWidths(prev => ({
      ...prev,
      [resizingRef.current]: newWidth
    }));
  }, []);

  const handleMouseUp = useCallback(() => {
    resizingRef.current = null;
    document.removeEventListener('mousemove', handleMouseMove);
    document.removeEventListener('mouseup', handleMouseUp);
  }, [handleMouseMove]);

  return { columnWidths, handleMouseDown };
};

// Resizable panel hook for right sidebar
const useResizablePanel = (initialWidth = 450, minWidth = 300, maxWidthPercent = 90) => {
  const [panelWidth, setPanelWidth] = useState(initialWidth);
  const isResizingRef = useRef(false);
  const startXRef = useRef(0);
  const startWidthRef = useRef(0);

  const handleMouseDown = useCallback((e) => {
    e.preventDefault();
    isResizingRef.current = true;
    startXRef.current = e.clientX || e.touches?.[0]?.clientX;
    startWidthRef.current = panelWidth;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  }, [panelWidth]);

  const handleMouseMove = useCallback((e) => {
    if (!isResizingRef.current) return;
    const clientX = e.clientX || e.touches?.[0]?.clientX;
    const diff = startXRef.current - clientX; // Inverted because dragging left increases width
    const maxWidth = window.innerWidth * (maxWidthPercent / 100);
    const newWidth = Math.min(maxWidth, Math.max(minWidth, startWidthRef.current + diff));
    setPanelWidth(newWidth);
  }, [minWidth, maxWidthPercent]);

  const handleMouseUp = useCallback(() => {
    isResizingRef.current = false;
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
  }, []);

  useEffect(() => {
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    document.addEventListener('touchmove', handleMouseMove);
    document.addEventListener('touchend', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.removeEventListener('touchmove', handleMouseMove);
      document.removeEventListener('touchend', handleMouseUp);
    };
  }, [handleMouseMove, handleMouseUp]);

  return { panelWidth, handleMouseDown, setPanelWidth };
};

// Feedback detail modal
const FeedbackDetailModal = ({ feedback, type, isOpen, onClose }) => {
  if (!feedback) return null;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {feedback.rating === 'thumbs_up' ? (
              <ThumbsUp className="w-5 h-5 text-green-500" />
            ) : (
              <ThumbsDown className="w-5 h-5 text-red-500" />
            )}
            Feedback Details
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          {type === 'site' ? (
            <>
              <div>
                <label className="text-sm font-medium text-gray-500">Category</label>
                <p>{CATEGORY_OPTIONS.find(c => c.value === feedback.category)?.label || feedback.category}</p>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-500">Page</label>
                <p className="font-mono text-sm">{feedback.page || 'N/A'}</p>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-500">Feedback</label>
                <p className="whitespace-pre-wrap bg-gray-50 dark:bg-gray-800 p-3 rounded-lg">
                  {feedback.feedbackText || 'No comment provided'}
                </p>
              </div>
            </>
          ) : (
            <>
              <div>
                <label className="text-sm font-medium text-gray-500">User Question</label>
                <p className="whitespace-pre-wrap bg-blue-50 dark:bg-blue-900/20 p-3 rounded-lg">
                  {feedback.question_preview || 'N/A'}
                </p>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-500">AI Response</label>
                <p className="whitespace-pre-wrap bg-green-50 dark:bg-green-900/20 p-3 rounded-lg">
                  {feedback.answer_preview || 'N/A'}
                </p>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-500">User Feedback</label>
                <p className="whitespace-pre-wrap bg-gray-50 dark:bg-gray-800 p-3 rounded-lg">
                  {feedback.feedback_text || 'No comment provided'}
                </p>
              </div>
            </>
          )}
          <div>
            <label className="text-sm font-medium text-gray-500">User Profile</label>
            <div className="mt-1">
              <UserProfileBadges profile={feedback.userProfile} />
            </div>
          </div>
          <div>
            <label className="text-sm font-medium text-gray-500">Date</label>
            <p>{formatDate(type === 'site' ? feedback.createdAt : feedback.timestamp)}</p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default function AdminFeedback() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('site');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  // Site feedback state
  const [siteFeedbacks, setSiteFeedbacks] = useState([]);
  const [sitePagination, setSitePagination] = useState({ page: 1, pages: 1, total: 0 });
  const [siteFilters, setSiteFilters] = useState({ status: '', rating: '', category: '' });
  const [siteSort, setSiteSort] = useState({ sortBy: 'createdAt', sortOrder: 'desc' });
  const [selectedSite, setSelectedSite] = useState([]);

  // Conversation feedback state
  const [convFeedbacks, setConvFeedbacks] = useState([]);
  const [convPagination, setConvPagination] = useState({ page: 1, pages: 1, total: 0 });
  const [convFilters, setConvFilters] = useState({ rating: '', status: '' });
  const [convSort, setConvSort] = useState({ sortBy: 'timestamp', sortOrder: 'desc' });
  const [selectedConv, setSelectedConv] = useState([]);

  // Detail modal state
  const [detailModal, setDetailModal] = useState({ isOpen: false, feedback: null, type: null });

  // Right panel state
  const [showRightPanel, setShowRightPanel] = useState(false);
  const [rightPanelTab, setRightPanelTab] = useState('analysis');
  const [analysisContent, setAnalysisContent] = useState('');
  const [analysisStats, setAnalysisStats] = useState(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [conversationView, setConversationView] = useState(null);
  const [isLoadingConversation, setIsLoadingConversation] = useState(false);

  // Report state
  const [showReportModal, setShowReportModal] = useState(false);
  const [reportContent, setReportContent] = useState('');
  const [isGeneratingReport, setIsGeneratingReport] = useState(false);

  // Resizable right panel (min 300px, can expand up to 95% of viewport)
  const { panelWidth, handleMouseDown: handlePanelResize, setPanelWidth } = useResizablePanel(450, 300, 95);

  // Resizable columns
  const siteColumnWidths = useResizableColumns({
    checkbox: 40,
    rating: 60,
    feedback: 250,
    category: 100,
    profile: 150,
    page: 100,
    date: 110,
    status: 110,
    actions: 50
  });

  const convColumnWidths = useResizableColumns({
    checkbox: 40,
    rating: 60,
    question: 180,
    answer: 180,
    feedback: 180,
    profile: 150,
    date: 110,
    status: 110,
    actions: 80
  });

  // Check authorization
  useEffect(() => {
    const authUser = JSON.parse(localStorage.getItem('authUser') || '{}');
    if (authUser.role !== 'superAdmin') {
      navigate('/');
    }
  }, [navigate]);

  // Fetch site feedbacks
  const fetchSiteFeedbacks = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const params = {
        page: sitePagination.page,
        limit: 20,
        sortBy: siteSort.sortBy,
        sortOrder: siteSort.sortOrder,
        ...Object.fromEntries(Object.entries(siteFilters).filter(([_, v]) => v))
      };
      const result = await apiService.feedback.list(params);
      setSiteFeedbacks(result.feedbacks || []);
      setSitePagination(result.pagination || { page: 1, pages: 1, total: 0 });
    } catch (err) {
      console.error('Error fetching site feedbacks:', err);
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  }, [sitePagination.page, siteFilters, siteSort]);

  // Fetch conversation feedbacks
  const fetchConvFeedbacks = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const params = {
        page: convPagination.page,
        limit: 20,
        sortBy: convSort.sortBy,
        sortOrder: convSort.sortOrder,
        ...Object.fromEntries(Object.entries(convFilters).filter(([_, v]) => v))
      };
      const result = await apiService.feedback.listConversations(params);
      setConvFeedbacks(result.feedbacks || []);
      setConvPagination(result.pagination || { page: 1, pages: 1, total: 0 });
    } catch (err) {
      console.error('Error fetching conversation feedbacks:', err);
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  }, [convPagination.page, convFilters, convSort]);

  useEffect(() => {
    if (activeTab === 'site') {
      fetchSiteFeedbacks();
    } else {
      fetchConvFeedbacks();
    }
  }, [activeTab, fetchSiteFeedbacks, fetchConvFeedbacks]);

  // Handle site feedback status update
  const handleSiteStatusUpdate = async (id, newStatus) => {
    try {
      await apiService.feedback.update(id, { status: newStatus });
      fetchSiteFeedbacks();
    } catch (err) {
      console.error('Error updating status:', err);
    }
  };

  // Handle conversation feedback status update
  const handleConvStatusUpdate = async (conversationId, messageIndex, newStatus) => {
    try {
      await apiService.feedback.updateConversationStatus(conversationId, messageIndex, newStatus);
      fetchConvFeedbacks();
    } catch (err) {
      console.error('Error updating status:', err);
    }
  };

  // Bulk update site feedbacks
  const handleBulkSiteUpdate = async (newStatus) => {
    if (selectedSite.length === 0) return;
    try {
      await apiService.feedback.bulkUpdate(selectedSite, newStatus);
      setSelectedSite([]);
      fetchSiteFeedbacks();
    } catch (err) {
      console.error('Error bulk updating:', err);
    }
  };

  // Bulk update conversation feedbacks
  const handleBulkConvUpdate = async (newStatus) => {
    if (selectedConv.length === 0) return;
    try {
      const items = selectedConv.map(key => {
        const [conversationId, messageIndex] = key.split(':');
        return { conversationId, messageIndex: parseInt(messageIndex) };
      });
      await apiService.feedback.bulkUpdateConversations(items, newStatus);
      setSelectedConv([]);
      fetchConvFeedbacks();
    } catch (err) {
      console.error('Error bulk updating:', err);
    }
  };

  // Generate LLM analysis
  const handleGenerateAnalysis = async () => {
    const selectedSiteFeedbacks = siteFeedbacks.filter(f => selectedSite.includes(f._id));
    const selectedConvFeedbacks = convFeedbacks.filter(f =>
      selectedConv.includes(`${f.conversation_id}:${f.message_index}`)
    );

    if (selectedSiteFeedbacks.length === 0 && selectedConvFeedbacks.length === 0) {
      setError('Please select feedbacks to analyze');
      return;
    }

    setIsAnalyzing(true);
    setShowRightPanel(true);
    setRightPanelTab('analysis');
    setAnalysisContent('');
    setAnalysisStats(null);

    try {
      const result = await apiService.feedback.analyze(selectedSiteFeedbacks, selectedConvFeedbacks);
      setAnalysisContent(result.analysis);
      setAnalysisStats({
        model: result.model,
        tokens: result.tokens,
        stats: result.stats
      });
    } catch (err) {
      console.error('Error generating analysis:', err);
      setError('Failed to generate analysis');
    } finally {
      setIsAnalyzing(false);
    }
  };

  // Load conversation
  const handleLoadConversation = async (conversationId) => {
    setIsLoadingConversation(true);
    setShowRightPanel(true);
    setRightPanelTab('conversation');

    try {
      const result = await apiService.feedback.getConversation(conversationId);
      setConversationView(result);
    } catch (err) {
      console.error('Error loading conversation:', err);
      setError('Failed to load conversation');
    } finally {
      setIsLoadingConversation(false);
    }
  };

  // Generate report
  const handleGenerateReport = async () => {
    setIsGeneratingReport(true);
    try {
      const siteFeedbackIds = selectedSite.length > 0
        ? selectedSite
        : siteFeedbacks.map(f => f._id);

      const conversationFeedbacksToReport = selectedConv.length > 0
        ? convFeedbacks.filter(f => selectedConv.includes(`${f.conversation_id}:${f.message_index}`))
        : convFeedbacks;

      const result = await apiService.feedback.generateReport(siteFeedbackIds, conversationFeedbacksToReport);
      setReportContent(result.report);
      setShowReportModal(true);
    } catch (err) {
      console.error('Error generating report:', err);
      setError('Failed to generate report');
    } finally {
      setIsGeneratingReport(false);
    }
  };

  // Download report as markdown
  const handleDownloadReport = () => {
    const blob = new Blob([reportContent], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `feedback-report-${new Date().toISOString().split('T')[0]}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Download analysis
  const handleDownloadAnalysis = () => {
    const blob = new Blob([analysisContent], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `feedback-analysis-${new Date().toISOString().split('T')[0]}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Toggle selection
  const toggleSiteSelection = (id) => {
    setSelectedSite(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  const toggleConvSelection = (key) => {
    setSelectedConv(prev =>
      prev.includes(key) ? prev.filter(x => x !== key) : [...prev, key]
    );
  };

  const selectAllSite = () => {
    if (selectedSite.length === siteFeedbacks.length) {
      setSelectedSite([]);
    } else {
      setSelectedSite(siteFeedbacks.map(f => f._id));
    }
  };

  const selectAllConv = () => {
    if (selectedConv.length === convFeedbacks.length) {
      setSelectedConv([]);
    } else {
      setSelectedConv(convFeedbacks.map(f => `${f.conversation_id}:${f.message_index}`));
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
          <h1 className="text-lg font-bold text-gray-900 dark:text-white">Feedback Dashboard</h1>
          <div className="flex items-center gap-2">
            <Button
              onClick={handleGenerateAnalysis}
              disabled={isAnalyzing}
              size="sm"
              variant="outline"
              className="gap-2"
            >
              {isAnalyzing ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Sparkles className="w-4 h-4" />
              )}
              Analyze
            </Button>
            <Button
              onClick={handleGenerateReport}
              disabled={isGeneratingReport}
              size="sm"
              className="gap-2"
            >
              {isGeneratingReport ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <FileText className="w-4 h-4" />
              )}
              Report
            </Button>
            <Button
              onClick={() => setShowRightPanel(!showRightPanel)}
              size="sm"
              variant="ghost"
            >
              {showRightPanel ? (
                <PanelRightClose className="w-4 h-4" />
              ) : (
                <PanelRightOpen className="w-4 h-4" />
              )}
            </Button>
          </div>
        </div>
      </div>

      <div className="flex">
        {/* Main Content */}
        <div className={`flex-1 px-4 md:px-6 py-4 transition-all ${showRightPanel ? 'pr-2' : ''}`}>
          {error && (
            <div className="mb-4 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg flex items-center gap-3">
              <AlertTriangle className="w-5 h-5 text-red-500" />
              <span className="text-red-700 dark:text-red-300">{error}</span>
              <button onClick={() => setError(null)} className="ml-auto">
                <X className="w-4 h-4 text-red-500" />
              </button>
            </div>
          )}

          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className="grid w-full grid-cols-2 mb-6">
              <TabsTrigger value="site" className="gap-2">
                <MessageSquare className="w-4 h-4" />
                Site Feedback
                <Badge variant="secondary" className="ml-1">{sitePagination.total}</Badge>
              </TabsTrigger>
              <TabsTrigger value="conversation" className="gap-2">
                <Bot className="w-4 h-4" />
                Conversation
                <Badge variant="secondary" className="ml-1">{convPagination.total}</Badge>
              </TabsTrigger>
            </TabsList>

            {/* Site Feedback Tab */}
            <TabsContent value="site" className="space-y-4">
              {/* Filters and bulk actions */}
              <div className="flex flex-wrap gap-3 items-center justify-between">
                <div className="flex flex-wrap gap-2">
                  <Select
                    value={siteFilters.status}
                    onValueChange={(v) => setSiteFilters(prev => ({ ...prev, status: v === 'all' ? '' : v }))}
                  >
                    <SelectTrigger className="w-[130px]">
                      <SelectValue placeholder="Status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Status</SelectItem>
                      {STATUS_OPTIONS.map(s => (
                        <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  <Select
                    value={siteFilters.rating}
                    onValueChange={(v) => setSiteFilters(prev => ({ ...prev, rating: v === 'all' ? '' : v }))}
                  >
                    <SelectTrigger className="w-[130px]">
                      <SelectValue placeholder="Rating" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Ratings</SelectItem>
                      <SelectItem value="thumbs_up">Thumbs Up</SelectItem>
                      <SelectItem value="thumbs_down">Thumbs Down</SelectItem>
                    </SelectContent>
                  </Select>

                  <Select
                    value={siteFilters.category}
                    onValueChange={(v) => setSiteFilters(prev => ({ ...prev, category: v === 'all' ? '' : v }))}
                  >
                    <SelectTrigger className="w-[130px]">
                      <SelectValue placeholder="Category" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Categories</SelectItem>
                      {CATEGORY_OPTIONS.map(c => (
                        <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  <Button variant="outline" size="icon" onClick={fetchSiteFeedbacks}>
                    <RefreshCw className="w-4 h-4" />
                  </Button>
                </div>

                {selectedSite.length > 0 && (
                  <div className="flex gap-2 items-center">
                    <span className="text-sm text-gray-500">{selectedSite.length} selected</span>
                    <Select onValueChange={(v) => handleBulkSiteUpdate(v)}>
                      <SelectTrigger className="w-[150px]">
                        <SelectValue placeholder="Set Status" />
                      </SelectTrigger>
                      <SelectContent>
                        {STATUS_OPTIONS.map(s => (
                          <SelectItem key={s.value} value={s.value}>
                            Mark as {s.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>

              {/* Table */}
              <div className="border rounded-lg overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead style={{ width: siteColumnWidths.columnWidths.checkbox }}>
                        <Checkbox
                          checked={selectedSite.length === siteFeedbacks.length && siteFeedbacks.length > 0}
                          onCheckedChange={selectAllSite}
                        />
                      </TableHead>
                      <TableHead style={{ width: siteColumnWidths.columnWidths.rating }}>Rating</TableHead>
                      <TableHead
                        style={{ width: siteColumnWidths.columnWidths.feedback, position: 'relative' }}
                        className="group"
                      >
                        Feedback
                        <div
                          className="absolute right-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-blue-500 opacity-0 group-hover:opacity-100"
                          onMouseDown={(e) => siteColumnWidths.handleMouseDown('feedback', e)}
                        />
                      </TableHead>
                      <TableHead style={{ width: siteColumnWidths.columnWidths.category }}>Category</TableHead>
                      <TableHead style={{ width: siteColumnWidths.columnWidths.profile }}>User Profile</TableHead>
                      <TableHead style={{ width: siteColumnWidths.columnWidths.page }}>Page</TableHead>
                      <TableHead style={{ width: siteColumnWidths.columnWidths.date }}>
                        <button
                          onClick={() => setSiteSort(prev => ({
                            sortBy: 'createdAt',
                            sortOrder: prev.sortOrder === 'desc' ? 'asc' : 'desc'
                          }))}
                          className="flex items-center gap-1"
                        >
                          Date <ArrowUpDown className="w-3 h-3" />
                        </button>
                      </TableHead>
                      <TableHead style={{ width: siteColumnWidths.columnWidths.status }}>Status</TableHead>
                      <TableHead style={{ width: siteColumnWidths.columnWidths.actions }}></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {isLoading ? (
                      <TableRow>
                        <TableCell colSpan={9} className="text-center py-8">
                          <Loader2 className="w-6 h-6 animate-spin mx-auto text-gray-400" />
                        </TableCell>
                      </TableRow>
                    ) : siteFeedbacks.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={9} className="text-center py-8 text-gray-500">
                          No feedback found
                        </TableCell>
                      </TableRow>
                    ) : (
                      siteFeedbacks.map((feedback) => (
                        <TableRow key={feedback._id}>
                          <TableCell>
                            <Checkbox
                              checked={selectedSite.includes(feedback._id)}
                              onCheckedChange={() => toggleSiteSelection(feedback._id)}
                            />
                          </TableCell>
                          <TableCell>
                            {feedback.rating === 'thumbs_up' ? (
                              <ThumbsUp className="w-5 h-5 text-green-500" />
                            ) : (
                              <ThumbsDown className="w-5 h-5 text-red-500" />
                            )}
                          </TableCell>
                          <TableCell style={{ maxWidth: siteColumnWidths.columnWidths.feedback }}>
                            <TruncatedText text={feedback.feedbackText} maxLines={3} />
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline">
                              {CATEGORY_OPTIONS.find(c => c.value === feedback.category)?.label || feedback.category}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <UserProfileBadges profile={feedback.userProfile} />
                          </TableCell>
                          <TableCell>
                            <span className="text-xs text-gray-500 truncate block" style={{ maxWidth: siteColumnWidths.columnWidths.page }}>
                              {feedback.page || 'N/A'}
                            </span>
                          </TableCell>
                          <TableCell className="text-sm text-gray-500">
                            {formatDate(feedback.createdAt)}
                          </TableCell>
                          <TableCell>
                            <Select
                              value={feedback.status}
                              onValueChange={(v) => handleSiteStatusUpdate(feedback._id, v)}
                            >
                              <SelectTrigger className="w-[100px] h-8">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {STATUS_OPTIONS.map(s => (
                                  <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </TableCell>
                          <TableCell>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => setDetailModal({ isOpen: true, feedback, type: 'site' })}
                            >
                              <Expand className="w-4 h-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>

              {/* Pagination */}
              {sitePagination.pages > 1 && (
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-500">
                    Page {sitePagination.page} of {sitePagination.pages}
                  </span>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={sitePagination.page <= 1}
                      onClick={() => setSitePagination(prev => ({ ...prev, page: prev.page - 1 }))}
                    >
                      Previous
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={sitePagination.page >= sitePagination.pages}
                      onClick={() => setSitePagination(prev => ({ ...prev, page: prev.page + 1 }))}
                    >
                      Next
                    </Button>
                  </div>
                </div>
              )}
            </TabsContent>

            {/* Conversation Feedback Tab */}
            <TabsContent value="conversation" className="space-y-4">
              {/* Filters and bulk actions */}
              <div className="flex flex-wrap gap-3 items-center justify-between">
                <div className="flex flex-wrap gap-2">
                  <Select
                    value={convFilters.status}
                    onValueChange={(v) => setConvFilters(prev => ({ ...prev, status: v === 'all' ? '' : v }))}
                  >
                    <SelectTrigger className="w-[130px]">
                      <SelectValue placeholder="Status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Status</SelectItem>
                      {STATUS_OPTIONS.map(s => (
                        <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  <Select
                    value={convFilters.rating}
                    onValueChange={(v) => setConvFilters(prev => ({ ...prev, rating: v === 'all' ? '' : v }))}
                  >
                    <SelectTrigger className="w-[130px]">
                      <SelectValue placeholder="Rating" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Ratings</SelectItem>
                      <SelectItem value="thumbs_up">Thumbs Up</SelectItem>
                      <SelectItem value="thumbs_down">Thumbs Down</SelectItem>
                    </SelectContent>
                  </Select>

                  <Button variant="outline" size="icon" onClick={fetchConvFeedbacks}>
                    <RefreshCw className="w-4 h-4" />
                  </Button>
                </div>

                {selectedConv.length > 0 && (
                  <div className="flex gap-2 items-center">
                    <span className="text-sm text-gray-500">{selectedConv.length} selected</span>
                    <Select onValueChange={(v) => handleBulkConvUpdate(v)}>
                      <SelectTrigger className="w-[150px]">
                        <SelectValue placeholder="Set Status" />
                      </SelectTrigger>
                      <SelectContent>
                        {STATUS_OPTIONS.map(s => (
                          <SelectItem key={s.value} value={s.value}>
                            Mark as {s.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>

              {/* Table */}
              <div className="border rounded-lg overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead style={{ width: convColumnWidths.columnWidths.checkbox }}>
                        <Checkbox
                          checked={selectedConv.length === convFeedbacks.length && convFeedbacks.length > 0}
                          onCheckedChange={selectAllConv}
                        />
                      </TableHead>
                      <TableHead style={{ width: convColumnWidths.columnWidths.rating }}>Rating</TableHead>
                      <TableHead
                        style={{ width: convColumnWidths.columnWidths.question, position: 'relative' }}
                        className="group"
                      >
                        Question
                        <div
                          className="absolute right-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-blue-500 opacity-0 group-hover:opacity-100"
                          onMouseDown={(e) => convColumnWidths.handleMouseDown('question', e)}
                        />
                      </TableHead>
                      <TableHead
                        style={{ width: convColumnWidths.columnWidths.answer, position: 'relative' }}
                        className="group"
                      >
                        AI Response
                        <div
                          className="absolute right-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-blue-500 opacity-0 group-hover:opacity-100"
                          onMouseDown={(e) => convColumnWidths.handleMouseDown('answer', e)}
                        />
                      </TableHead>
                      <TableHead
                        style={{ width: convColumnWidths.columnWidths.feedback, position: 'relative' }}
                        className="group"
                      >
                        Feedback
                        <div
                          className="absolute right-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-blue-500 opacity-0 group-hover:opacity-100"
                          onMouseDown={(e) => convColumnWidths.handleMouseDown('feedback', e)}
                        />
                      </TableHead>
                      <TableHead style={{ width: convColumnWidths.columnWidths.profile }}>User Profile</TableHead>
                      <TableHead style={{ width: convColumnWidths.columnWidths.date }}>
                        <button
                          onClick={() => setConvSort(prev => ({
                            sortBy: 'timestamp',
                            sortOrder: prev.sortOrder === 'desc' ? 'asc' : 'desc'
                          }))}
                          className="flex items-center gap-1"
                        >
                          Date <ArrowUpDown className="w-3 h-3" />
                        </button>
                      </TableHead>
                      <TableHead style={{ width: convColumnWidths.columnWidths.status }}>Status</TableHead>
                      <TableHead style={{ width: convColumnWidths.columnWidths.actions }}></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {isLoading ? (
                      <TableRow>
                        <TableCell colSpan={9} className="text-center py-8">
                          <Loader2 className="w-6 h-6 animate-spin mx-auto text-gray-400" />
                        </TableCell>
                      </TableRow>
                    ) : convFeedbacks.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={9} className="text-center py-8 text-gray-500">
                          No conversation feedback found
                        </TableCell>
                      </TableRow>
                    ) : (
                      convFeedbacks.map((feedback) => {
                        const key = `${feedback.conversation_id}:${feedback.message_index}`;
                        return (
                          <TableRow key={key}>
                            <TableCell>
                              <Checkbox
                                checked={selectedConv.includes(key)}
                                onCheckedChange={() => toggleConvSelection(key)}
                              />
                            </TableCell>
                            <TableCell>
                              {feedback.rating === 'thumbs_up' ? (
                                <ThumbsUp className="w-5 h-5 text-green-500" />
                              ) : (
                                <ThumbsDown className="w-5 h-5 text-red-500" />
                              )}
                            </TableCell>
                            <TableCell style={{ maxWidth: convColumnWidths.columnWidths.question }}>
                              <TruncatedText text={feedback.question_preview} maxLines={3} />
                            </TableCell>
                            <TableCell style={{ maxWidth: convColumnWidths.columnWidths.answer }}>
                              <TruncatedText text={feedback.answer_preview} maxLines={3} />
                            </TableCell>
                            <TableCell style={{ maxWidth: convColumnWidths.columnWidths.feedback }}>
                              <TruncatedText text={feedback.feedback_text} maxLines={3} />
                            </TableCell>
                            <TableCell>
                              <UserProfileBadges profile={feedback.userProfile} />
                            </TableCell>
                            <TableCell className="text-sm text-gray-500">
                              {formatDate(feedback.timestamp)}
                            </TableCell>
                            <TableCell>
                              <Select
                                value={feedback.status || 'new'}
                                onValueChange={(v) => handleConvStatusUpdate(
                                  feedback.conversation_id,
                                  feedback.message_index,
                                  v
                                )}
                              >
                                <SelectTrigger className="w-[100px] h-8">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  {STATUS_OPTIONS.map(s => (
                                    <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </TableCell>
                            <TableCell>
                              <div className="flex gap-1">
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => setDetailModal({ isOpen: true, feedback, type: 'conversation' })}
                                  title="View details"
                                >
                                  <Expand className="w-4 h-4" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => handleLoadConversation(feedback.conversation_id)}
                                  title="View full conversation"
                                >
                                  <MessageSquare className="w-4 h-4" />
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        );
                      })
                    )}
                  </TableBody>
                </Table>
              </div>

              {/* Pagination */}
              {convPagination.pages > 1 && (
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-500">
                    Page {convPagination.page} of {convPagination.pages}
                  </span>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={convPagination.page <= 1}
                      onClick={() => setConvPagination(prev => ({ ...prev, page: prev.page - 1 }))}
                    >
                      Previous
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={convPagination.page >= convPagination.pages}
                      onClick={() => setConvPagination(prev => ({ ...prev, page: prev.page + 1 }))}
                    >
                      Next
                    </Button>
                  </div>
                </div>
              )}
            </TabsContent>
          </Tabs>
        </div>

        {/* Right Panel - Resizable on desktop, full-screen overlay on mobile */}
        {showRightPanel && (
          <>
            {/* Mobile overlay backdrop */}
            <div
              className="md:hidden fixed inset-0 bg-black/50 z-40"
              onClick={() => setShowRightPanel(false)}
            />
            <div
              className="fixed md:relative inset-0 md:inset-auto z-50 md:z-auto border-l border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-900 md:h-[calc(100vh-80px)] md:sticky md:top-[80px] overflow-hidden flex flex-col"
              style={{ width: typeof window !== 'undefined' && window.innerWidth < 768 ? '100%' : panelWidth, minWidth: 300 }}
            >
            {/* Resize Handle */}
            <div
              className="absolute left-0 top-0 bottom-0 w-3 cursor-col-resize hover:bg-blue-500/20 active:bg-blue-500/40 z-10 group flex items-center justify-center touch-none"
              onMouseDown={handlePanelResize}
              onTouchStart={handlePanelResize}
            >
              <GripVertical className="w-4 h-4 text-gray-400 group-hover:text-blue-500 group-active:text-blue-600 transition-colors" />
            </div>

            <Tabs value={rightPanelTab} onValueChange={setRightPanelTab} className="flex flex-col h-full overflow-hidden">
              <div className="flex items-center justify-between px-4 pt-4 pb-2 shrink-0">
                <TabsList className="grid grid-cols-2 flex-1">
                  <TabsTrigger value="analysis" className="gap-2">
                    <Sparkles className="w-4 h-4" />
                    Analysis
                  </TabsTrigger>
                  <TabsTrigger value="conversation" className="gap-2">
                    <MessageSquare className="w-4 h-4" />
                    Conversation
                  </TabsTrigger>
                </TabsList>
                <div className="flex items-center ml-2">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => setPanelWidth(panelWidth > 600 ? 450 : window.innerWidth * 0.9)}
                    title={panelWidth > 600 ? "Minimize panel" : "Maximize panel"}
                  >
                    {panelWidth > 600 ? (
                      <Minimize2 className="w-4 h-4" />
                    ) : (
                      <Maximize2 className="w-4 h-4" />
                    )}
                  </Button>
                </div>
              </div>

              <TabsContent value="analysis" className="flex-1 flex-col m-0 p-4 pt-0 min-h-0 overflow-hidden hidden data-[state=active]:flex">
                {isAnalyzing ? (
                  <div className="flex-1 flex items-center justify-center">
                    <div className="text-center">
                      <Loader2 className="w-8 h-8 animate-spin mx-auto text-blue-500 mb-2" />
                      <p className="text-sm text-gray-500">Analyzing feedbacks...</p>
                    </div>
                  </div>
                ) : analysisContent ? (
                  <>
                    <div className="flex items-center justify-between mb-2">
                      <h3 className="font-semibold text-sm">AI Analysis</h3>
                      <Button size="sm" variant="outline" onClick={handleDownloadAnalysis}>
                        <Download className="w-4 h-4 mr-1" />
                        Download
                      </Button>
                    </div>
                    {analysisStats && (
                      <div className="flex flex-wrap gap-2 mb-3 text-xs text-gray-500">
                        <span className="px-2 py-1 bg-gray-100 dark:bg-gray-800 rounded">
                          Model: <strong className="text-gray-700 dark:text-gray-300">{analysisStats.model}</strong>
                        </span>
                        <span className="px-2 py-1 bg-gray-100 dark:bg-gray-800 rounded">
                          Tokens: <strong className="text-gray-700 dark:text-gray-300">{analysisStats.tokens?.toLocaleString()}</strong>
                        </span>
                        {analysisStats.stats && (
                          <>
                            <span className="px-2 py-1 bg-green-100 dark:bg-green-900/30 rounded text-green-700 dark:text-green-400">
                              👍 {analysisStats.stats.thumbsUp}
                            </span>
                            <span className="px-2 py-1 bg-red-100 dark:bg-red-900/30 rounded text-red-700 dark:text-red-400">
                              👎 {analysisStats.stats.thumbsDown} ({analysisStats.stats.negativeRate}%)
                            </span>
                          </>
                        )}
                      </div>
                    )}
                    <ScrollArea className="flex-1 min-h-0 pr-4">
                      <div className="markdown-content text-sm pb-8">
                        <ReactMarkdown
                          components={{
                            h1: ({ children }) => <h1 className="text-xl font-bold mb-4 mt-6 first:mt-0 text-gray-900 dark:text-white border-b pb-2">{children}</h1>,
                            h2: ({ children }) => <h2 className="text-lg font-semibold mb-3 mt-5 text-gray-800 dark:text-gray-100">{children}</h2>,
                            h3: ({ children }) => <h3 className="text-base font-semibold mb-2 mt-4 text-gray-800 dark:text-gray-200">{children}</h3>,
                            h4: ({ children }) => <h4 className="text-sm font-semibold mb-2 mt-3 text-gray-700 dark:text-gray-300">{children}</h4>,
                            p: ({ children }) => <p className="mb-3 text-gray-700 dark:text-gray-300 leading-relaxed">{children}</p>,
                            ul: ({ children }) => <ul className="mb-3 ml-4 space-y-1 list-disc text-gray-700 dark:text-gray-300">{children}</ul>,
                            ol: ({ children }) => <ol className="mb-3 ml-4 space-y-1 list-decimal text-gray-700 dark:text-gray-300">{children}</ol>,
                            li: ({ children }) => <li className="pl-1">{children}</li>,
                            strong: ({ children }) => <strong className="font-semibold text-gray-900 dark:text-white">{children}</strong>,
                            em: ({ children }) => <em className="italic text-gray-600 dark:text-gray-400">{children}</em>,
                            blockquote: ({ children }) => (
                              <blockquote className="border-l-4 border-blue-500 pl-4 py-1 my-3 bg-blue-50 dark:bg-blue-900/20 rounded-r text-gray-700 dark:text-gray-300">
                                {children}
                              </blockquote>
                            ),
                            code: ({ inline, children }) =>
                              inline ? (
                                <code className="px-1.5 py-0.5 bg-gray-100 dark:bg-gray-800 rounded text-sm font-mono text-pink-600 dark:text-pink-400">{children}</code>
                              ) : (
                                <code className="block p-3 bg-gray-100 dark:bg-gray-800 rounded-lg text-sm font-mono overflow-x-auto my-3">{children}</code>
                              ),
                            pre: ({ children }) => <pre className="bg-gray-100 dark:bg-gray-800 rounded-lg overflow-x-auto my-3">{children}</pre>,
                            hr: () => <hr className="my-4 border-gray-200 dark:border-gray-700" />,
                            a: ({ href, children }) => <a href={href} className="text-blue-600 dark:text-blue-400 hover:underline" target="_blank" rel="noopener noreferrer">{children}</a>,
                            table: ({ children }) => <div className="overflow-x-auto my-3"><table className="min-w-full border-collapse border border-gray-200 dark:border-gray-700 text-sm">{children}</table></div>,
                            thead: ({ children }) => <thead className="bg-gray-100 dark:bg-gray-800">{children}</thead>,
                            tbody: ({ children }) => <tbody>{children}</tbody>,
                            tr: ({ children }) => <tr className="border-b border-gray-200 dark:border-gray-700">{children}</tr>,
                            th: ({ children }) => <th className="px-3 py-2 text-left font-semibold text-gray-900 dark:text-white border border-gray-200 dark:border-gray-700">{children}</th>,
                            td: ({ children }) => <td className="px-3 py-2 text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-700">{children}</td>,
                          }}
                        >
                          {analysisContent}
                        </ReactMarkdown>
                      </div>
                    </ScrollArea>
                  </>
                ) : (
                  <div className="flex-1 flex items-center justify-center">
                    <div className="text-center text-gray-500">
                      <Sparkles className="w-12 h-12 mx-auto mb-3 opacity-30" />
                      <p className="text-sm">Select feedbacks using checkboxes</p>
                      <p className="text-xs mt-1">then click "Analyze"</p>
                    </div>
                  </div>
                )}
              </TabsContent>

              <TabsContent value="conversation" className="flex-1 flex-col m-0 p-4 pt-0 min-h-0 overflow-hidden hidden data-[state=active]:flex">
                {isLoadingConversation ? (
                  <div className="flex-1 flex items-center justify-center">
                    <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
                  </div>
                ) : conversationView ? (
                  <>
                    <div className="mb-3">
                      <h3 className="font-semibold text-sm truncate">{conversationView.title || 'Conversation'}</h3>
                      {conversationView.userProfile && (
                        <div className="mt-1">
                          <UserProfileBadges profile={conversationView.userProfile} />
                        </div>
                      )}
                    </div>
                    <ScrollArea className="flex-1 min-h-0 pr-4">
                      <div className="space-y-4 pb-8">
                        {conversationView.messages?.map((msg, idx) => (
                          <div
                            key={idx}
                            className={`p-3 rounded-lg ${
                              msg.role === 'user'
                                ? 'bg-blue-50 dark:bg-blue-900/20 ml-4'
                                : 'bg-gray-100 dark:bg-gray-800 mr-4'
                            }`}
                          >
                            <div className="flex items-center gap-2 mb-1">
                              {msg.role === 'user' ? (
                                <User className="w-4 h-4 text-blue-500" />
                              ) : (
                                <Bot className="w-4 h-4 text-green-500" />
                              )}
                              <span className="text-xs font-medium text-gray-500">
                                {msg.role === 'user' ? 'User' : 'Sensei'}
                              </span>
                              {msg.timestamp && (
                                <span className="text-xs text-gray-400 ml-auto">
                                  <Clock className="w-3 h-3 inline mr-1" />
                                  {formatDate(msg.timestamp)}
                                </span>
                              )}
                            </div>
                            <div className="text-sm whitespace-pre-wrap">
                              {msg.content}
                            </div>
                            {/* Show feedback indicator if this message has feedback */}
                            {conversationView.feedback?.find(f => f.message_index === idx) && (
                              <div className="mt-2 pt-2 border-t border-gray-200 dark:border-gray-700">
                                {conversationView.feedback.find(f => f.message_index === idx).rating === 'thumbs_up' ? (
                                  <ThumbsUp className="w-4 h-4 text-green-500 inline" />
                                ) : (
                                  <ThumbsDown className="w-4 h-4 text-red-500 inline" />
                                )}
                                <span className="text-xs text-gray-500 ml-1">
                                  {conversationView.feedback.find(f => f.message_index === idx).feedback_text || 'No comment'}
                                </span>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </ScrollArea>
                  </>
                ) : (
                  <div className="flex-1 flex items-center justify-center">
                    <div className="text-center text-gray-500">
                      <MessageSquare className="w-12 h-12 mx-auto mb-3 opacity-30" />
                      <p className="text-sm">Click the chat icon on a feedback</p>
                      <p className="text-xs mt-1">to view the full conversation</p>
                    </div>
                  </div>
                )}
              </TabsContent>
            </Tabs>
          </div>
          </>
        )}
      </div>

      {/* Detail Modal */}
      <FeedbackDetailModal
        feedback={detailModal.feedback}
        type={detailModal.type}
        isOpen={detailModal.isOpen}
        onClose={() => setDetailModal({ isOpen: false, feedback: null, type: null })}
      />

      {/* Report Modal */}
      <Dialog open={showReportModal} onOpenChange={setShowReportModal}>
        <DialogContent className="max-w-4xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle>Feedback Report</DialogTitle>
            <DialogDescription>
              Generated report based on {selectedSite.length || siteFeedbacks.length} site feedbacks
              and {selectedConv.length || convFeedbacks.length} conversation feedbacks
            </DialogDescription>
          </DialogHeader>
          <ScrollArea className="h-[50vh] border rounded-lg p-4 bg-gray-50 dark:bg-gray-800">
            <pre className="whitespace-pre-wrap text-sm font-mono">{reportContent}</pre>
          </ScrollArea>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowReportModal(false)}>
              Close
            </Button>
            <Button onClick={handleDownloadReport} className="gap-2">
              <Download className="w-4 h-4" />
              Download Markdown
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
