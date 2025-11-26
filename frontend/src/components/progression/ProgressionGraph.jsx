import { useMemo } from "react";
import { Check, Lock, Star, Trophy, Circle } from "lucide-react";

/**
 * ProgressionGraph - Visual branching graph for exercise progressions
 *
 * Design:
 * - Vertical flow with horizontal branching for parallel exercises
 * - Orange edges connecting nodes
 * - Parallel paths split visually like a tree/graph
 */

const NODE_SIZE = {
  default: 40,
  compact: 32,
  goal: 44
};

const EDGE_COLOR = "#f97316";
const EDGE_COLOR_COMPLETED = "#22c55e";
const EDGE_COLOR_LOCKED = "#e5e7eb";

export default function ProgressionGraph({
  steps = [],
  goalExercise,
  userProgress,
  onStepClick,
  onSetCurrentStep,
  compact = false,
  editable = false
}) {
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
      <div className="flex items-center justify-center py-6 text-gray-400 text-sm">
        No steps defined
      </div>
    );
  }

  const nodeSize = compact ? NODE_SIZE.compact : NODE_SIZE.default;

  return (
    <div className={`relative ${compact ? 'py-2' : 'py-4'}`}>
      <div className="flex flex-col items-center">
        {stepsByLevel.map((levelData, levelIndex) => {
          const { steps: levelSteps } = levelData;
          const isLastLevel = levelIndex === stepsByLevel.length - 1 && !goalExercise;
          const hasParallel = levelSteps.length > 1;
          const allCompleted = levelSteps.every(s => s.isCompleted);
          const someCurrent = levelSteps.some(s => s.isCurrent);

          const edgeColor = allCompleted ? EDGE_COLOR_COMPLETED : someCurrent ? EDGE_COLOR : EDGE_COLOR_LOCKED;

          return (
            <div key={levelIndex} className="relative w-full">
              {/* Parallel branching layout */}
              {hasParallel ? (
                <div className="relative">
                  {/* SVG for branch lines */}
                  <svg
                    className="absolute top-0 left-0 w-full overflow-visible pointer-events-none"
                    style={{ height: compact ? 60 : 80 }}
                  >
                    {/* Main vertical line coming in */}
                    {levelIndex > 0 && (
                      <line
                        x1="50%"
                        y1="0"
                        x2="50%"
                        y2={compact ? 12 : 16}
                        stroke={edgeColor}
                        strokeWidth="2"
                      />
                    )}

                    {/* Horizontal connector bar */}
                    <line
                      x1={`${50 - (levelSteps.length - 1) * (compact ? 18 : 22)}%`}
                      y1={compact ? 12 : 16}
                      x2={`${50 + (levelSteps.length - 1) * (compact ? 18 : 22)}%`}
                      y2={compact ? 12 : 16}
                      stroke={edgeColor}
                      strokeWidth="2"
                    />

                    {/* Vertical drops to each node */}
                    {levelSteps.map((_, i) => {
                      const xPercent = 50 + (i - (levelSteps.length - 1) / 2) * (compact ? 36 : 44);
                      return (
                        <line
                          key={i}
                          x1={`${xPercent}%`}
                          y1={compact ? 12 : 16}
                          x2={`${xPercent}%`}
                          y2={compact ? 24 : 32}
                          stroke={levelSteps[i].isCompleted ? EDGE_COLOR_COMPLETED : levelSteps[i].isCurrent ? EDGE_COLOR : EDGE_COLOR_LOCKED}
                          strokeWidth="2"
                        />
                      );
                    })}
                  </svg>

                  {/* Nodes row */}
                  <div
                    className="flex justify-center gap-2"
                    style={{ paddingTop: compact ? 24 : 32 }}
                  >
                    {levelSteps.map((step, stepIndex) => (
                      <BranchNode
                        key={step._id || step.id || `${levelIndex}-${stepIndex}`}
                        step={step}
                        index={step.order ?? levelIndex}
                        compact={compact}
                        nodeSize={nodeSize}
                        onStepClick={onStepClick}
                        onSetCurrentStep={onSetCurrentStep}
                        editable={editable}
                      />
                    ))}
                  </div>

                  {/* Merge lines after parallel nodes */}
                  {!isLastLevel && (
                    <svg
                      className="w-full overflow-visible pointer-events-none"
                      style={{ height: compact ? 20 : 28 }}
                    >
                      {/* Vertical lines from each node */}
                      {levelSteps.map((step, i) => {
                        const xPercent = 50 + (i - (levelSteps.length - 1) / 2) * (compact ? 36 : 44);
                        return (
                          <line
                            key={i}
                            x1={`${xPercent}%`}
                            y1="0"
                            x2={`${xPercent}%`}
                            y2={compact ? 8 : 12}
                            stroke={step.isCompleted ? EDGE_COLOR_COMPLETED : step.isCurrent ? EDGE_COLOR : EDGE_COLOR_LOCKED}
                            strokeWidth="2"
                          />
                        );
                      })}

                      {/* Horizontal merge bar */}
                      <line
                        x1={`${50 - (levelSteps.length - 1) * (compact ? 18 : 22)}%`}
                        y1={compact ? 8 : 12}
                        x2={`${50 + (levelSteps.length - 1) * (compact ? 18 : 22)}%`}
                        y2={compact ? 8 : 12}
                        stroke={allCompleted ? EDGE_COLOR_COMPLETED : EDGE_COLOR_LOCKED}
                        strokeWidth="2"
                      />

                      {/* Main vertical line going out */}
                      <line
                        x1="50%"
                        y1={compact ? 8 : 12}
                        x2="50%"
                        y2={compact ? 20 : 28}
                        stroke={allCompleted ? EDGE_COLOR_COMPLETED : EDGE_COLOR_LOCKED}
                        strokeWidth="2"
                      />
                    </svg>
                  )}
                </div>
              ) : (
                /* Single node (no parallel) */
                <div className="relative">
                  {/* Connector line from previous */}
                  {levelIndex > 0 && (
                    <div
                      className="absolute left-1/2 -translate-x-1/2"
                      style={{
                        top: 0,
                        height: compact ? 8 : 12,
                        width: 2,
                        background: edgeColor
                      }}
                    />
                  )}

                  <div
                    className="flex justify-center"
                    style={{ paddingTop: levelIndex > 0 ? (compact ? 8 : 12) : 0 }}
                  >
                    <SingleNode
                      step={levelSteps[0]}
                      index={levelSteps[0].order ?? levelIndex}
                      compact={compact}
                      nodeSize={nodeSize}
                      onStepClick={onStepClick}
                      onSetCurrentStep={onSetCurrentStep}
                      editable={editable}
                    />
                  </div>

                  {/* Connector line to next */}
                  {!isLastLevel && (
                    <div
                      className="absolute left-1/2 -translate-x-1/2"
                      style={{
                        bottom: -(compact ? 8 : 12),
                        height: compact ? 8 : 12,
                        width: 2,
                        background: levelSteps[0].isCompleted ? EDGE_COLOR_COMPLETED : EDGE_COLOR_LOCKED
                      }}
                    />
                  )}

                  {/* Spacer for connector */}
                  {!isLastLevel && <div style={{ height: compact ? 8 : 12 }} />}
                </div>
              )}
            </div>
          );
        })}

        {/* Goal Node */}
        {goalExercise && (
          <div className="relative">
            {/* Final connector */}
            <div
              className="absolute left-1/2 -translate-x-1/2"
              style={{
                top: 0,
                height: compact ? 12 : 16,
                width: 2,
                background: `linear-gradient(to bottom, ${
                  stepsWithStatus.every(s => s.isCompleted) ? EDGE_COLOR_COMPLETED : EDGE_COLOR
                }, #8b5cf6)`
              }}
            />

            <div
              className="flex justify-center"
              style={{ paddingTop: compact ? 12 : 16 }}
            >
              <div className="flex flex-col items-center">
                <div
                  className="rounded-full flex items-center justify-center shadow-lg"
                  style={{
                    width: compact ? NODE_SIZE.compact : NODE_SIZE.goal,
                    height: compact ? NODE_SIZE.compact : NODE_SIZE.goal,
                    background: 'linear-gradient(135deg, #8b5cf6 0%, #7c3aed 50%, #6d28d9 100%)',
                    boxShadow: '0 0 16px rgba(139, 92, 246, 0.4)'
                  }}
                >
                  {stepsWithStatus.every(s => s.isCompleted) ? (
                    <Trophy className="text-white" style={{ width: compact ? 14 : 18, height: compact ? 14 : 18 }} />
                  ) : (
                    <Star className="text-white fill-white/30" style={{ width: compact ? 14 : 18, height: compact ? 14 : 18 }} />
                  )}
                </div>
                <div className="mt-2 text-center">
                  <span className={`font-bold text-violet-700 ${compact ? 'text-xs' : 'text-sm'}`}>
                    {goalExercise}
                  </span>
                  <span className="ml-1.5 px-1.5 py-0.5 rounded-full text-[8px] font-bold bg-violet-100 text-violet-600 uppercase">
                    Goal
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// Single node (for non-parallel steps)
function SingleNode({ step, index, compact, nodeSize, onStepClick, onSetCurrentStep, editable }) {
  const style = getNodeStyle(step.status);
  const isClickable = editable || (onStepClick && step.status !== 'locked');

  const handleClick = () => {
    if (editable && onSetCurrentStep) {
      onSetCurrentStep(step);
    } else if (onStepClick && step.status !== 'locked') {
      onStepClick(step);
    }
  };

  return (
    <div
      className={`flex flex-col items-center ${isClickable ? 'cursor-pointer group' : ''}`}
      onClick={handleClick}
    >
      <div
        className={`rounded-full flex items-center justify-center transition-all ${
          isClickable ? 'group-hover:scale-110 group-hover:ring-2 group-hover:ring-orange-200' : ''
        }`}
        style={{
          width: nodeSize,
          height: nodeSize,
          background: style.bg,
          border: style.border,
          boxShadow: style.shadow
        }}
      >
        <NodeIcon step={step} index={index} compact={compact} iconColor={style.iconColor} editable={editable} />
      </div>
      <div className={`mt-1.5 text-center max-w-[100px] ${compact ? 'max-w-[80px]' : ''}`}>
        <p className={`font-medium leading-tight ${compact ? 'text-[10px]' : 'text-xs'} ${
          step.status === 'locked' && !editable ? 'text-gray-400' : 'text-gray-900'
        } ${isClickable ? 'group-hover:text-orange-600' : ''} line-clamp-2`}>
          {step.exerciseName}
        </p>
        {!compact && step.targetMetrics && (
          <p className="text-[9px] text-gray-400 mt-0.5">
            {step.targetMetrics.reps && `${step.targetMetrics.reps} reps`}
            {step.targetMetrics.sets && ` × ${step.targetMetrics.sets}`}
            {step.targetMetrics.holdTime && `${step.targetMetrics.holdTime}s`}
          </p>
        )}
      </div>
    </div>
  );
}

// Branch node (for parallel steps - more compact)
function BranchNode({ step, index, compact, nodeSize, onStepClick, onSetCurrentStep, editable }) {
  const style = getNodeStyle(step.status);
  const isClickable = editable || (onStepClick && step.status !== 'locked');

  const handleClick = () => {
    if (editable && onSetCurrentStep) {
      onSetCurrentStep(step);
    } else if (onStepClick && step.status !== 'locked') {
      onStepClick(step);
    }
  };

  return (
    <div
      className={`flex flex-col items-center ${isClickable ? 'cursor-pointer group' : ''}`}
      onClick={handleClick}
      style={{ width: compact ? 70 : 90 }}
    >
      <div
        className={`rounded-full flex items-center justify-center transition-all ${
          isClickable ? 'group-hover:scale-110 group-hover:ring-2 group-hover:ring-orange-200' : ''
        }`}
        style={{
          width: nodeSize,
          height: nodeSize,
          background: style.bg,
          border: style.border,
          boxShadow: style.shadow
        }}
      >
        <NodeIcon step={step} index={index} compact={compact} iconColor={style.iconColor} editable={editable} />
      </div>
      <div className="mt-1.5 text-center">
        <p className={`font-medium leading-tight ${compact ? 'text-[9px]' : 'text-[11px]'} ${
          step.status === 'locked' && !editable ? 'text-gray-400' : 'text-gray-900'
        } ${isClickable ? 'group-hover:text-orange-600' : ''} line-clamp-2`}>
          {step.exerciseName}
        </p>
      </div>
    </div>
  );
}

// Shared node icon component
function NodeIcon({ step, index, compact, iconColor, editable }) {
  if (step.isCompleted) {
    return <Check style={{ width: compact ? 14 : 16, height: compact ? 14 : 16, color: iconColor }} strokeWidth={3} />;
  }
  if (step.status === 'locked') {
    return editable
      ? <Circle style={{ width: compact ? 12 : 14, height: compact ? 12 : 14, color: iconColor }} />
      : <Lock style={{ width: compact ? 12 : 14, height: compact ? 12 : 14, color: iconColor }} />;
  }
  return (
    <span className="font-bold" style={{ fontSize: compact ? 11 : 13, color: iconColor }}>
      {index + 1}
    </span>
  );
}

// Style helper
function getNodeStyle(status) {
  switch (status) {
    case 'completed':
      return {
        bg: 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)',
        border: 'none',
        iconColor: 'white',
        shadow: '0 2px 8px rgba(34, 197, 94, 0.3)'
      };
    case 'in_progress':
    case 'available':
      return {
        bg: 'linear-gradient(135deg, #f97316 0%, #ea580c 100%)',
        border: 'none',
        iconColor: 'white',
        shadow: '0 2px 8px rgba(249, 115, 22, 0.35)'
      };
    default:
      return {
        bg: 'white',
        border: '2px solid #e5e7eb',
        iconColor: '#9ca3af',
        shadow: 'none'
      };
  }
}
