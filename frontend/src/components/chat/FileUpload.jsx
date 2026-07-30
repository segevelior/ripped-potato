import { useRef } from 'react';
import { Paperclip } from 'lucide-react';
import { toast } from 'sonner';

const ACCEPTED_TYPES = ['application/pdf', 'image/png', 'image/jpeg', 'image/webp', 'image/gif'];
const MAX_SIZE = 32 * 1024 * 1024; // 32MB

/**
 * CONTROLLED paperclip trigger + validation only. The page owns the selected
 * file (single source of truth) — this component holds no file state of its
 * own. The old version kept a private `selectedFile` copy that was never reset
 * after send, leaving the chip stuck on screen and the paperclip disabled.
 * The selected-file card itself is rendered by the page via <AttachmentCard>.
 */
export function FileUpload({ onFileSelect, disabled, isUploading, hasFile }) {
  const inputRef = useRef(null);

  const handleChange = (e) => {
    const file = e.target.files[0];
    // Always clear the input so re-selecting the same file re-fires onChange.
    e.target.value = '';
    if (!file) return;

    if (!ACCEPTED_TYPES.includes(file.type)) {
      toast.error('Unsupported file type. Please upload PDF, PNG, JPEG, WebP, or GIF.');
      return;
    }
    if (file.size > MAX_SIZE) {
      toast.error('File too large. Maximum size is 32MB.');
      return;
    }
    if (file.size === 0) {
      toast.error('File appears to be empty.');
      return;
    }

    onFileSelect(file);
  };

  const isDisabled = disabled || isUploading || hasFile;

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept=".pdf,.png,.jpg,.jpeg,.webp,.gif"
        onChange={handleChange}
        className="hidden"
        disabled={isDisabled}
      />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={isDisabled}
        aria-label="Attach file (PDF or image)"
        className={`
          shrink-0 p-2 rounded-full transition-colors
          ${isDisabled
            ? 'text-gray-300 cursor-not-allowed'
            : 'text-gray-500 hover:bg-gray-100 hover:text-gray-700'
          }
        `}
        title="Attach file (PDF or image)"
      >
        <Paperclip className="w-5 h-5" />
      </button>
    </>
  );
}

export default FileUpload;
