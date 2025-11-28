import React, { useState } from 'react';
import { MessageSquare, ThumbsUp, ThumbsDown, X, Send, Check } from 'lucide-react';
import { Feedback } from '@/api/entities';

// Modal component - can be triggered from anywhere
export function FeedbackModal({ isOpen, onClose }) {
  const [rating, setRating] = useState(null);
  const [feedbackText, setFeedbackText] = useState('');
  const [category, setCategory] = useState('general');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const categories = [
    { id: 'general', label: 'General' },
    { id: 'bug', label: 'Bug' },
    { id: 'feature_request', label: 'Feature' },
    { id: 'ui_ux', label: 'UI/UX' },
    { id: 'other', label: 'Other' }
  ];

  const handleSubmit = async () => {
    if (!rating) return;

    setIsSubmitting(true);
    try {
      await Feedback.submit({
        rating,
        feedbackText: feedbackText.trim() || undefined,
        category,
        page: window.location.pathname
      });
      setSubmitted(true);
      setTimeout(() => {
        handleClose();
      }, 1500);
    } catch (error) {
      console.error('Error submitting feedback:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    onClose();
    // Reset after animation
    setTimeout(() => {
      setRating(null);
      setFeedbackText('');
      setCategory('general');
      setSubmitted(false);
    }, 200);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-2xl w-full max-w-sm shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="p-4 border-b border-gray-100 flex items-center justify-between">
          <h3 className="text-base font-bold text-gray-900">Send Feedback</h3>
          <button
            onClick={handleClose}
            className="p-1.5 rounded-full hover:bg-gray-100 transition-colors"
          >
            <X className="w-4 h-4 text-gray-400" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 space-y-4">
          {submitted ? (
            <div className="py-6 text-center">
              <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-3">
                <Check className="w-6 h-6 text-green-600" />
              </div>
              <h4 className="text-base font-bold text-gray-900 mb-1">Thank you!</h4>
              <p className="text-sm text-gray-600">Your feedback has been submitted.</p>
            </div>
          ) : (
            <>
              {/* Rating Selection */}
              <div className="flex gap-2">
                <button
                  onClick={() => setRating('thumbs_up')}
                  className={`flex-1 py-3 rounded-xl border-2 transition-all flex items-center justify-center gap-2 ${
                    rating === 'thumbs_up'
                      ? 'border-green-500 bg-green-50 text-green-600'
                      : 'border-gray-200 hover:border-green-300 text-gray-500'
                  }`}
                >
                  <ThumbsUp className={`w-5 h-5 ${rating === 'thumbs_up' ? 'fill-green-500' : ''}`} />
                  <span className="text-sm font-medium">Good</span>
                </button>
                <button
                  onClick={() => setRating('thumbs_down')}
                  className={`flex-1 py-3 rounded-xl border-2 transition-all flex items-center justify-center gap-2 ${
                    rating === 'thumbs_down'
                      ? 'border-red-500 bg-red-50 text-red-600'
                      : 'border-gray-200 hover:border-red-300 text-gray-500'
                  }`}
                >
                  <ThumbsDown className={`w-5 h-5 ${rating === 'thumbs_down' ? 'fill-red-500' : ''}`} />
                  <span className="text-sm font-medium">Not Good</span>
                </button>
              </div>

              {/* Category Selection */}
              <div className="flex flex-wrap gap-1.5">
                {categories.map((cat) => (
                  <button
                    key={cat.id}
                    onClick={() => setCategory(cat.id)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all ${
                      category === cat.id
                        ? 'bg-gray-900 text-white'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                  >
                    {cat.label}
                  </button>
                ))}
              </div>

              {/* Feedback Text */}
              <textarea
                value={feedbackText}
                onChange={(e) => setFeedbackText(e.target.value)}
                placeholder="Tell us more (optional)..."
                className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-gray-900/10 resize-none"
                rows={2}
                maxLength={500}
              />

              {/* Submit Button */}
              <button
                onClick={handleSubmit}
                disabled={!rating || isSubmitting}
                className={`w-full py-2.5 rounded-xl font-semibold text-sm flex items-center justify-center gap-2 transition-all ${
                  rating && !isSubmitting
                    ? 'bg-gray-900 text-white hover:bg-gray-800'
                    : 'bg-gray-200 text-gray-400 cursor-not-allowed'
                }`}
              >
                {isSubmitting ? (
                  <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <>
                    <Send className="w-4 h-4" />
                    Submit Feedback
                  </>
                )}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// Icon button that can be placed in headers/navbars
export function FeedbackTrigger({ className = "" }) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <button
        onClick={() => setIsOpen(true)}
        className={`p-2 text-gray-600 dark:text-gray-400 hover:text-primary-500 dark:hover:text-primary-400 transition-colors ${className}`}
        title="Send Feedback"
      >
        <MessageSquare className="w-5 h-5" />
      </button>
      <FeedbackModal isOpen={isOpen} onClose={() => setIsOpen(false)} />
    </>
  );
}

// Default export for backwards compatibility
export default function FeedbackButton() {
  return <FeedbackTrigger />;
}
