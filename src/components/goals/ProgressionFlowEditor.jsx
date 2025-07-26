
import React, { useState, useEffect, useRef, useCallback } from "react";
import { Plus, Save, Zap, Clock, Target, Edit3, Trash2, ZoomIn, ZoomOut, X, RotateCcw, Copy } from "lucide-react";
import { Exercise, ProgressionPath } from "@/api/entities";
import { InvokeLLM } from "@/api/integrations";

const GRID_SIZE = 20;
const NODE_WIDTH = 200;
const NODE_HEIGHT = 120;

const NodeComponent = ({ 
  node, 
  position, 
  isSelected, 
  onSelect, 
  onEdit, 
  onDelete, 
  onDuplicate, 
  onDragStart,
  onConnectionStart,
  scale,
  isDragging,
  connectingFrom
}) => {
  const [isHovered, setIsHovered] = useState(false);
  
  const getStatusColor = () => {
    if (node.isCompleted) return { bg: 'bg-green-50', border: 'border-green-300', text: 'text-green-800' };
    if (node.isCurrent) return { bg: 'bg-blue-50', border: 'border-blue-300', text: 'text-blue-800' };
    return { bg: 'bg-purple-50', border: 'border-purple-300', text: 'text-purple-800' };
  };

  const colors = getStatusColor();
  const canConnect = connectingFrom && connectingFrom !== node.id;

  return (
    <div
      className="absolute group"
      style={{
        left: position.x,
        top: position.y,
        transform: `scale(${scale})`,
        transformOrigin: 'top left',
        zIndex: isSelected ? 20 : 10
      }}
    >
      {/* Main Node */}
      <div
        onMouseDown={(e) => onDragStart(e, node.id)}
        onClick={(e) => {
          e.stopPropagation();
          onSelect(node.id);
        }}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        data-node-id={node.id} // Add data-attribute for drop detection
        className={`
          relative cursor-grab active:cursor-grabbing transition-all duration-200
          ${colors.bg} ${colors.border} ${colors.text} border-2 rounded-lg shadow-sm
          ${isSelected ? 'ring-2 ring-purple-500 ring-offset-2 shadow-lg' : ''}
          ${isHovered ? 'shadow-md transform scale-105' : ''}
          ${canConnect ? 'ring-2 ring-yellow-400 ring-offset-1' : ''}
        `}
        style={{
          width: NODE_WIDTH,
          height: NODE_HEIGHT
        }}
      >
        <div className="p-3 h-full flex flex-col pointer-events-none">
          {/* Header with controls */}
          <div className="flex items-start justify-between mb-2">
            <h4 className="font-bold text-sm leading-tight flex-1">{node.exercise_name}</h4>
            <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity ml-2 pointer-events-auto">
              <button
                onClick={(e) => { e.stopPropagation(); onEdit(node); }}
                className="p-1 hover:bg-white rounded transition-colors"
                title="Edit"
              >
                <Edit3 className="w-3 h-3" />
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); onDuplicate(node); }}
                className="p-1 hover:bg-white rounded transition-colors"
                title="Duplicate"
              >
                <Copy className="w-3 h-3" />
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); onDelete(node.id); }}
                className="p-1 hover:bg-red-100 rounded transition-colors"
                title="Delete"
              >
                <Trash2 className="w-3 h-3 text-red-600" />
              </button>
            </div>
          </div>
          
          {/* Content */}
          <div className="flex-1 space-y-1">
            <div className="flex items-center gap-1 text-xs font-medium">
              <div className="w-2 h-2 bg-current rounded-full"></div>
              Level {node.level}
            </div>
            {node.mastery_criteria && (
              <div className="text-xs opacity-80 line-clamp-2">{node.mastery_criteria}</div>
            )}
            {node.timeline_week && (
              <div className="flex items-center gap-1 text-xs opacity-70">
                <Clock className="w-3 h-3" />
                Week {node.timeline_week}
              </div>
            )}
          </div>
        </div>

        {/* Connection Ports */}
        <div
          className="absolute -right-2 top-1/2 w-4 h-4 bg-white border-2 border-purple-400 rounded-full transform -translate-y-1/2 cursor-crosshair hover:scale-125 transition-all opacity-0 group-hover:opacity-100"
          onMouseDown={(e) => {
            e.stopPropagation();
            onConnectionStart(e, node.id, 'output');
          }}
          title="Drag to connect"
        >
          <div className="absolute inset-1 bg-purple-400 rounded-full"></div>
        </div>
        
        <div
          className="absolute -left-2 top-1/2 w-4 h-4 bg-white border-2 border-purple-400 rounded-full transform -translate-y-1/2 hover:scale-125 transition-all opacity-60"
          title="Input port"
        >
          <div className="absolute inset-1 bg-purple-400 rounded-full"></div>
        </div>
      </div>
    </div>
  );
};

const ConnectionEdge = ({ connection, nodes, nodePositions, scale, onDelete }) => {
  const fromNode = nodePositions[connection.from];
  const toNode = nodePositions[connection.to];
  
  if (!fromNode || !toNode) return null;

  const startX = fromNode.x + NODE_WIDTH;
  const startY = fromNode.y + NODE_HEIGHT / 2;
  const endX = toNode.x;
  const endY = toNode.y + NODE_HEIGHT / 2;
  
  const controlPointOffset = Math.abs(endX - startX) * 0.3;
  const controlX1 = startX + controlPointOffset;
  const controlX2 = endX - controlPointOffset;
  
  const pathData = `M ${startX} ${startY} C ${controlX1} ${startY}, ${controlX2} ${endY}, ${endX} ${endY}`;
  
  // Calculate midpoint for delete button
  const midX = (startX + endX) / 2;
  const midY = (startY + endY) / 2;

  return (
    <g>
      <defs>
        <marker
          id={`arrowhead-${connection.id}`}
          markerWidth="8"
          markerHeight="6"
          refX="7"
          refY="3"
          orient="auto"
          markerUnits="strokeWidth"
        >
          <polygon points="0 0, 8 3, 0 6" fill="#8b5cf6" />
        </marker>
      </defs>
      
      {/* Connection path */}
      <path
        d={pathData}
        stroke="#8b5cf6"
        strokeWidth="2"
        fill="none"
        markerEnd={`url(#arrowhead-${connection.id})`}
        className="hover:stroke-purple-700 transition-colors"
      />
      
      {/* Invisible wider path for easier clicking */}
      <path
        d={pathData}
        stroke="transparent"
        strokeWidth="12"
        fill="none"
        className="cursor-pointer"
        onClick={() => onDelete(connection.id)}
      />
      
      {/* Delete button on hover */}
      <circle
        cx={midX}
        cy={midY}
        r="8"
        fill="#ef4444"
        className="opacity-0 hover:opacity-90 transition-opacity cursor-pointer"
        onClick={() => onDelete(connection.id)}
      />
      <text
        x={midX}
        y={midY + 2}
        textAnchor="middle"
        fill="white"
        fontSize="10"
        fontWeight="bold"
        className="pointer-events-none opacity-0 hover:opacity-100"
      >
        ×
      </text>
    </g>
  );
};

export default function ProgressionFlowEditor({ goal, initialPath, onSave }) {
  const [nodes, setNodes] = useState([]);
  const [connections, setConnections] = useState([]);
  const [nodePositions, setNodePositions] = useState({});
  const [selectedNode, setSelectedNode] = useState(null);
  const [editingNode, setEditingNode] = useState(null);
  const [scale, setScale] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(null);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [isGenerating, setIsGenerating] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [connectingFrom, setConnectingFrom] = useState(null);
  const [tempConnection, setTempConnection] = useState(null);
  const canvasRef = useRef(null);
  const svgRef = useRef(null);

  useEffect(() => {
    if (initialPath?.levels) {
      const pathNodes = initialPath.levels.map((level, index) => ({
        id: `node-${level.level}`,
        ...level
      }));
      setNodes(pathNodes);
      autoArrangeNodes(pathNodes);
      
      // Create sequential connections
      const autoConnections = [];
      for (let i = 0; i < pathNodes.length - 1; i++) {
        autoConnections.push({
          id: `conn-${i}`,
          from: pathNodes[i].id,
          to: pathNodes[i + 1].id
        });
      }
      setConnections(autoConnections);
    }
  }, [initialPath]);

  const snapToGrid = (value) => Math.round(value / GRID_SIZE) * GRID_SIZE;

  const autoArrangeNodes = (nodeList) => {
    const positions = {};
    const spacing = 280;
    const rowHeight = 160;
    const maxCols = 3;
    
    nodeList.forEach((node, index) => {
      const col = index % maxCols;
      const row = Math.floor(index / maxCols);
      
      positions[node.id] = {
        x: snapToGrid(50 + col * spacing),
        y: snapToGrid(50 + row * rowHeight)
      };
    });
    
    setNodePositions(positions);
  };

  const handleGenerateWithAI = async () => {
    if (!goal) return;
    
    setIsGenerating(true);
    try {
      const prompt = `Create a progression path for the goal: "${goal.name}".
      
      This should be a structured series of 4-6 levels that gradually build toward achieving this goal.
      Each level should have:
      - A clear exercise or skill milestone
      - Specific mastery criteria (e.g., "Hold for 10 seconds" or "5 clean reps")
      - Estimated timeline in weeks
      
      Return the progression as a structured path with levels from easiest to hardest.`;

      const result = await InvokeLLM({
        prompt,
        response_json_schema: {
          type: "object",
          properties: {
            levels: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  level: { type: "number" },
                  exercise_name: { type: "string" },
                  label: { type: "string" },
                  description: { type: "string" },
                  mastery_criteria: { type: "string" },
                  timeline_week: { type: "number" }
                }
              }
            }
          }
        }
      });

      if (result.levels) {
        const aiNodes = result.levels.map(level => ({
          id: `node-${level.level}`,
          exercise_id: level.exercise_name.toLowerCase().replace(/\s/g, '_'),
          ...level
        }));
        
        setNodes(aiNodes);
        autoArrangeNodes(aiNodes);
        
        // Create sequential connections
        const autoConnections = [];
        for (let i = 0; i < aiNodes.length - 1; i++) {
          autoConnections.push({
            id: `conn-${i}`,
            from: aiNodes[i].id,
            to: aiNodes[i + 1].id
          });
        }
        setConnections(autoConnections);
      }
    } catch (error) {
      console.error("Error generating progression:", error);
      alert("Failed to generate progression. Please try again.");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleConnectionStart = useCallback((e, nodeId, port) => {
    if (port === 'output') {
      setIsConnecting(true);
      setConnectingFrom(nodeId);
      e.preventDefault();
      
      const handleMouseMove = (moveEvent) => {
        if (canvasRef.current) {
          const rect = canvasRef.current.getBoundingClientRect();
          const x = (moveEvent.clientX - rect.left - pan.x) / scale;
          const y = (moveEvent.clientY - rect.top - pan.y) / scale;
          
          setTempConnection({
            from: nodePositions[nodeId],
            to: { x, y }
          });
        }
      };
      
      const handleMouseUp = (upEvent) => {
        const elements = document.elementsFromPoint(upEvent.clientX, upEvent.clientY);
        const targetElement = elements.find(el => el.dataset.nodeId);
        
        if (targetElement && targetElement.dataset.nodeId !== nodeId) {
          const targetNodeId = targetElement.dataset.nodeId;
          const newConnection = {
            id: `conn-${Date.now()}`,
            from: nodeId,
            to: targetNodeId
          };
          setConnections(prev => [...prev, newConnection]);
        }
        
        setIsConnecting(false);
        setConnectingFrom(null);
        setTempConnection(null);
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
      };
      
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    }
  }, [nodePositions, scale, pan]);

  const handleNodeDragStart = useCallback((e, nodeId) => {
    if (isConnecting && connectingFrom && connectingFrom !== nodeId) {
      // Create connection
      const newConnection = {
        id: `conn-${Date.now()}`,
        from: connectingFrom,
        to: nodeId
      };
      setConnections(prev => [...prev, newConnection]);
      setIsConnecting(false);
      setConnectingFrom(null);
      setTempConnection(null);
      return;
    }
    
    if (!isConnecting) {
      setIsDragging(nodeId);
      setDragStart({ x: e.clientX, y: e.clientY });
      e.preventDefault();
    }
  }, [isConnecting, connectingFrom]);

  const handleMouseMove = useCallback((e) => {
    if (isDragging && nodePositions[isDragging]) {
      const deltaX = (e.clientX - dragStart.x) / scale;
      const deltaY = (e.clientY - dragStart.y) / scale;
      
      setNodePositions(prev => ({
        ...prev,
        [isDragging]: {
          x: snapToGrid(prev[isDragging].x + deltaX),
          y: snapToGrid(prev[isDragging].y + deltaY)
        }
      }));
      
      setDragStart({ x: e.clientX, y: e.clientY });
    }
  }, [isDragging, dragStart, scale]);

  const handleMouseUp = useCallback(() => {
    setIsDragging(null);
  }, []);

  useEffect(() => {
    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      return () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [isDragging, handleMouseMove, handleMouseUp]);

  const handleSave = async () => {
    const pathData = {
      goal_id: goal.id,
      goal_name: goal.name,
      levels: nodes.map(node => ({
        level: node.level,
        exercise_id: node.exercise_id || node.exercise_name.toLowerCase().replace(/\s/g, '_'),
        exercise_name: node.exercise_name,
        label: node.label || node.exercise_name,
        description: node.description || "",
        mastery_criteria: node.mastery_criteria || "",
        timeline_week: node.timeline_week || node.level
      }))
    };

    await onSave(pathData);
  };

  const handleAddNode = () => {
    const newLevel = Math.max(...nodes.map(n => n.level), 0) + 1;
    const newNode = {
      id: `node-${newLevel}`,
      level: newLevel,
      exercise_id: `new_exercise_${newLevel}`,
      exercise_name: `New Exercise ${newLevel}`,
      label: `Level ${newLevel}`,
      description: "Add description...",
      mastery_criteria: "Define criteria...",
      timeline_week: newLevel
    };
    
    setNodes([...nodes, newNode]);
    setNodePositions({
      ...nodePositions,
      [newNode.id]: {
        x: snapToGrid(50 + (newLevel % 3) * 280),
        y: snapToGrid(50 + Math.floor(newLevel / 3) * 160)
      }
    });
    setEditingNode(newNode);
  };

  const handleDuplicateNode = (node) => {
    const newLevel = Math.max(...nodes.map(n => n.level), 0) + 1;
    const duplicatedNode = {
      ...node,
      id: `node-${newLevel}`,
      level: newLevel,
      exercise_name: `${node.exercise_name} (Copy)`
    };
    
    setNodes([...nodes, duplicatedNode]);
    setNodePositions({
      ...nodePositions,
      [duplicatedNode.id]: {
        x: snapToGrid(nodePositions[node.id].x + 50),
        y: snapToGrid(nodePositions[node.id].y + 50)
      }
    });
  };

  const handleDeleteConnection = (connectionId) => {
    setConnections(connections.filter(c => c.id !== connectionId));
  };

  const handleReset = () => {
    if (confirm("Reset layout and remove all connections?")) {
      setConnections([]);
      autoArrangeNodes(nodes);
      setSelectedNode(null);
    }
  };

  return (
    <div className="w-full h-full bg-white rounded-lg border border-gray-200 overflow-hidden">
      {/* Controls Bar */}
      <div className="flex items-center justify-between p-4 border-b border-gray-200 bg-gray-50">
        <div className="flex items-center gap-3">
          <button
            onClick={handleGenerateWithAI}
            disabled={isGenerating}
            className="bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white px-4 py-2 rounded-lg flex items-center gap-2 font-medium transition-colors"
          >
            <Zap className="w-4 h-4" />
            {isGenerating ? "Generating..." : "Generate with AI"}
          </button>
          <button
            onClick={handleAddNode}
            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg flex items-center gap-2 font-medium transition-colors"
          >
            <Plus className="w-4 h-4" />
            Add Step
          </button>
          <button
            onClick={handleReset}
            className="bg-gray-200 hover:bg-gray-300 text-gray-800 px-4 py-2 rounded-lg flex items-center gap-2 font-medium transition-colors"
          >
            <RotateCcw className="w-4 h-4" />
            Reset Layout
          </button>
        </div>
        
        <div className="flex items-center gap-3">
          <button
            onClick={() => setScale(Math.max(0.5, scale - 0.1))}
            className="p-2 bg-white hover:bg-gray-50 rounded-lg border border-gray-200 transition-colors"
          >
            <ZoomOut className="w-4 h-4" />
          </button>
          <span className="text-sm font-medium min-w-[60px] text-center">
            {Math.round(scale * 100)}%
          </span>
          <button
            onClick={() => setScale(Math.min(2, scale + 0.1))}
            className="p-2 bg-white hover:bg-gray-50 rounded-lg border border-gray-200 transition-colors"
          >
            <ZoomIn className="w-4 h-4" />
          </button>
          <button
            onClick={handleSave}
            className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg flex items-center gap-2 font-medium transition-colors"
          >
            <Save className="w-4 h-4" />
            Save Changes
          </button>
        </div>
      </div>

      {/* Canvas */}
      <div
        ref={canvasRef}
        className="relative w-full h-96 bg-gray-50 overflow-hidden"
        style={{
          backgroundImage: `radial-gradient(circle, #d1d5db 1px, transparent 1px)`,
          backgroundSize: `${GRID_SIZE}px ${GRID_SIZE}px`,
          backgroundPosition: `${pan.x}px ${pan.y}px`
        }}
        onClick={() => {
          if (isConnecting) {
            setIsConnecting(false);
            setConnectingFrom(null);
            setTempConnection(null);
          }
          setSelectedNode(null);
        }}
      >
        {/* SVG for connections */}
        <svg
          ref={svgRef}
          className="absolute inset-0 pointer-events-none"
          style={{ zIndex: 1 }}
        >
          {connections.map((connection) => (
            <ConnectionEdge
              key={connection.id}
              connection={connection}
              nodes={nodes}
              nodePositions={nodePositions}
              scale={scale}
              onDelete={handleDeleteConnection}
            />
          ))}
          
          {/* Temporary connection while dragging */}
          {tempConnection && (
            <line
              x1={tempConnection.from.x + NODE_WIDTH}
              y1={tempConnection.from.y + NODE_HEIGHT / 2}
              x2={tempConnection.to.x}
              y2={tempConnection.to.y}
              stroke="#f59e0b"
              strokeWidth="2"
              strokeDasharray="5,5"
            />
          )}
        </svg>
        
        {/* Nodes */}
        <div className="absolute inset-0" style={{ zIndex: 2 }}>
          {nodes.map(node => (
            <div
              key={node.id}
              // data-node-id={node.id} -- Removed this as it's now inside NodeComponent
            >
              <NodeComponent
                node={node}
                position={nodePositions[node.id] || { x: 0, y: 0 }}
                isSelected={selectedNode === node.id}
                onSelect={setSelectedNode}
                onEdit={setEditingNode}
                onDelete={(nodeId) => {
                  setNodes(nodes.filter(n => n.id !== nodeId));
                  const newPositions = { ...nodePositions };
                  delete newPositions[nodeId];
                  setNodePositions(newPositions);
                  setConnections(connections.filter(c => c.from !== nodeId && c.to !== nodeId));
                }}
                onDuplicate={handleDuplicateNode}
                onDragStart={handleNodeDragStart}
                onConnectionStart={handleConnectionStart}
                scale={scale}
                isDragging={isDragging === node.id}
                connectingFrom={connectingFrom}
              />
            </div>
          ))}
        </div>
        
        {/* Empty state */}
        {nodes.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="text-center">
              <div className="text-6xl mb-6">🎯</div>
              <h3 className="text-xl font-bold mb-2 text-gray-800">Build Your Progression Path</h3>
              <p className="text-gray-600 mb-6 max-w-md">Create a structured journey toward your goal with connected steps and milestones.</p>
              <div className="flex gap-3 justify-center">
                <button
                  onClick={handleGenerateWithAI}
                  className="bg-purple-600 hover:bg-purple-700 text-white px-6 py-3 rounded-lg font-medium flex items-center gap-2"
                >
                  <Zap className="w-5 h-5" />
                  Generate with AI
                </button>
                <button
                  onClick={handleAddNode}
                  className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-lg font-medium flex items-center gap-2"
                >
                  <Plus className="w-5 h-5" />
                  Add First Step
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Edit Modal */}
      {editingNode && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-2xl p-6 max-w-md w-full mx-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold">Edit Level {editingNode.level}</h3>
              <button
                onClick={() => setEditingNode(null)}
                className="p-1 hover:bg-gray-100 rounded transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">Exercise Name</label>
                <input
                  type="text"
                  value={editingNode.exercise_name}
                  onChange={(e) => setEditingNode({...editingNode, exercise_name: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium mb-1">Mastery Criteria</label>
                <input
                  type="text"
                  placeholder="e.g., Hold for 30 seconds"
                  value={editingNode.mastery_criteria}
                  onChange={(e) => setEditingNode({...editingNode, mastery_criteria: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Description</label>
                <textarea
                  placeholder="What this level develops or why it's important"
                  value={editingNode.description}
                  onChange={(e) => setEditingNode({...editingNode, description: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent h-20 resize-none"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium mb-1">Timeline (weeks)</label>
                <input
                  type="number"
                  value={editingNode.timeline_week}
                  onChange={(e) => setEditingNode({...editingNode, timeline_week: parseInt(e.target.value)})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                />
              </div>
              
              <div className="flex gap-2 pt-4">
                <button
                  onClick={() => {
                    setNodes(nodes.map(n => n.id === editingNode.id ? editingNode : n));
                    setEditingNode(null);
                  }}
                  className="flex-1 bg-purple-600 hover:bg-purple-700 text-white py-2 rounded-lg font-medium transition-colors"
                >
                  Save Changes
                </button>
                <button
                  onClick={() => setEditingNode(null)}
                  className="flex-1 bg-gray-200 hover:bg-gray-300 text-gray-800 py-2 rounded-lg font-medium transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
