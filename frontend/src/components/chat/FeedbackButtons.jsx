import { useState } from 'react';
import { ThumbsUp, ThumbsDown, Check, Send } from 'lucide-react';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5001';

export function FeedbackButtons({
  conversationId,
  messageIndex,
  question,
  answer,
  authToken,
  existingRating = null
}) {
  const [rating, setRating] = useState(existingRating);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [showFeedbackForm, setShowFeedbackForm] = useState(false);
  const [feedbackText, setFeedbackText] = useState('');
  const [pendingRating, setPendingRating] = useState(null);

  const submitFeedback = async (newRating, text = '') => {
    if (!conversationId || isSubmitting) return;

    setIsSubmitting(true);
    try {
      const response = await fetch(
        `${API_BASE_URL}/api/v1/conversations/${conversationId}/feedback`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${authToken}`
          },
          body: JSON.stringify({
            message_index: messageIndex,
            rating: newRating,
            feedback_text: text || null,
            question: question?.slice(0, 200),
            answer: answer?.slice(0, 200)
          })
        }
      );

      if (response.ok) {
        setRating(newRating);
        setSubmitted(true);
        setShowFeedbackForm(false);
        setFeedbackText('');
        setPendingRating(null);
        // Reset submitted indicator after 2 seconds
        setTimeout(() => setSubmitted(false), 2000);
      }
    } catch (error) {
      console.error('Error submitting feedback:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleThumbClick = (newRating) => {
    // If clicking the same rating again, just submit without text
    if (rating === newRating) return;

    // Show the feedback form for optional text
    setPendingRating(newRating);
    setShowFeedbackForm(true);
  };

  const handleSubmitWithText = () => {
    if (pendingRating) {
      submitFeedback(pendingRating, feedbackText);
    }
  };

  const handleSkipText = () => {
    if (pendingRating) {
      submitFeedback(pendingRating, '');
    }
  };

  const handleCancel = () => {
    setShowFeedbackForm(false);
    setFeedbackText('');
    setPendingRating(null);
  };

  return (
    <div className="mt-3">
      {/* Thumbs buttons */}
      <div className="flex items-center gap-1">
        <button
          onClick={() => handleThumbClick('thumbs_up')}
          disabled={isSubmitting || showFeedbackForm}
          className={`p-1.5 rounded-md transition-all ${
            rating === 'thumbs_up'
              ? 'bg-green-100 text-green-600'
              : 'text-gray-400 hover:bg-gray-100 hover:text-gray-600'
          } ${isSubmitting || showFeedbackForm ? 'opacity-50 cursor-not-allowed' : ''}`}
          title="Helpful"
        >
          <ThumbsUp className="h-4 w-4" />
        </button>
        <button
          onClick={() => handleThumbClick('thumbs_down')}
          disabled={isSubmitting || showFeedbackForm}
          className={`p-1.5 rounded-md transition-all ${
            rating === 'thumbs_down'
              ? 'bg-red-100 text-red-600'
              : 'text-gray-400 hover:bg-gray-100 hover:text-gray-600'
          } ${isSubmitting || showFeedbackForm ? 'opacity-50 cursor-not-allowed' : ''}`}
          title="Not helpful"
        >
          <ThumbsDown className="h-4 w-4" />
        </button>
        {submitted && !showFeedbackForm && (
          <span className="flex items-center gap-1 text-xs text-green-600 ml-2 animate-fade-in">
            <Check className="h-3 w-3" />
            Saved
          </span>
        )}
      </div>

      {/* Expandable feedback form */}
      {showFeedbackForm && (
        <div className="mt-3 p-3 bg-gray-50 rounded-xl border border-gray-200 animate-fade-in">
          <div className="flex items-center gap-2 mb-2">
            <span className={`text-xs font-medium ${
              pendingRating === 'thumbs_up' ? 'text-green-600' : 'text-red-600'
            }`}>
              {pendingRating === 'thumbs_up' ? 'What was helpful?' : 'What could be improved?'}
            </span>
            <span className="text-xs text-gray-400">(optional)</span>
          </div>
          <textarea
            value={feedbackText}
            onChange={(e) => setFeedbackText(e.target.value)}
            placeholder={
              pendingRating === 'thumbs_up'
                ? "e.g., Clear explanation, good examples..."
                : "e.g., Missing information, incorrect details..."
            }
            className="w-full px-3 py-2 text-sm bg-white border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 resize-none"
            rows={2}
            maxLength={500}
            disabled={isSubmitting}
          />
          <div className="flex items-center justify-between mt-2">
            <span className="text-xs text-gray-400">
              {feedbackText.length}/500
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={handleCancel}
                disabled={isSubmitting}
                className="px-3 py-1.5 text-xs text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSkipText}
                disabled={isSubmitting}
                className="px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-200 rounded-lg transition-colors"
              >
                Skip
              </button>
              <button
                onClick={handleSubmitWithText}
                disabled={isSubmitting}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-xs text-white rounded-lg transition-colors ${
                  pendingRating === 'thumbs_up'
                    ? 'bg-green-500 hover:bg-green-600'
                    : 'bg-red-500 hover:bg-red-600'
                } ${isSubmitting ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                {isSubmitting ? (
                  <span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <Send className="h-3 w-3" />
                )}
                Submit
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
