import { X, FileText, Image as ImageIcon, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Compact attachment card (Claude-desktop style), used in BOTH the composer
 * (with onRemove) and sent message bubbles (read-only).
 *
 * The card is bounded (`max-w-full min-w-0`) so it can never exceed its
 * container, and the remove button lives INSIDE the card (absolute, top-right)
 * — it is structurally impossible to push it off-screen, which is what the old
 * inline chip did on narrow viewports.
 */
export function AttachmentCard({
  name,
  mimeType,
  sizeBytes,
  isUploading = false,
  failed = false,
  previewUrl = null,
  onRemove,
  className,
}) {
  const isPdf = mimeType === 'application/pdf';

  const formatFileSize = (bytes) => {
    if (bytes == null) return null;
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const description = [
    isPdf ? 'PDF' : 'Image',
    formatFileSize(sizeBytes),
    failed ? 'upload failed' : null,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <div
      className={cn(
        'relative flex items-center gap-2.5 rounded-lg border border-gray-200 bg-gray-50 p-2 max-w-full min-w-0 w-fit',
        onRemove && 'pr-10',
        failed && 'border-red-200 bg-red-50',
        className
      )}
    >
      {/* Media tile */}
      <div className="shrink-0 flex items-center justify-center w-9 h-9 rounded-md bg-white border border-gray-200 overflow-hidden">
        {isUploading ? (
          <Loader2 className="w-4 h-4 text-primary-500 animate-spin" />
        ) : previewUrl ? (
          <img src={previewUrl} alt={name} className="w-full h-full object-cover" />
        ) : isPdf ? (
          <FileText className="w-4 h-4 text-red-500" />
        ) : (
          <ImageIcon className="w-4 h-4 text-blue-500" />
        )}
      </div>

      {/* Title + description — min-w-0 lets the filename truncate instead of
          forcing the card wider than its container */}
      <div className="min-w-0 flex flex-col">
        <span className={cn('truncate text-sm font-medium', failed ? 'text-red-700' : 'text-gray-700')}>
          {name}
        </span>
        <span className={cn('text-xs', failed ? 'text-red-500' : 'text-gray-500')}>
          {description}
        </span>
      </div>

      {/* Remove — inside the card, always reachable. 36px touch target. */}
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          disabled={isUploading}
          aria-label="Remove attached file"
          className={cn(
            'absolute top-1 right-1 flex items-center justify-center w-9 h-9 rounded-full transition-colors',
            isUploading
              ? 'text-gray-300 cursor-not-allowed'
              : 'text-gray-400 hover:bg-gray-200 hover:text-gray-600'
          )}
        >
          <X className="w-4 h-4 shrink-0" />
        </button>
      )}
    </div>
  );
}

export default AttachmentCard;
