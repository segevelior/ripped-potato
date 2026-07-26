import { ToolExecutionMarker } from "@/components/ToolExecutionMarker";
import VideoEmbed from "@/components/chat/VideoEmbed";
import CalendarPreviewCard from "@/components/chat/CalendarPreviewCard";
import ExerciseSwapCard from "@/components/chat/ExerciseSwapCard";

/**
 * Shared ReactMarkdown components map for coach-chat surfaces (the full chat
 * page and the in-modal mini chat). MUST stay a module-level constant: if the
 * map is rebuilt per render, ReactMarkdown sees new component types every
 * streamed token and remounts the whole message subtree (animations restart,
 * text stays blank until streaming ends).
 */
export const MARKDOWN_COMPONENTS = {
  'tool-executing': ({ children }) => (
    <ToolExecutionMarker isComplete={false}>{children}</ToolExecutionMarker>
  ),
  'tool-complete': ({ children }) => (
    <ToolExecutionMarker isComplete={true}>{children}</ToolExecutionMarker>
  ),
  'video-embed': ({ videoid, title, url }) => (
    <VideoEmbed videoid={videoid} title={title} url={url} />
  ),
  'calendar-preview': ({ payload }) => (
    <CalendarPreviewCard payload={payload} />
  ),
  'exercise-swap': ({ payload }) => (
    <ExerciseSwapCard payload={payload} />
  ),
  h1: ({ children }) => (
    <h1 className="flex items-center gap-2 text-lg font-bold text-gray-900 mt-4 mb-2 pb-1 border-b border-gray-100">
      {children}
    </h1>
  ),
  h2: ({ children }) => (
    <h2 className="flex items-center gap-2 text-base font-semibold text-gray-800 mt-4 mb-2">
      <span className="w-1 h-4 bg-primary-500 rounded-full"></span>
      {children}
    </h2>
  ),
  h3: ({ children }) => (
    <h3 className="text-sm font-semibold text-gray-700 mt-3 mb-1.5">
      {children}
    </h3>
  ),
  strong: ({ children }) => (
    <strong className="font-semibold text-gray-900">{children}</strong>
  ),
  ul: ({ children }) => (
    <ul className="my-2 ml-5 space-y-1.5 list-disc">{children}</ul>
  ),
  ol: ({ children }) => (
    <ol className="my-2 ml-5 space-y-1.5 list-decimal">{children}</ol>
  ),
  li: ({ children }) => (
    <li className="text-gray-700 leading-relaxed">{children}</li>
  ),
  p: ({ children }) => (
    <p className="my-2 text-gray-700 leading-relaxed">{children}</p>
  ),
  a: ({ href, children }) => (
    <a href={href} className="text-primary-600 font-medium hover:underline" target="_blank" rel="noopener noreferrer">
      {children}
    </a>
  ),
  blockquote: ({ children }) => (
    <blockquote className="border-l-3 border-primary-300 pl-4 my-3 italic text-gray-600 bg-gray-50 py-2 rounded-r-lg">
      {children}
    </blockquote>
  ),
  hr: () => (
    <hr className="my-4 border-gray-200" />
  ),
  code: ({ inline, className, children }) => {
    if (inline) {
      return (
        <code className="px-1.5 py-0.5 bg-primary-50 text-primary-700 text-xs font-medium rounded">
          {children}
        </code>
      );
    }
    return (
      <code className={className}>
        {children}
      </code>
    );
  },
  pre: ({ children }) => (
    <pre className="my-3 p-4 bg-gray-50 border border-gray-200 rounded-xl overflow-x-auto text-sm">
      {children}
    </pre>
  ),
};

export default MARKDOWN_COMPONENTS;
