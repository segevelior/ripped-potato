import { useState, useRef } from 'react';
import { Paperclip, X, FileText, Image as ImageIcon, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

const ACCEPTED_TYPES = ['application/pdf', 'image/png', 'image/jpeg', 'image/webp', 'image/gif'];
const MAX_SIZE = 32 * 1024 * 1024; // 32MB

export function FileUpload({ onFileSelect, onFileRemove, disabled, isUploading }) {
  const [selectedFile, setSelectedFile] = useState(null);
  const inputRef = useRef(null);

  const handleChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    // Validate file type
    if (!ACCEPTED_TYPES.includes(file.type)) {
      toast.error('Unsupported file type. Please upload PDF, PNG, JPEG, WebP, or GIF.');
      return;
    }

    // Validate file size
    if (file.size > MAX_SIZE) {
      toast.error('File too large. Maximum size is 32MB.');
      return;
    }

    // Validate empty file
    if (file.size === 0) {
      toast.error('File appears to be empty.');
      return;
    }

    setSelectedFile(file);
    onFileSelect(file);
  };

  const handleClear = () => {
    setSelectedFile(null);
    onFileRemove?.();
    if (inputRef.current) {
      inputRef.current.value = '';
    }
  };

  const getFileIcon = () => {
    if (!selectedFile) return null;
    if (selectedFile.type === 'application/pdf') {
      return <FileText className="w-4 h-4 text-red-500" />;
    }
    return <ImageIcon className="w-4 h-4 text-blue-500" />;
  };

  const formatFileSize = (bytes) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div className="flex items-center gap-2">
      <input
        ref={inputRef}
        type="file"
        accept=".pdf,.png,.jpg,.jpeg,.webp,.gif"
        onChange={handleChange}
        className="hidden"
        disabled={disabled || isUploading}
      />

      {/* Attach button */}
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={disabled || isUploading || selectedFile}
        aria-label="Attach file (PDF or image)"
        className={`
          p-2 rounded-full transition-colors
          ${disabled || isUploading || selectedFile
            ? 'text-gray-300 cursor-not-allowed'
            : 'text-gray-500 hover:bg-gray-100 hover:text-gray-700'
          }
        `}
        title="Attach file (PDF or image)"
      >
        <Paperclip className="w-5 h-5" />
      </button>

      {/* Selected file display */}
      {selectedFile && (
        <div className="flex items-center gap-2 bg-gray-100 px-3 py-1.5 rounded-lg max-w-xs">
          {isUploading ? (
            <Loader2 className="w-4 h-4 text-primary-500 animate-spin" />
          ) : (
            getFileIcon()
          )}
          <div className="flex flex-col min-w-0">
            <span className="text-sm font-medium text-gray-700 truncate max-w-[150px]">
              {selectedFile.name}
            </span>
            <span className="text-xs text-gray-500">
              {formatFileSize(selectedFile.size)}
            </span>
          </div>
          <button
            type="button"
            onClick={handleClear}
            disabled={isUploading}
            aria-label="Remove attached file"
            className={`
              p-1 rounded-full transition-colors
              ${isUploading
                ? 'text-gray-300 cursor-not-allowed'
                : 'text-gray-400 hover:bg-gray-200 hover:text-gray-600'
              }
            `}
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  );
}

export default FileUpload;
