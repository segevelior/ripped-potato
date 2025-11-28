import { useState } from 'react';
import { Play, ExternalLink } from 'lucide-react';

/**
 * VideoEmbed component for displaying YouTube video previews in chat
 * Renders as a clickable thumbnail that expands to an embedded player
 *
 * Usage in AI response:
 * <video-embed videoid="dQw4w9WgXcQ" title="Exercise Tutorial" />
 */
export default function VideoEmbed({ videoid, title, url }) {
  const [isExpanded, setIsExpanded] = useState(false);

  // Extract video ID from various YouTube URL formats if videoid not provided
  const extractVideoId = (videoUrl) => {
    if (!videoUrl) return null;
    const patterns = [
      /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&\n?#]+)/,
      /^([a-zA-Z0-9_-]{11})$/ // Direct video ID
    ];
    for (const pattern of patterns) {
      const match = videoUrl.match(pattern);
      if (match) return match[1];
    }
    return null;
  };

  const videoId = videoid || extractVideoId(url);

  if (!videoId) {
    // Fallback to regular link if no valid video ID
    return (
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="text-primary-600 font-medium hover:underline inline-flex items-center gap-1"
      >
        {title || 'Watch Video'} <ExternalLink className="w-3 h-3" />
      </a>
    );
  }

  const thumbnailUrl = `https://img.youtube.com/vi/${videoId}/mqdefault.jpg`;
  const youtubeUrl = `https://www.youtube.com/watch?v=${videoId}`;
  const embedUrl = `https://www.youtube.com/embed/${videoId}?autoplay=1&rel=0`;

  if (isExpanded) {
    return (
      <div className="my-3 rounded-xl overflow-hidden border border-gray-200 shadow-sm">
        <div className="relative w-full" style={{ paddingBottom: '56.25%' }}>
          <iframe
            className="absolute top-0 left-0 w-full h-full"
            src={embedUrl}
            title={title || 'YouTube video'}
            frameBorder="0"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
          />
        </div>
        <div className="px-3 py-2 bg-gray-50 border-t border-gray-200 flex items-center justify-between">
          <span className="text-sm text-gray-600 truncate flex-1">{title || 'Video Tutorial'}</span>
          <a
            href={youtubeUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-primary-600 hover:underline flex items-center gap-1 ml-2"
          >
            Open in YouTube <ExternalLink className="w-3 h-3" />
          </a>
        </div>
      </div>
    );
  }

  return (
    <div
      className="my-3 rounded-xl overflow-hidden border border-gray-200 shadow-sm cursor-pointer group hover:shadow-md transition-shadow"
      onClick={() => setIsExpanded(true)}
    >
      <div className="relative">
        <img
          src={thumbnailUrl}
          alt={title || 'Video thumbnail'}
          className="w-full aspect-video object-cover"
        />
        {/* Play button overlay */}
        <div className="absolute inset-0 flex items-center justify-center bg-black/20 group-hover:bg-black/30 transition-colors">
          <div className="w-14 h-14 rounded-full bg-red-600 flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform">
            <Play className="w-7 h-7 text-white fill-white ml-1" />
          </div>
        </div>
        {/* YouTube badge */}
        <div className="absolute bottom-2 right-2 px-2 py-0.5 bg-black/70 rounded text-xs text-white font-medium">
          YouTube
        </div>
      </div>
      <div className="px-3 py-2 bg-white">
        <p className="text-sm font-medium text-gray-900 line-clamp-2">{title || 'Video Tutorial'}</p>
        <p className="text-xs text-gray-500 mt-0.5">Click to play</p>
      </div>
    </div>
  );
}
