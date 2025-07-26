import React from "react";

export default function StrainMeter({ value = 0, maxValue = 100, size = "medium" }) {
  const percentage = Math.min((value / maxValue) * 100, 100);
  const radius = size === "large" ? 45 : 30;
  const strokeWidth = size === "large" ? 8 : 5;
  const normalizedRadius = radius - strokeWidth / 2;
  const circumference = normalizedRadius * 2 * Math.PI;
  const strokeDashoffset = circumference - (percentage / 100) * circumference;

  const getColor = () => {
    if (percentage > 80) return "#ef4444"; // Red
    if (percentage > 60) return "#f59e0b"; // Amber
    return "var(--accent)"; // Blue
  };

  return (
    <div className="flex items-center justify-center">
      <div className="relative">
        <svg
          height={radius * 2}
          width={radius * 2}
        >
          <circle
            stroke="#e5e5ea"
            fill="transparent"
            strokeWidth={strokeWidth}
            r={normalizedRadius}
            cx={radius}
            cy={radius}
          />
          <circle
            stroke={getColor()}
            fill="transparent"
            strokeWidth={strokeWidth}
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            strokeLinecap="round"
            transform={`rotate(-90 ${radius} ${radius})`}
            r={normalizedRadius}
            cx={radius}
            cy={radius}
            className="transition-all duration-500 ease-out"
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="text-center">
            <div className={`font-bold ${size === "large" ? "text-4xl" : "text-lg"}`} style={{color: 'var(--text-primary)'}}>
              {value.toFixed(0)}
            </div>
            <div className={`${size === "large" ? "text-sm" : "text-xs"}`} style={{color: 'var(--text-secondary)'}}>
              / {maxValue}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}