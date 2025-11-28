import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ChevronLeft,
  Plus,
  Brain,
  Trash2,
  Edit2,
  Eye,
  EyeOff,
  Loader2,
  Heart,
  Target,
  Dumbbell,
  Coffee,
  Sparkles,
  Info,
  X,
  Check
} from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import apiService from '@/services/api';

const CATEGORIES = [
  { value: 'health', label: 'Health', icon: Heart, color: 'text-red-400', bgColor: 'bg-red-500/20' },
  { value: 'preference', label: 'Preference', icon: Sparkles, color: 'text-purple-400', bgColor: 'bg-purple-500/20' },
  { value: 'goal', label: 'Goal', icon: Target, color: 'text-green-400', bgColor: 'bg-green-500/20' },
  { value: 'lifestyle', label: 'Lifestyle', icon: Coffee, color: 'text-amber-400', bgColor: 'bg-amber-500/20' },
  { value: 'general', label: 'General', icon: Dumbbell, color: 'text-blue-400', bgColor: 'bg-blue-500/20' }
];

const IMPORTANCE_OPTIONS = [
  { value: 'high', label: 'High', color: 'text-red-400' },
  { value: 'medium', label: 'Medium', color: 'text-yellow-400' },
  { value: 'low', label: 'Low', color: 'text-gray-400' }
];

export default function MemoriesSettings() {
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(true);
  const [memories, setMemories] = useState([]);
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingMemory, setEditingMemory] = useState(null);
  const [filterCategory, setFilterCategory] = useState('all');
  const [isSaving, setIsSaving] = useState(false);

  // Form state
  const [formData, setFormData] = useState({
    content: '',
    category: 'general',
    importance: 'medium',
    tags: ''
  });

  useEffect(() => {
    fetchMemories();
  }, []);

  const fetchMemories = async () => {
    setIsLoading(true);
    try {
      const data = await apiService.memories.list();
      setMemories(data || []);
    } catch (error) {
      console.error('Error fetching memories:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreateMemory = async () => {
    if (!formData.content.trim()) return;

    setIsSaving(true);
    try {
      const tags = formData.tags
        .split(',')
        .map(t => t.trim().toLowerCase())
        .filter(t => t.length > 0);

      await apiService.memories.create({
        content: formData.content.trim(),
        category: formData.category,
        importance: formData.importance,
        tags,
        source: 'user'
      });

      setFormData({ content: '', category: 'general', importance: 'medium', tags: '' });
      setShowAddForm(false);
      await fetchMemories();
    } catch (error) {
      console.error('Error creating memory:', error);
    } finally {
      setIsSaving(false);
    }
  };

  const handleUpdateMemory = async () => {
    if (!editingMemory || !formData.content.trim()) return;

    setIsSaving(true);
    try {
      const tags = formData.tags
        .split(',')
        .map(t => t.trim().toLowerCase())
        .filter(t => t.length > 0);

      await apiService.memories.update(editingMemory._id, {
        content: formData.content.trim(),
        category: formData.category,
        importance: formData.importance,
        tags
      });

      setEditingMemory(null);
      setFormData({ content: '', category: 'general', importance: 'medium', tags: '' });
      await fetchMemories();
    } catch (error) {
      console.error('Error updating memory:', error);
    } finally {
      setIsSaving(false);
    }
  };

  const handleToggleMemory = async (memoryId) => {
    try {
      await apiService.memories.toggle(memoryId);
      await fetchMemories();
    } catch (error) {
      console.error('Error toggling memory:', error);
    }
  };

  const handleDeleteMemory = async (memoryId) => {
    if (!confirm('Are you sure you want to delete this memory?')) return;

    try {
      await apiService.memories.delete(memoryId);
      await fetchMemories();
    } catch (error) {
      console.error('Error deleting memory:', error);
    }
  };

  const startEditing = (memory) => {
    setEditingMemory(memory);
    setFormData({
      content: memory.content,
      category: memory.category,
      importance: memory.importance,
      tags: memory.tags?.join(', ') || ''
    });
    setShowAddForm(false);
  };

  const cancelForm = () => {
    setShowAddForm(false);
    setEditingMemory(null);
    setFormData({ content: '', category: 'general', importance: 'medium', tags: '' });
  };

  const getCategoryInfo = (category) => {
    return CATEGORIES.find(c => c.value === category) || CATEGORIES[4];
  };

  const filteredMemories = filterCategory === 'all'
    ? memories
    : memories.filter(m => m.category === filterCategory);

  const activeCount = memories.filter(m => m.isActive).length;

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
          <h1 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <Brain className="w-5 h-5 text-primary-400" />
            Sensei Memory
          </h1>
          <div className="w-9" />
        </div>
      </div>

      <div className="px-4 md:px-6 py-6 max-w-2xl mx-auto">
        {/* Info Card */}
        <div className="bg-gradient-to-r from-primary-500/10 to-purple-500/10 dark:from-primary-500/20 dark:to-purple-500/20 rounded-2xl p-4 mb-6 border border-primary-500/20">
          <div className="flex gap-3">
            <Info className="w-5 h-5 text-primary-400 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm text-gray-700 dark:text-gray-300">
                These memories help your Sensei understand you better. Add preferences, health conditions,
                or goals. Use <span className="font-mono text-primary-400">#memorize</span> in chat to save something quickly!
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                {activeCount} active {activeCount === 1 ? 'memory' : 'memories'} will be shared with Sensei
              </p>
            </div>
          </div>
        </div>

        {/* Category Filter */}
        <div className="flex gap-2 overflow-x-auto pb-2 mb-4 scrollbar-hide">
          <button
            onClick={() => setFilterCategory('all')}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
              filterCategory === 'all'
                ? 'bg-primary-400 text-gray-900'
                : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
            }`}
          >
            All ({memories.length})
          </button>
          {CATEGORIES.map(cat => {
            const count = memories.filter(m => m.category === cat.value).length;
            return (
              <button
                key={cat.value}
                onClick={() => setFilterCategory(cat.value)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium whitespace-nowrap transition-colors flex items-center gap-1.5 ${
                  filterCategory === cat.value
                    ? 'bg-primary-400 text-gray-900'
                    : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
                }`}
              >
                <cat.icon className="w-3.5 h-3.5" />
                {cat.label} ({count})
              </button>
            );
          })}
        </div>

        {/* Add Button */}
        {!showAddForm && !editingMemory && (
          <button
            onClick={() => setShowAddForm(true)}
            className="w-full py-3 mb-4 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-xl flex items-center justify-center gap-2 text-gray-600 dark:text-gray-400 transition-colors border-2 border-dashed border-gray-300 dark:border-gray-700"
          >
            <Plus className="w-5 h-5" />
            <span className="font-medium">Add Memory</span>
          </button>
        )}

        {/* Add/Edit Form */}
        {(showAddForm || editingMemory) && (
          <div className="bg-gray-50 dark:bg-gray-800/50 rounded-2xl p-4 mb-4 border border-gray-200 dark:border-gray-700">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-gray-900 dark:text-white">
                {editingMemory ? 'Edit Memory' : 'New Memory'}
              </h3>
              <button
                onClick={cancelForm}
                className="p-1.5 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
              >
                <X className="w-4 h-4 text-gray-500" />
              </button>
            </div>

            {/* Content Input */}
            <textarea
              value={formData.content}
              onChange={(e) => setFormData({ ...formData, content: e.target.value })}
              placeholder="What should Sensei remember about you?"
              className="w-full px-4 py-3 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-400/50 focus:border-primary-400 resize-none"
              rows={3}
              maxLength={500}
            />
            <div className="text-right text-xs text-gray-400 mt-1">
              {formData.content.length}/500
            </div>

            {/* Category Selection */}
            <div className="mt-4">
              <label className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-2 block">
                Category
              </label>
              <div className="flex flex-wrap gap-2">
                {CATEGORIES.map(cat => (
                  <button
                    key={cat.value}
                    onClick={() => setFormData({ ...formData, category: cat.value })}
                    className={`px-3 py-1.5 rounded-lg text-sm font-medium flex items-center gap-1.5 transition-colors ${
                      formData.category === cat.value
                        ? `${cat.bgColor} ${cat.color} ring-2 ring-offset-2 ring-offset-gray-50 dark:ring-offset-gray-800 ring-current`
                        : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400'
                    }`}
                  >
                    <cat.icon className="w-3.5 h-3.5" />
                    {cat.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Importance Selection */}
            <div className="mt-4">
              <label className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-2 block">
                Importance
              </label>
              <div className="flex gap-2">
                {IMPORTANCE_OPTIONS.map(opt => (
                  <button
                    key={opt.value}
                    onClick={() => setFormData({ ...formData, importance: opt.value })}
                    className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                      formData.importance === opt.value
                        ? 'bg-gray-900 dark:bg-white text-white dark:text-gray-900'
                        : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Tags Input */}
            <div className="mt-4">
              <label className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-2 block">
                Tags (comma separated, optional)
              </label>
              <input
                type="text"
                value={formData.tags}
                onChange={(e) => setFormData({ ...formData, tags: e.target.value })}
                placeholder="e.g., knee, injury, avoid"
                className="w-full px-4 py-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-400/50 focus:border-primary-400"
              />
            </div>

            {/* Submit Buttons */}
            <div className="flex gap-2 mt-4">
              <button
                onClick={cancelForm}
                className="flex-1 py-2.5 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 font-medium rounded-xl hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={editingMemory ? handleUpdateMemory : handleCreateMemory}
                disabled={!formData.content.trim() || isSaving}
                className="flex-1 py-2.5 bg-primary-400 text-gray-900 font-semibold rounded-xl hover:bg-primary-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {isSaving ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Check className="w-4 h-4" />
                )}
                {editingMemory ? 'Update' : 'Save'}
              </button>
            </div>
          </div>
        )}

        {/* Memories List */}
        <div className="space-y-3">
          {filteredMemories.length === 0 ? (
            <div className="text-center py-12">
              <Brain className="w-12 h-12 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
              <p className="text-gray-500 dark:text-gray-400">
                {filterCategory === 'all'
                  ? "No memories yet. Add one to help Sensei know you better!"
                  : `No ${filterCategory} memories found.`
                }
              </p>
            </div>
          ) : (
            filteredMemories.map(memory => {
              const catInfo = getCategoryInfo(memory.category);
              const CatIcon = catInfo.icon;

              return (
                <div
                  key={memory._id}
                  className={`bg-gray-50 dark:bg-gray-800/50 rounded-xl p-4 border transition-all ${
                    memory.isActive
                      ? 'border-gray-200 dark:border-gray-700'
                      : 'border-gray-200 dark:border-gray-800 opacity-60'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    {/* Category Icon */}
                    <div className={`p-2 rounded-lg ${catInfo.bgColor}`}>
                      <CatIcon className={`w-4 h-4 ${catInfo.color}`} />
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <p className={`text-gray-900 dark:text-white ${!memory.isActive && 'line-through'}`}>
                        {memory.content}
                      </p>

                      {/* Meta info */}
                      <div className="flex flex-wrap items-center gap-2 mt-2">
                        <Badge
                          variant="outline"
                          className={`text-xs ${
                            memory.importance === 'high' ? 'border-red-400 text-red-400' :
                            memory.importance === 'medium' ? 'border-yellow-400 text-yellow-400' :
                            'border-gray-400 text-gray-400'
                          }`}
                        >
                          {memory.importance}
                        </Badge>

                        {memory.source === 'sensei' && (
                          <Badge variant="outline" className="text-xs border-primary-400 text-primary-400">
                            <Brain className="w-3 h-3 mr-1" />
                            Sensei
                          </Badge>
                        )}

                        {memory.tags?.length > 0 && (
                          <div className="flex gap-1">
                            {memory.tags.slice(0, 3).map(tag => (
                              <span
                                key={tag}
                                className="text-xs text-gray-500 dark:text-gray-400 bg-gray-200 dark:bg-gray-700 px-2 py-0.5 rounded"
                              >
                                #{tag}
                              </span>
                            ))}
                            {memory.tags.length > 3 && (
                              <span className="text-xs text-gray-400">+{memory.tags.length - 3}</span>
                            )}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => handleToggleMemory(memory._id)}
                        className="p-2 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
                        title={memory.isActive ? 'Deactivate' : 'Activate'}
                      >
                        {memory.isActive ? (
                          <Eye className="w-4 h-4 text-green-400" />
                        ) : (
                          <EyeOff className="w-4 h-4 text-gray-400" />
                        )}
                      </button>
                      <button
                        onClick={() => startEditing(memory)}
                        className="p-2 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
                        title="Edit"
                      >
                        <Edit2 className="w-4 h-4 text-gray-400" />
                      </button>
                      <button
                        onClick={() => handleDeleteMemory(memory._id)}
                        className="p-2 rounded-lg hover:bg-red-100 dark:hover:bg-red-900/30 transition-colors"
                        title="Delete"
                      >
                        <Trash2 className="w-4 h-4 text-red-400" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
