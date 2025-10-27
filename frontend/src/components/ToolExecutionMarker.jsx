import { Loader2 } from "lucide-react";

/**
 * Component to render tool execution markers inline within AI messages
 * Renders the <tool-executing> and <tool-complete> tags beautifully
 */
export function ToolExecutionMarker({ children, isComplete }) {
  return (
    <div className="flex justify-start my-4">
      <div className="inline-flex items-center gap-2.5 px-4 py-2 bg-gray-50 border border-gray-200 rounded-full text-gray-500 text-xs font-medium">
        {isComplete ? (
          <span className="text-green-500 text-sm">✓</span>
        ) : (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        )}
        <span>{children}</span>
      </div>
    </div>
  );
}

/**
 * Custom ReactMarkdown components to render tool markers
 */
export const markdownComponents = {
  // Custom renderer for tool-executing tags
  'tool-executing': ({ children }) => (
    <ToolExecutionMarker isComplete={false}>{children}</ToolExecutionMarker>
  ),
  // Custom renderer for tool-complete tags
  'tool-complete': ({ children }) => (
    <ToolExecutionMarker isComplete={true}>{children}</ToolExecutionMarker>
  ),
};
