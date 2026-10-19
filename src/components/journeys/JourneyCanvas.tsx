/**
 * CRM 3.0 — Premium Journey Canvas
 * React Flow-based visual node editor for customer journeys.
 * Integrates with existing Supabase backend and journey engine.
 */

'use client';

import {
  useCallback,
  useEffect,
  useRef,
} from 'react';
import {
  ReactFlow,
  useReactFlow,
  Controls,
  Background,
  MiniMap,
  Node,
  Edge,
  useNodesState,
  useEdgesState,
  addEdge,
  Connection,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import {
  Zap, GitBranch, Brain, CheckCircle, Timer, Flag, X,
  Save, Play,
} from 'lucide-react';

// ── Types ──────────────────────────────────────────────────────────

export interface JourneyNodeData {
  label: string;
  config: Record<string, unknown>;
  [key: string]: unknown; // React Flow compatibility
}

export interface CanvasNode {
  id: string;
  type: 'trigger' | 'condition' | 'ai_decision' | 'action' | 'wait' | 'stage' | 'end';
  position: { x: number; y: number };
  data: JourneyNodeData;
}

export interface CanvasEdge {
  id: string;
  source: string;
  target: string;
  label?: 'yes' | 'no';
}

interface JourneyCanvasProps {
  journeyId: string;
  nodes: CanvasNode[];
  edges: CanvasEdge[];
  onSave: (nodes: CanvasNode[], edges: CanvasEdge[]) => Promise<void>;
  onPublish: () => Promise<void>;
  status: 'draft' | 'active' | 'paused' | 'archived';
  isLoading: boolean;
}

// ── Node type colors & icons ───────────────────────────────────────

const NODE_CONFIG: Record<string, { color: string; icon: React.ReactNode }> = {
  trigger:     { color: '#4f6df5', icon: <Zap size={12} strokeWidth={2} /> },
  condition:   { color: '#f4c95d', icon: <GitBranch size={12} strokeWidth={2} /> },
  ai_decision: { color: '#8b5cf6', icon: <Brain size={12} strokeWidth={2} /> },
  action:      { color: '#28c99a', icon: <CheckCircle size={12} strokeWidth={2} /> },
  wait:        { color: '#f46b72', icon: <Timer size={12} strokeWidth={2} /> },
  stage:       { color: '#06b6d4', icon: <Flag size={12} strokeWidth={2} /> },
  end:         { color: '#8790aa', icon: <X size={12} strokeWidth={2} /> },
};

const TRIGGER_LABELS: Record<string, string> = {
  manual: 'Manual', contact_created: 'Contact Created', lead_created: 'Lead Created',
  conversation_started: 'Conversation Started', message_received: 'Message Received',
  deal_created: 'Deal Created', deal_stage_changed: 'Deal Stage Changed',
  deal_won: 'Deal Won', appointment_created: 'Appointment Created',
  customer_inactive: 'Customer Inactive', ai_score_threshold: 'AI Score Threshold',
  intent_detected: 'Intent Detected', content_interaction: 'Content Interaction',
};

// ── Custom Node: Trigger ───────────────────────────────────────────

function TriggerNode({ data, selected }: { data: JourneyNodeData; selected: boolean }) {
  const cfg = NODE_CONFIG.trigger;
  return (
    <div className={`p-3 rounded-xl border min-w-[160px] ${selected ? 'ring-2 ring-crm-primary/50 shadow-lg' : 'border-crm-border/50'}`} style={{ background: selected ? 'rgba(79,109,245,0.10)' : 'var(--crm-card-bg)', borderColor: cfg.color }}>
      <div className="flex items-center gap-2 mb-2">
        <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${cfg.color}10`} style={{ color: cfg.color }}>
          {cfg.icon}
        </div>
        <span className="text-xs font-bold text-crm-text" style={{ color: 'var(--crm-text)' }}>{data.label}</span>
      </div>
      <div className="text-[10px] text-crm-muted uppercase tracking-wider">trigger</div>
    </div>
  );
}

// ── Custom Node: Condition ─────────────────────────────────────────

function ConditionNode({ data, selected }: { data: JourneyNodeData; selected: boolean }) {
  const cfg = NODE_CONFIG.condition;
  return (
    <div className={`p-3 rounded-xl border min-w-[160px] ${selected ? 'ring-2 ring-crm-warning/50 shadow-lg' : 'border-crm-border/50'}`} style={{ background: selected ? 'rgba(244,201,93,0.10)' : 'var(--crm-card-bg)', borderColor: cfg.color }}>
      <div className="flex items-center gap-2 mb-2">
        <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${cfg.color}10`} style={{ color: cfg.color }}>
          {cfg.icon}
        </div>
        <span className="text-xs font-bold text-crm-text" style={{ color: 'var(--crm-text)' }}>{data.label}</span>
      </div>
      <div className="text-[10px] text-crm-muted uppercase tracking-wider">condition</div>
    </div>
  );
}

// ── Custom Node: AI Decision ───────────────────────────────────────

function AIDecisionNode({ data, selected }: { data: JourneyNodeData; selected: boolean }) {
  const cfg = NODE_CONFIG.ai_decision;
  return (
    <div className={`p-3 rounded-xl border min-w-[160px] ${selected ? 'ring-2 ring-crm-purple/50 shadow-lg' : 'border-crm-border/50'}`} style={{ background: selected ? 'rgba(139,92,246,0.10)' : 'var(--crm-card-bg)', borderColor: cfg.color }}>
      <div className="flex items-center gap-2 mb-2">
        <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${cfg.color}10`} style={{ color: cfg.color }}>
          {cfg.icon}
        </div>
        <span className="text-xs font-bold text-crm-text" style={{ color: 'var(--crm-text)' }}>{data.label}</span>
      </div>
      <div className="text-[10px] text-crm-muted uppercase tracking-wider">ai decision</div>
    </div>
  );
}

// ── Custom Node: Action ────────────────────────────────────────────

function ActionNode({ data, selected }: { data: JourneyNodeData; selected: boolean }) {
  const cfg = NODE_CONFIG.action;
  return (
    <div className={`p-3 rounded-xl border min-w-[160px] ${selected ? 'ring-2 ring-crm-success/50 shadow-lg' : 'border-crm-border/50'}`} style={{ background: selected ? 'rgba(40,201,154,0.10)' : 'var(--crm-card-bg)', borderColor: cfg.color }}>
      <div className="flex items-center gap-2 mb-2">
        <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${cfg.color}10`} style={{ color: cfg.color }}>
          {cfg.icon}
        </div>
        <span className="text-xs font-bold text-crm-text" style={{ color: 'var(--crm-text)' }}>{data.label}</span>
      </div>
      <div className="text-[10px] text-crm-muted uppercase tracking-wider">action</div>
    </div>
  );
}

// ── Custom Node: Wait ──────────────────────────────────────────────

function WaitNode({ data, selected }: { data: JourneyNodeData; selected: boolean }) {
  const cfg = NODE_CONFIG.wait;
  return (
    <div className={`p-3 rounded-xl border min-w-[160px] ${selected ? 'ring-2 ring-crm-danger/50 shadow-lg' : 'border-crm-border/50'}`} style={{ background: selected ? 'rgba(244,107,114,0.10)' : 'var(--crm-card-bg)', borderColor: cfg.color }}>
      <div className="flex items-center gap-2 mb-2">
        <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${cfg.color}10`} style={{ color: cfg.color }}>
          {cfg.icon}
        </div>
        <span className="text-xs font-bold text-crm-text" style={{ color: 'var(--crm-text)' }}>{data.label}</span>
      </div>
      <div className="text-[10px] text-crm-muted uppercase tracking-wider">wait</div>
    </div>
  );
}

// ── Custom Node: Stage ─────────────────────────────────────────────

function StageNode({ data, selected }: { data: JourneyNodeData; selected: boolean }) {
  const cfg = NODE_CONFIG.stage;
  return (
    <div className={`p-3 rounded-xl border min-w-[160px] ${selected ? 'ring-2 ring-crm-primary/50 shadow-lg' : 'border-crm-border/50'}`} style={{ background: selected ? 'rgba(6,182,212,0.10)' : 'var(--crm-card-bg)', borderColor: cfg.color }}>
      <div className="flex items-center gap-2 mb-2">
        <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${cfg.color}10`} style={{ color: cfg.color }}>
          {cfg.icon}
        </div>
        <span className="text-xs font-bold text-crm-text" style={{ color: 'var(--crm-text)' }}>{data.label}</span>
      </div>
      <div className="text-[10px] text-crm-muted uppercase tracking-wider">stage</div>
    </div>
  );
}

// ── Custom Node: End ───────────────────────────────────────────────

function EndNode({ data, selected }: { data: JourneyNodeData; selected: boolean }) {
  const cfg = NODE_CONFIG.end;
  return (
    <div className={`p-3 rounded-xl border min-w-[160px] ${selected ? 'ring-2 ring-crm-muted/50 shadow-lg' : 'border-crm-border/50'}`} style={{ background: selected ? 'rgba(135,144,170,0.10)' : 'var(--crm-card-bg)', borderColor: cfg.color }}>
      <div className="flex items-center gap-2 mb-2">
        <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${cfg.color}10`} style={{ color: cfg.color }}>
          {cfg.icon}
        </div>
        <span className="text-xs font-bold text-crm-text" style={{ color: 'var(--crm-text)' }}>{data.label}</span>
      </div>
      <div className="text-[10px] text-crm-muted uppercase tracking-wider">end</div>
    </div>
  );
}

const nodeTypes: Record<string, React.ComponentType<{ data: JourneyNodeData; selected: boolean }>> = {
  trigger: TriggerNode,
  condition: ConditionNode,
  ai_decision: AIDecisionNode,
  action: ActionNode,
  wait: WaitNode,
  stage: StageNode,
  end: EndNode,
};

// ── Journey Canvas ─────────────────────────────────────────────────

export default function JourneyCanvas({
  journeyId,
  nodes,
  edges,
  onSave,
  onPublish,
  status,
  isLoading,
}: JourneyCanvasProps) {
  const [flowNodes, setFlowNodes, onNodeChange] = useNodesState(
    nodes.map(n => ({
      id: n.id,
      type: n.type,
      position: { x: n.position.x, y: n.position.y },
      data: n.data as Record<string, unknown>,
    })) as Node[]
  );
  const [flowEdges, setFlowEdges, onEdgeChange] = useEdgesState(edges as Edge[]);
  const { setNodes, setEdges, getNodes, getEdges } = useReactFlow();
  const canvasRef = useRef<HTMLDivElement>(null);

  // Sync local nodes/edges with flow state when props change
  useEffect(() => {
    setNodes(
      nodes.map(n => ({
        id: n.id,
        type: n.type,
        position: { x: n.position.x, y: n.position.y },
        data: n.data as Record<string, unknown>,
      }))
    );
    setEdges(edges as Edge[]);
  }, [nodes, edges, setNodes, setEdges]);

  const onConnect = useCallback((params: Connection) => {
    const newEdges = addEdge({ ...params, type: 'smoothstep', animated: true }, flowEdges) as Edge[];
    const newEdge = newEdges[newEdges.length - 1];
    setFlowEdges(newEdges);
  }, [flowEdges, setFlowEdges]);

  const deleteSelected = useCallback(() => {
    const selected = getNodes().filter(n => n.selected);
    const selectedIds = new Set(selected.map(n => n.id));
    setFlowNodes((nds) => nds.filter(n => !selectedIds.has(n.id)));
    setFlowEdges((eds) => eds.filter(e => !selectedIds.has(e.source) || !selectedIds.has(e.target)));
  }, [getNodes, setFlowNodes, setFlowEdges]);

  const addNode = useCallback((type: CanvasNode['type']) => {
    const cfg = NODE_CONFIG[type];
    const existing = getNodes();
    const newNode: CanvasNode = {
      id: `${type}-${Date.now()}`,
      type,
      position: { x: 250 + existing.length * 180, y: 200 },
      data: { label: cfg ? 'Node' : type, config: {} },
    };
    setFlowNodes((nds) => [...nds, {
      id: newNode.id,
      type: newNode.type,
      position: newNode.position,
      data: newNode.data as Record<string, unknown>,
    }]);
  }, [getNodes, setFlowNodes]);

  const handleSave = useCallback(async () => {
    const ns = getNodes();
    const es = getEdges();
    const canvasNodes: CanvasNode[] = ns.map(n => ({
      id: n.id,
      type: n.type as CanvasNode['type'],
      position: { x: n.position.x, y: n.position.y },
      data: n.data as unknown as JourneyNodeData,
    }));
    const canvasEdges: CanvasEdge[] = es.map(e => ({
      id: e.id,
      source: e.source,
      target: e.target,
      label: (e as any).label as 'yes' | 'no' | undefined,
    }));
    await onSave(canvasNodes, canvasEdges);
  }, [getNodes, getEdges, onSave]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Delete' || e.key === 'Backspace') {
        deleteSelected();
      }
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault();
        void handleSave();
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [deleteSelected, handleSave]);

  return (
    <div className="flex flex-col h-full bg-crm-bg relative overflow-hidden">
      {/* Top toolbar */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-crm-border/30 bg-crm-card-bg/90 backdrop-blur z-10 flex-shrink-0">
        <div className="flex items-center gap-3">
          <span className="text-xs font-bold text-crm-muted uppercase tracking-wider">Journey Canvas</span>
          <span className="w-1 h-1 rounded-full bg-crm-success animate-pulse" />
          <span className="text-xs text-crm-text">{status === 'active' ? 'Published & Active' : status === 'paused' ? 'Paused' : 'Draft'}</span>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => addNode('trigger')}
            disabled={isLoading}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-crm-border bg-crm-card-bg text-xs font-medium text-crm-text hover:bg-crm-accent transition-colors disabled:opacity-50"
          >
            <Zap size={14} strokeWidth={2} /> Add Trigger
          </button>
          <button
            onClick={() => addNode('condition')}
            disabled={isLoading}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-crm-border bg-crm-card-bg text-xs font-medium text-crm-text hover:bg-crm-accent transition-colors disabled:opacity-50"
          >
            <GitBranch size={14} strokeWidth={2} /> Add Condition
          </button>
          <button
            onClick={() => addNode('action')}
            disabled={isLoading}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-crm-border bg-crm-card-bg text-xs font-medium text-crm-text hover:bg-crm-accent transition-colors disabled:opacity-50"
          >
            <CheckCircle size={14} strokeWidth={2} /> Add Action
          </button>
          <button
            onClick={handleSave}
            disabled={isLoading}
            className="flex items-center gap-2 px-3.5 py-1.5 rounded-lg border border-transparent bg-linear-gradient-to-r from-crm-primary to-crm-purple text-white text-xs font-medium shadow-lg hover:shadow-crm-primary/30 transition-all disabled:opacity-50"
          >
            <Save size={14} strokeWidth={2} /> Save Canvas
          </button>
          {status === 'draft' && (
            <button
              onClick={onPublish}
              disabled={isLoading}
              className="flex items-center gap-2 px-3.5 py-1.5 rounded-lg border border-transparent bg-crm-success text-white text-xs font-medium shadow-lg hover:shadow-crm-success/30 transition-all disabled:opacity-50"
            >
              <Play size={14} strokeWidth={2} /> Publish
            </button>
          )}
        </div>
      </div>

      {/* Canvas area */}
      <div className="flex-1 relative overflow-hidden bg-crm-bg">
        <ReactFlow
          ref={canvasRef}
          nodes={flowNodes}
          edges={flowEdges}
          onNodesChange={onNodeChange}
          onEdgesChange={onEdgeChange}
          onConnect={onConnect}
          nodeTypes={nodeTypes as any}
          panOnScroll
          minZoom={0.4}
          maxZoom={2}
          className="h-full w-full"
        >
          <Controls />
          <MiniMap position="bottom-right" className="z-10" />
          <Background variant={['dots'] as any} gap={16} size={3} offset={-1000} className="[mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,#000_70%,transparent_100%)]" />
        </ReactFlow>

        {/* Empty state overlay */}
        {flowNodes.length === 0 && (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-crm-muted pointer-events-none">
            <Zap size={48} className="mb-4 opacity-20" />
            <h3 className="text-sm font-medium text-crm-text">Empty canvas</h3>
            <p className="text-xs mt-1">Add a trigger node to start building your journey</p>
          </div>
        )}

        {/* Delete hint */}
        <div className="absolute bottom-4 left-4 z-20 bg-crm-card-bg/90 backdrop-blur border border-crm-border/30 rounded-lg px-3 py-1.5 shadow-lg">
          <kbd className="bg-crm-border px-1.5 py-0.5 rounded text-[10px] font-mono text-crm-muted">Delete</kbd>
          <span className="text-[10px] text-crm-muted ml-1">to remove selected node</span>
        </div>
      </div>
    </div>
  );
}
