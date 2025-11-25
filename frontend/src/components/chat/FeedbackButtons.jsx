import React, { useState } from 'react';
import { ThumbsUp, ThumbsDown, Check } from 'lucide-react';

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

  const submitFeedback = async (newRating) => {
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
            question: question?.slice(0, 200),
            answer: answer?.slice(0, 200)
          })
        }
      );

      if (response.ok) {
        setRating(newRating);
        setSubmitted(true);
        // Reset submitted indicator after 2 seconds
        setTimeout(() => setSubmitted(false), 2000);
      }
    } catch (error) {
      console.error('Error submitting feedback:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex items-center gap-1 mt-2">
      <button
        onClick={() => submitFeedback('thumbs_up')}
        disabled={isSubmitting}
        className={`p-1.5 rounded-md transition-all ${
          rating === 'thumbs_up'
            ? 'bg-green-100 text-green-600'
            : 'text-gray-400 hover:bg-gray-100 hover:text-gray-600'
        } ${isSubmitting ? 'opacity-50 cursor-not-allowed' : ''}`}
        title="Helpful"
      >
        <ThumbsUp className="h-4 w-4" />
      </button>
      <button
        onClick={() => submitFeedback('thumbs_down')}
        disabled={isSubmitting}
        className={`p-1.5 rounded-md transition-all ${
          rating === 'thumbs_down'
            ? 'bg-red-100 text-red-600'
            : 'text-gray-400 hover:bg-gray-100 hover:text-gray-600'
        } ${isSubmitting ? 'opacity-50 cursor-not-allowed' : ''}`}
        title="Not helpful"
      >
        <ThumbsDown className="h-4 w-4" />
      </button>
      {submitted && (
        <span className="flex items-center gap-1 text-xs text-green-600 ml-2 animate-fade-in">
          <Check className="h-3 w-3" />
          Saved
        </span>
      )}
    </div>
  );
}
