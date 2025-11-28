import React, { useState, useRef } from 'react';
import { Trash2, Pencil } from 'lucide-react';

const SWIPE_THRESHOLD = 60; // Pixels to trigger action reveal

export default function SwipeableCard({
  children,
  onDelete,
  onEdit,
  deleteLabel = "Delete",
  editLabel = "Edit",
  className = ""
}) {
  // Calculate button width based on which actions are available
  const hasDelete = !!onDelete;
  const hasEdit = !!onEdit;
  const BUTTON_WIDTH = 80;
  const TOTAL_ACTION_WIDTH = (hasDelete ? BUTTON_WIDTH : 0) + (hasEdit ? BUTTON_WIDTH : 0);

  const [translateX, setTranslateX] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [isActionsRevealed, setIsActionsRevealed] = useState(false);
  const startXRef = useRef(0);
  const currentXRef = useRef(0);
  const containerRef = useRef(null);

  const handleStart = (clientX) => {
    setIsDragging(true);
    startXRef.current = clientX;
    currentXRef.current = translateX;
  };

  const handleMove = (clientX) => {
    if (!isDragging) return;

    const diff = clientX - startXRef.current;
    let newTranslate = currentXRef.current + diff;

    // Only allow swiping left (negative values)
    newTranslate = Math.min(0, newTranslate);
    // Limit the swipe distance
    newTranslate = Math.max(-TOTAL_ACTION_WIDTH, newTranslate);

    setTranslateX(newTranslate);
  };

  const handleEnd = () => {
    setIsDragging(false);

    // If swiped past threshold, snap to reveal action buttons
    if (translateX < -SWIPE_THRESHOLD) {
      setTranslateX(-TOTAL_ACTION_WIDTH);
      setIsActionsRevealed(true);
    } else {
      // Snap back
      setTranslateX(0);
      setIsActionsRevealed(false);
    }
  };

  const handleTouchStart = (e) => {
    handleStart(e.touches[0].clientX);
  };

  const handleTouchMove = (e) => {
    handleMove(e.touches[0].clientX);
  };

  const handleTouchEnd = () => {
    handleEnd();
  };

  const handleMouseDown = (e) => {
    e.preventDefault();
    handleStart(e.clientX);
  };

  const handleMouseMove = (e) => {
    handleMove(e.clientX);
  };

  const handleMouseUp = () => {
    handleEnd();
  };

  const handleMouseLeave = () => {
    if (isDragging) {
      handleEnd();
    }
  };

  const handleDeleteClick = (e) => {
    e.stopPropagation();
    if (onDelete) {
      onDelete();
    }
    // Reset position after delete
    setTranslateX(0);
    setIsActionsRevealed(false);
  };

  const handleEditClick = (e) => {
    e.stopPropagation();
    if (onEdit) {
      onEdit();
    }
    // Reset position after edit
    setTranslateX(0);
    setIsActionsRevealed(false);
  };

  const resetPosition = () => {
    setTranslateX(0);
    setIsActionsRevealed(false);
  };

  // Handle click on the card content - if actions are revealed, close them instead
  const handleContentClick = (e) => {
    if (isActionsRevealed) {
      e.stopPropagation();
      resetPosition();
    }
  };

  // If no actions are provided, just render children
  if (!hasDelete && !hasEdit) {
    return <div className={className}>{children}</div>;
  }

  return (
    <div
      ref={containerRef}
      className={`relative overflow-hidden ${className}`}
    >
      {/* Action Buttons Background */}
      <div
        className="absolute right-0 top-0 bottom-0 flex items-stretch"
        style={{ width: TOTAL_ACTION_WIDTH }}
      >
        {/* Edit Button (appears first / leftmost) */}
        {hasEdit && (
          <button
            onClick={handleEditClick}
            className="flex flex-col items-center justify-center gap-1 bg-blue-500 text-white hover:bg-blue-600 transition-colors"
            style={{ width: BUTTON_WIDTH }}
          >
            <Pencil className="w-5 h-5" />
            <span className="text-xs font-semibold">{editLabel}</span>
          </button>
        )}

        {/* Delete Button (appears last / rightmost) */}
        {hasDelete && (
          <button
            onClick={handleDeleteClick}
            className="flex flex-col items-center justify-center gap-1 bg-red-500 text-white hover:bg-red-600 transition-colors"
            style={{ width: BUTTON_WIDTH }}
          >
            <Trash2 className="w-5 h-5" />
            <span className="text-xs font-semibold">{deleteLabel}</span>
          </button>
        )}
      </div>

      {/* Swipeable Content */}
      <div
        className="relative bg-white"
        style={{
          transform: `translateX(${translateX}px)`,
          transition: isDragging ? 'none' : 'transform 0.2s ease-out',
        }}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onMouseDown={handleMouseDown}
        onMouseMove={isDragging ? handleMouseMove : undefined}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseLeave}
        onClick={handleContentClick}
      >
        {children}
      </div>
    </div>
  );
}
