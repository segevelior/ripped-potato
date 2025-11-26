import React from 'react';

/**
 * QuickReplies component displays clickable suggestion buttons
 * that appear after AI messages with actionable options.
 *
 * The AI can include quick replies in markdown format:
 * <quick-replies>
 * - Yes, add it to my calendar
 * - No, suggest something else
 * - Show me alternatives
 * </quick-replies>
 */
export function QuickReplies({ replies, onSelect, disabled }) {
  if (!replies || replies.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-2 mt-3 pt-3 border-t border-gray-100">
      {replies.map((reply, index) => (
        <button
          key={index}
          onClick={() => onSelect(reply)}
          disabled={disabled}
          className={`
            px-4 py-2 text-sm font-medium rounded-xl
            border border-primary-200 bg-primary-50 text-primary-700
            hover:bg-primary-100 hover:border-primary-300
            active:bg-primary-200
            transition-all duration-150
            disabled:opacity-50 disabled:cursor-not-allowed
          `}
        >
          {reply}
        </button>
      ))}
    </div>
  );
}

/**
 * Parses quick replies from message content.
 * Returns { cleanContent, quickReplies }
 *
 * Format:
 * <quick-replies>
 * - Option 1
 * - Option 2
 * </quick-replies>
 */
export function parseQuickReplies(content) {
  if (!content) return { cleanContent: content, quickReplies: [] };

  // Match quick-replies block
  const quickReplyRegex = /<quick-replies>([\s\S]*?)<\/quick-replies>/gi;
  const matches = content.match(quickReplyRegex);

  if (!matches) {
    return { cleanContent: content, quickReplies: [] };
  }

  // Extract replies from all matches
  let quickReplies = [];
  matches.forEach(match => {
    const innerContent = match.replace(/<\/?quick-replies>/gi, '').trim();
    // Parse bullet points (- or * or numbered)
    const lines = innerContent.split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 0)
      .map(line => {
        // Remove leading bullets/numbers
        return line.replace(/^[-*•]\s*/, '').replace(/^\d+\.\s*/, '').trim();
      })
      .filter(line => line.length > 0);
    quickReplies = [...quickReplies, ...lines];
  });

  // Remove quick-replies blocks from content
  const cleanContent = content.replace(quickReplyRegex, '').trim();

  return { cleanContent, quickReplies };
}

export default QuickReplies;
