import React from 'react';
import { Plus, MessageSquare, Trash2, MoreHorizontal } from 'lucide-react';

export function ConversationSidebar({
  conversations,
  currentId,
  onSelect,
  onNewChat,
  onDelete,
  isLoading
}) {
  return (
    <div className="w-64 bg-gray-900 flex flex-col h-full border-r border-gray-800 flex-shrink-0">
      {/* New Chat Button */}
      <div className="p-4">
        <button
          onClick={onNewChat}
          className="w-full flex items-center gap-3 px-4 py-3 bg-primary-600 hover:bg-primary-700 text-white rounded-lg transition-colors duration-200 shadow-sm group"
        >
          <Plus className="h-5 w-5 group-hover:scale-110 transition-transform" />
          <span className="font-medium">New Chat</span>
        </button>
      </div>

      {/* History List */}
      <div className="flex-1 overflow-y-auto px-2 py-2 space-y-1 custom-scrollbar">
        <div className="px-3 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider">
          Recent
        </div>

        {isLoading ? (
          <div className="px-4 py-3 space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-10 bg-gray-800 rounded-lg animate-pulse" />
            ))}
          </div>
        ) : conversations.length === 0 ? (
          <div className="px-4 py-8 text-center text-gray-500 text-sm">
            No conversations yet
          </div>
        ) : (
          conversations.map((conv) => (
            <div
              key={conv.conversation_id}
              className={`group relative flex items-center w-full rounded-lg transition-all duration-200
                ${currentId === conv.conversation_id
                  ? 'bg-gray-800 text-white shadow-sm'
                  : 'text-gray-400 hover:bg-gray-800/50 hover:text-gray-200'
                }`}
            >
              <button
                onClick={() => onSelect(conv.conversation_id)}
                className="flex-1 flex items-center gap-3 px-3 py-3 text-sm truncate text-left"
              >
                <MessageSquare className={`h-4 w-4 flex-shrink-0 ${currentId === conv.conversation_id ? 'text-primary-400' : 'text-gray-600 group-hover:text-gray-500'
                  }`} />
                <span className="truncate">{conv.title || "New Conversation"}</span>
              </button>

              {/* Delete Action - Visible on Hover or Active */}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete(conv.conversation_id);
                }}
                className={`p-2 mr-1 rounded-md hover:bg-red-900/30 hover:text-red-400 transition-opacity
                  ${currentId === conv.conversation_id ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}
                `}
                title="Delete conversation"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))
        )}
      </div>

      {/* User Profile / Bottom Section */}
      <div className="p-4 border-t border-gray-800">
        <div className="flex items-center gap-3 px-2">
          <div className="h-8 w-8 rounded-full bg-primary-500/20 flex items-center justify-center text-primary-400 font-bold text-xs">
            AI
          </div>
          <div className="text-sm font-medium text-gray-300">AI Coach</div>
        </div>
      </div>
    </div>
  );
}
