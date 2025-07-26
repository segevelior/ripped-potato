import React from "react";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";

const disciplineColors = {
  climbing: "#f97316",
  strength: "#3b82f6", 
  running: "#10b981",
  cycling: "#8b5cf6",
  calisthenics: "#f59e0b",
  mobility: "#06b6d4"
};

export default function DisciplineBalance({ plan, disciplines }) {
  const chartData = Object.entries(plan.discipline_priorities || {})
    .filter(([,priority]) => priority > 0)
    .map(([discipline, priority]) => ({
      name: discipline.charAt(0).toUpperCase() + discipline.slice(1),
      value: priority,
      color: disciplineColors[discipline] || '#6b7280'
    }));

  return (
    <div className="apple-card p-6">
      <h3 className="text-lg font-semibold mb-4" style={{color: 'var(--text-primary)'}}>
        Training Balance
      </h3>
      
      {chartData.length > 0 ? (
        <div className="space-y-4">
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={chartData}
                  cx="50%"
                  cy="50%"
                  innerRadius={40}
                  outerRadius={80}
                  paddingAngle={2}
                  dataKey="value"
                >
                  {chartData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip 
                  formatter={(value) => [`${value}%`, 'Priority']}
                  contentStyle={{
                    background: 'var(--card-background)',
                    border: '1px solid var(--separator)',
                    borderRadius: '8px'
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
          
          <div className="space-y-2">
            {chartData.map((item, index) => (
              <div key={index} className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div 
                    className="w-3 h-3 rounded-full"
                    style={{ backgroundColor: item.color }}
                  ></div>
                  <span className="text-sm" style={{color: 'var(--text-primary)'}}>
                    {item.name}
                  </span>
                </div>
                <span className="text-sm font-medium" style={{color: 'var(--text-secondary)'}}>
                  {item.value}%
                </span>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="text-center py-8">
          <p style={{color: 'var(--text-secondary)'}}>No discipline priorities set</p>
        </div>
      )}
    </div>
  );
}