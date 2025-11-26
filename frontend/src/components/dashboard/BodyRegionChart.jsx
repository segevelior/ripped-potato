
import React from "react";
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Cell, Tooltip } from "recharts";

const muscleGroupColors = {
  chest: "#ef4444",
  back: "#f97316",
  shoulders: "#f59e0b",
  biceps: "#eab308",
  triceps: "#84cc16",
  forearms: "#22c55e",
  core: "#10b981",
  glutes: "#14b8a6",
  quads: "#06b6d4",
  hamstrings: "#0ea5e9",
  calves: "#3b82f6",
  full_body: "#6366f1",
  mind: "#8b5cf6"
};

export default function BodyRegionChart({ workouts, activities }) {
  const getMuscleStrainData = () => {
    const strainByMuscle = {};

    // Initialize all muscle groups
    Object.keys(muscleGroupColors).forEach(muscle => {
      strainByMuscle[muscle] = 0;
    });

    // Sum strain from workouts (last 7 days)
    const recent = workouts.slice(0, 7);
    recent.forEach(workout => {
      if (workout.muscle_strain) {
        Object.entries(workout.muscle_strain).forEach(([muscle, strain]) => {
          strainByMuscle[muscle] = (strainByMuscle[muscle] || 0) + strain;
        });
      }
    });

    // Convert to chart data
    return Object.entries(strainByMuscle)
      .map(([muscle, strain]) => ({
        muscle: muscle.replace('_', ' '),
        strain: strain,
        color: muscleGroupColors[muscle]
      }))
      .filter(item => item.strain > 0)
      .sort((a, b) => b.strain - a.strain)
      .slice(0, 8); // Top 8 most strained
  };

  const data = getMuscleStrainData();

  return (
    <div className="apple-card p-6">
      <h2 className="text-xl font-bold mb-6" style={{color: 'var(--text-primary)'}}>
        Body Region Load (7 Days)
      </h2>
      
      {data.length > 0 ? (
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
              <XAxis 
                dataKey="muscle" 
                tick={{ fontSize: 12, fill: 'var(--text-secondary)', textTransform: 'capitalize' }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis 
                tick={{ fontSize: 12, fill: 'var(--text-secondary)' }}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip
                cursor={{ fill: 'rgba(242, 242, 247, 0.5)' }}
                contentStyle={{
                  background: 'var(--card-background)',
                  border: '1px solid var(--separator)',
                  borderRadius: '8px',
                  boxShadow: '0 4px 6px rgba(0,0,0,0.1)'
                }}
              />
              <Bar dataKey="strain" radius={[4, 4, 0, 0]}>
                {data.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} fillOpacity={0.8}/>
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <div className="h-64 flex items-center justify-center">
          <div className="text-center">
            <div className="w-16 h-16 mx-auto mb-4 flex items-center justify-center rounded-full bg-gray-100">
              <BarChart className="w-8 h-8" style={{color: 'var(--text-secondary)'}} />
            </div>
            <p style={{color: 'var(--text-secondary)'}}>No training data yet</p>
          </div>
        </div>
      )}
    </div>
  );
}
