import React, { useMemo } from "react";
import { Check, Lock, Star, Trophy, Circle } from "lucide-react";

/**
 * ProgressionGraph - A sleek vertical progression visualization
 *
 * Design:
 * - Circles as nodes (filled or outlined based on status)
 * - Orange connecting edges/lines
 * - Text positioned next to circles
 * - Supports parallel exercise paths (displayed in a row)
 * - Click on any step to adjust your current position
 */

const NODE_SIZE = {
  default: 44,
  compact: 36,
  goal: 52
};

const EDGE_COLOR = "#f97316"; // Orange-500 for edges
const EDGE_COLOR_COMPLETED = "#22c55e"; // Green-500 for completed
const EDGE_COLOR_LOCKED = "#d1d5db"; // Gray-300 for locked

export default function ProgressionGraph({
  steps = [],
  goalExercise,
  userProgress,
  onStepClick,
  onSetCurrentStep, // New: callback to manually set current position
  compact = false,
  editable = false // New: whether user can click to adjust position
}) {
  // Calculate step status based on user progress
  const stepsWithStatus = useMemo(() => {
    return steps.map((step, index) => {
      const stepProgress = userProgress?.stepProgress?.find(sp =>
        sp.stepId === step._id || sp.stepId === step.id
      );
      const status = stepProgress?.status || (index === 0 ? "available" : "locked");

      return {
        ...step,
        status,
        isCompleted: status === "completed",
        isCurrent: status === "in_progress" || status === "available",
        level: step.level ?? index
      };
    });
  }, [steps, userProgress]);

  // Group steps by level for parallel rendering
  const stepsByLevel = useMemo(() => {
    const levels = {};
    stepsWithStatus.forEach(step => {
      const level = step.level;
      if (!levels[level]) {
        levels[level] = [];
      }
      levels[level].push(step);
    });
    return Object.entries(levels)
      .sort(([a], [b]) => Number(a) - Number(b))
      .map(([levelNum, levelSteps]) => ({ level: Number(levelNum), steps: levelSteps }));
  }, [stepsWithStatus]);

  if (!steps || steps.length === 0) {
    return (
      <div className="flex items-center justify-center py-8 text-gray-400">
        No steps defined
      </div>
    );
  }

  const nodeSize = compact ? NODE_SIZE.compact : NODE_SIZE.default;

  return (
    <div className={`relative ${compact ? 'py-3' : 'py-6'}`}>
      {/* Vertical Timeline with Orange Edges */}
      <div className="flex flex-col items-start">
        {stepsByLevel.map((levelData, levelIndex) => {
          const { steps: levelSteps } = levelData;
          const isLastLevel = levelIndex === stepsByLevel.length - 1 && !goalExercise;
          const hasParallel = levelSteps.length > 1;
          const allCompleted = levelSteps.every(s => s.isCompleted);
          const someCurrent = levelSteps.some(s => s.isCurrent);

          return (
            <div key={levelIndex} className="relative w-full">
              {/* Connecting Edge to next level */}
              {!isLastLevel && (
                <div
                  className="absolute left-[21px] z-0"
                  style={{
                    top: hasParallel ? (compact ? 60 : 80) : nodeSize,
                    height: compact ? '28px' : '40px',
                    width: '3px',
                    background: allCompleted
                      ? EDGE_COLOR_COMPLETED
                      : someCurrent
                        ? EDGE_COLOR
                        : EDGE_COLOR_LOCKED,
                    borderRadius: '2px'
                  }}
                />
              )}

              {/* Parallel steps - displayed in a visual group */}
              {hasParallel ? (
                <div className="relative mb-2">
                  {/* Parallel indicator label */}
                  {!compact && (
                    <div className="flex items-center gap-2 mb-2 ml-14">
                      <span className="text-[10px] uppercase tracking-wider font-semibold text-orange-500 bg-orange-50 px-2 py-0.5 rounded">
                        Train Together
                      </span>
                    </div>
                  )}

                  {/* Container for parallel steps */}
                  <div className="relative bg-gradient-to-r from-orange-50/50 to-transparent rounded-xl py-2 pl-0 pr-4">
                    {/* Vertical connecting line for parallel group */}
                    <div
                      className="absolute left-[21px] top-0 bottom-0 w-[3px] rounded"
                      style={{ background: someCurrent ? EDGE_COLOR : allCompleted ? EDGE_COLOR_COMPLETED : EDGE_COLOR_LOCKED }}
                    />

                    {/* Branch lines to each parallel step */}
                    <div className="space-y-1">
                      {levelSteps.map((step, stepIndex) => (
                        <div key={step._id || step.id || `${levelIndex}-${stepIndex}`} className="relative">
                          {/* Horizontal branch line */}
                          <div
                            className="absolute left-[21px] top-1/2 h-[3px] -translate-y-1/2"
                            style={{
                              width: '20px',
                              background: step.isCompleted ? EDGE_COLOR_COMPLETED : step.isCurrent ? EDGE_COLOR : EDGE_COLOR_LOCKED,
                              borderRadius: '2px'
                            }}
                          />
                          <div className="ml-10">
                            <StepNode
                              step={step}
                              index={step.order ?? levelIndex}
                              compact={compact}
                              nodeSize={nodeSize}
                              onStepClick={onStepClick}
                              onSetCurrentStep={onSetCurrentStep}
                              editable={editable}
                              isParallel
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ) : (
                <StepNode
                  step={levelSteps[0]}
                  index={levelSteps[0].order ?? levelIndex}
                  compact={compact}
                  nodeSize={nodeSize}
                  onStepClick={onStepClick}
                  onSetCurrentStep={onSetCurrentStep}
                  editable={editable}
                />
              )}
            </div>
          );
        })}

        {/* Goal Node */}
        {goalExercise && (
          <div className="relative w-full">
            {/* Final connecting edge */}
            <div
              className="absolute left-[21px] z-0"
              style={{
                top: -32,
                height: compact ? '28px' : '36px',
                width: '3px',
                background: `linear-gradient(to bottom, ${
                  stepsWithStatus.every(s => s.isCompleted) ? EDGE_COLOR_COMPLETED : EDGE_COLOR
                }, #8b5cf6)`,
                borderRadius: '2px'
              }}
            />

            <div className={`flex items-center gap-4 ${compact ? 'py-2' : 'py-3'}`}>
              {/* Goal Circle */}
              <div
                className="relative flex-shrink-0 z-10"
                style={{ width: compact ? NODE_SIZE.compact : NODE_SIZE.goal, height: compact ? NODE_SIZE.compact : NODE_SIZE.goal }}
              >
                <div
                  className="w-full h-full rounded-full flex items-center justify-center shadow-lg transition-transform hover:scale-105"
                  style={{
                    background: 'linear-gradient(135deg, #8b5cf6 0%, #7c3aed 50%, #6d28d9 100%)',
                    boxShadow: '0 0 20px rgba(139, 92, 246, 0.4)'
                  }}
                >
                  {stepsWithStatus.every(s => s.isCompleted) ? (
                    <Trophy className="text-white" style={{ width: compact ? 18 : 24, height: compact ? 18 : 24 }} />
                  ) : (
                    <Star className="text-white fill-white/30" style={{ width: compact ? 18 : 24, height: compact ? 18 : 24 }} />
                  )}
                </div>
              </div>

              {/* Goal Text */}
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <h4 className={`font-bold ${compact ? 'text-sm' : 'text-lg'} text-violet-700`}>
                    {goalExercise}
                  </h4>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-violet-100 text-violet-600 uppercase tracking-wide">
                    Goal
                  </span>
                </div>
                {!compact && (
                  <p className="text-sm text-violet-400 mt-0.5">
                    Master this to complete your journey
                  </p>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// Individual Step Node Component
function StepNode({ step, index, compact, nodeSize, onStepClick, onSetCurrentStep, editable = false, isParallel = false }) {
  const getNodeStyle = () => {
    switch (step.status) {
      case 'completed':
        return {
          bg: 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)',
          border: 'none',
          iconColor: 'white',
          shadow: '0 4px 12px rgba(34, 197, 94, 0.3)'
        };
      case 'in_progress':
      case 'available':
        return {
          bg: 'linear-gradient(135deg, #f97316 0%, #ea580c 100%)',
          border: 'none',
          iconColor: 'white',
          shadow: '0 4px 12px rgba(249, 115, 22, 0.4)'
        };
      case 'locked':
      default:
        return {
          bg: 'white',
          border: '3px solid #e5e7eb',
          iconColor: '#9ca3af',
          shadow: 'none'
        };
    }
  };

  const style = getNodeStyle();
  const isClickable = editable || (onStepClick && step.status !== 'locked');

  const handleClick = () => {
    if (editable && onSetCurrentStep) {
      // If editable mode, allow setting current step
      onSetCurrentStep(step);
    } else if (onStepClick && step.status !== 'locked') {
      onStepClick(step);
    }
  };

  return (
    <div
      className={`flex items-center gap-4 ${compact ? 'py-2' : 'py-3'} ${
        isClickable ? 'cursor-pointer group' : ''
      } ${isParallel ? '' : 'w-full'}`}
      onClick={handleClick}
    >
      {/* Circle Node */}
      <div
        className="relative flex-shrink-0 z-10"
        style={{ width: nodeSize, height: nodeSize }}
      >
        <div
          className={`w-full h-full rounded-full flex items-center justify-center transition-all duration-300 ${
            isClickable ? 'group-hover:scale-110 group-hover:ring-4 group-hover:ring-orange-200' : ''
          }`}
          style={{
            background: style.bg,
            border: style.border,
            boxShadow: style.shadow
          }}
        >
          {step.isCompleted ? (
            <Check
              style={{ width: compact ? 16 : 20, height: compact ? 16 : 20, color: style.iconColor }}
              strokeWidth={3}
            />
          ) : step.status === 'locked' ? (
            editable ? (
              // Show circle instead of lock in editable mode
              <Circle
                style={{ width: compact ? 14 : 18, height: compact ? 14 : 18, color: style.iconColor }}
              />
            ) : (
              <Lock
                style={{ width: compact ? 14 : 18, height: compact ? 14 : 18, color: style.iconColor }}
              />
            )
          ) : (
            <span
              className="font-bold"
              style={{ fontSize: compact ? 14 : 16, color: style.iconColor }}
            >
              {index + 1}
            </span>
          )}
        </div>

        {/* Edit hint on hover */}
        {editable && !compact && (
          <div className="absolute -bottom-1 -right-1 w-5 h-5 bg-orange-500 rounded-full items-center justify-center text-white text-[10px] font-bold hidden group-hover:flex shadow">
            ✓
          </div>
        )}
      </div>

      {/* Exercise Text - Next to circle */}
      <div className="flex-1 min-w-0">
        <h4 className={`font-semibold leading-tight ${compact ? 'text-sm' : 'text-base'} ${
          step.status === 'locked' && !editable ? 'text-gray-400' : 'text-gray-900'
        } ${isClickable ? 'group-hover:text-orange-600 transition-colors' : ''}`}>
          {step.exerciseName}
        </h4>

        {!compact && step.notes && (
          <p className={`text-sm mt-0.5 line-clamp-1 ${
            step.status === 'locked' && !editable ? 'text-gray-300' : 'text-gray-500'
          }`}>
            {step.notes}
          </p>
        )}

        {!compact && step.targetMetrics && (
          <div className="flex items-center gap-2 mt-1.5 flex-wrap">
            {step.targetMetrics.reps && (
              <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">
                {step.targetMetrics.reps} reps
              </span>
            )}
            {step.targetMetrics.sets && (
              <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">
                {step.targetMetrics.sets} sets
              </span>
            )}
            {step.targetMetrics.holdTime && (
              <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">
                {step.targetMetrics.holdTime}s hold
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
