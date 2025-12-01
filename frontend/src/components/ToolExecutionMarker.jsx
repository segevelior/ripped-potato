import { Loader2, Globe, BookOpen, Search, Brain, Dumbbell, Calendar, Target, ListChecks, Database } from "lucide-react";

/**
 * Extract text content from React children (handles strings, arrays, nested elements)
 */
function getTextFromChildren(children) {
  if (typeof children === 'string') return children;
  if (typeof children === 'number') return String(children);
  if (!children) return '';

  // Handle arrays of children
  if (Array.isArray(children)) {
    return children.map(getTextFromChildren).join('');
  }

  // Handle React elements
  if (children.props && children.props.children) {
    return getTextFromChildren(children.props.children);
  }

  // Try to convert to string
  return String(children || '');
}

/**
 * Get the appropriate icon for a tool based on its description
 */
function getToolIcon(description, isComplete) {
  const desc = (description || '').toLowerCase();

  // Web search & research tools - these get special treatment
  if (desc.includes('researching')) {
    return <Brain className={`h-3.5 w-3.5 ${isComplete ? 'text-purple-500' : 'text-purple-400 animate-pulse'}`} />;
  }
  if (desc.includes('reading content') || desc.includes('reading:')) {
    return <BookOpen className={`h-3.5 w-3.5 ${isComplete ? 'text-blue-500' : 'text-blue-400 animate-pulse'}`} />;
  }
  if (desc.includes('searching the web') || desc.includes('searching web')) {
    return <Globe className={`h-3.5 w-3.5 ${isComplete ? 'text-green-500' : 'text-green-400 animate-pulse'}`} />;
  }

  // Other tools
  if (desc.includes('exercise') || desc.includes('workout') || desc.includes('training')) {
    return <Dumbbell className={`h-3.5 w-3.5 ${isComplete ? 'text-orange-500' : 'text-orange-400'}`} />;
  }
  if (desc.includes('calendar') || desc.includes('schedul')) {
    return <Calendar className={`h-3.5 w-3.5 ${isComplete ? 'text-blue-500' : 'text-blue-400'}`} />;
  }
  if (desc.includes('goal')) {
    return <Target className={`h-3.5 w-3.5 ${isComplete ? 'text-green-500' : 'text-green-400'}`} />;
  }
  if (desc.includes('plan')) {
    return <ListChecks className={`h-3.5 w-3.5 ${isComplete ? 'text-indigo-500' : 'text-indigo-400'}`} />;
  }
  if (desc.includes('remember') || desc.includes('memory') || desc.includes('forget')) {
    return <Database className={`h-3.5 w-3.5 ${isComplete ? 'text-pink-500' : 'text-pink-400'}`} />;
  }

  // Default search icon
  return <Search className={`h-3.5 w-3.5 ${isComplete ? 'text-gray-500' : 'text-gray-400'}`} />;
}

/**
 * Get background styling for web/research tools
 */
function getToolStyles(description, isComplete) {
  const desc = (description || '').toLowerCase();

  // Special styling for web/research tools
  if (desc.includes('researching')) {
    return isComplete
      ? 'bg-purple-50 border-purple-200 text-purple-700'
      : 'bg-purple-50/50 border-purple-200/50 text-purple-600';
  }
  if (desc.includes('reading content') || desc.includes('reading:')) {
    return isComplete
      ? 'bg-blue-50 border-blue-200 text-blue-700'
      : 'bg-blue-50/50 border-blue-200/50 text-blue-600';
  }
  if (desc.includes('searching the web') || desc.includes('searching web')) {
    return isComplete
      ? 'bg-green-50 border-green-200 text-green-700'
      : 'bg-green-50/50 border-green-200/50 text-green-600';
  }

  // Default styling
  return 'bg-gray-50 border-gray-200 text-gray-500';
}

/**
 * Component to render tool execution markers inline within AI messages
 * Renders the <tool-executing> and <tool-complete> tags beautifully
 */
export function ToolExecutionMarker({ children, isComplete }) {
  // Extract text from children (handles React nodes from ReactMarkdown)
  const description = getTextFromChildren(children);
  const icon = getToolIcon(description, isComplete);
  const styles = getToolStyles(description, isComplete);

  return (
    <div className="flex justify-start my-4">
      <div className={`inline-flex items-center gap-2.5 px-4 py-2 border rounded-full text-xs font-medium transition-all duration-300 ${styles}`}>
        {isComplete ? (
          <span className="text-green-500 text-sm">✓</span>
        ) : (
          <Loader2 className="h-3.5 w-3.5 animate-spin text-current opacity-70" />
        )}
        {icon}
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
