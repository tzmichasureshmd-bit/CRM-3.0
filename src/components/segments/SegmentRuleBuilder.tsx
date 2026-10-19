/**
 * CRM 3.0 — Premium Segment Rule Builder
 * Glassmorphism visual condition builder with explicit text visibility.
 */

'use client';

import { useState, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, Trash2, GitBranch, ArrowRight, Zap, ShieldAlert } from 'lucide-react';

interface Condition {
  id: string;
  condition_group: number;
  field: string;
  operator: string;
  value: string;
  field_type: string;
}

interface RuleGroup {
  id: number;
  logic: 'AND' | 'OR';
  conditions: Condition[];
}

interface SegmentRuleBuilderProps {
  initialConditions?: Condition[];
  onChange: (conditions: Condition[]) => void;
}

const FIELD_DEFINITIONS: Record<string, {
  label: string;
  type: 'text' | 'number' | 'date' | 'boolean' | 'array';
  operators: string[];
  placeholder: string;
}> = {
  name:           { label: 'Name',           type: 'text',    operators: ['equals','does_not_equal','contains','does_not_contain','is_empty','is_not_empty'], placeholder: 'e.g. John' },
  email:          { label: 'Email',          type: 'text',    operators: ['equals','does_not_equal','contains','does_not_contain','is_empty','is_not_empty'], placeholder: 'e.g. john@example.com' },
  phone:          { label: 'Phone',          type: 'text',    operators: ['equals','does_not_equal','contains','does_not_contain','is_empty','is_not_empty'], placeholder: 'e.g. +1234567890' },
  company:        { label: 'Company',        type: 'text',    operators: ['equals','does_not_equal','contains','does_not_contain','is_empty','is_not_empty'], placeholder: 'e.g. Acme Corp' },
  source:         { label: 'Source',         type: 'text',    operators: ['equals','does_not_equal','contains','does_not_contain','is_empty','is_not_empty'], placeholder: 'e.g. website' },
  lead_status:    { label: 'Lead Status',    type: 'text',    operators: ['equals','does_not_equal','is_empty','is_not_empty'], placeholder: 'e.g. qualified' },
  lead_score:     { label: 'Lead Score',     type: 'number',  operators: ['equals','does_not_equal','gt','lt','is_empty','is_not_empty'], placeholder: '0-100' },
  lead_score_tier:{ label: 'Score Tier',     type: 'text',    operators: ['equals','does_not_equal','is_empty','is_not_empty'], placeholder: 'e.g. hot' },
  opt_out:        { label: 'Opt-out Status', type: 'boolean', operators: ['equals','is_empty','is_not_empty'], placeholder: 'true/false' },
  tags:           { label: 'Tags',           type: 'array',   operators: ['contains','does_not_contain','is_empty','is_not_empty'], placeholder: 'e.g. VIP' },
  created_at:     { label: 'Created Date',   type: 'date',    operators: ['before','after','within_last_n_days','is_empty','is_not_empty'], placeholder: 'YYYY-MM-DD' },
  updated_at:     { label: 'Updated Date',   type: 'date',    operators: ['before','after','within_last_n_days','is_empty','is_not_empty'], placeholder: 'YYYY-MM-DD' },
  last_customer_reply_at: { label: 'Last Reply', type: 'date', operators: ['before','after','within_last_n_days','is_empty','is_not_empty'], placeholder: 'YYYY-MM-DD' },
};

const OPERATOR_LABELS: Record<string, string> = {
  equals: 'Equals',
  does_not_equal: 'Does not equal',
  contains: 'Contains',
  does_not_contain: 'Does not contain',
  is_empty: 'Is empty',
  is_not_empty: 'Is not empty',
  gt: 'Greater than',
  lt: 'Less than',
  before: 'Before',
  after: 'After',
  within_last_n_days: 'Within the last N days',
};

export default function SegmentRuleBuilder({ initialConditions, onChange }: SegmentRuleBuilderProps) {
  const [groups, setGroups] = useState<RuleGroup[]>(() => {
    if (initialConditions && initialConditions.length > 0) {
      const byGroup = new Map<number, Condition[]>();
      for (const c of initialConditions) {
        if (!byGroup.has(c.condition_group)) byGroup.set(c.condition_group, []);
        byGroup.get(c.condition_group)!.push(c);
      }
      return Array.from(byGroup.entries()).map(([gid, conds]) => ({ id: gid, logic: 'AND', conditions: conds }));
    }
    return [{ id: 1, logic: 'AND', conditions: [] }];
  });

  useEffect(() => {
    onChange(groups.flatMap((g) => g.conditions));
  }, [groups, onChange]);

  const addGroup = useCallback(() => {
    const newId = groups.length > 0 ? Math.max(...groups.map(g => g.id)) + 1 : 1;
    setGroups((prev) => [...prev, { id: newId, logic: 'AND', conditions: [] }]);
  }, [groups.length]);

  const removeGroup = useCallback((groupId: number) => {
    setGroups((prev) => prev.filter((g) => g.id !== groupId));
  }, []);

  const setGroupLogic = useCallback((groupId: number, logic: 'AND' | 'OR') => {
    setGroups((prev) => prev.map((g) => g.id === groupId ? { ...g, logic } : g));
  }, []);

  const addCondition = useCallback((groupId: number) => {
    setGroups((prev) => prev.map((g) => {
      if (g.id !== groupId) return g;
      return {
        ...g,
        conditions: [...g.conditions, {
          id: crypto.randomUUID(),
          condition_group: groupId,
          field: 'lead_status',
          operator: 'equals',
          value: '',
          field_type: 'text',
        }],
      };
    }));
  }, []);

  const removeCondition = useCallback((groupId: number, conditionId: string) => {
    setGroups((prev) => prev.map((g) => {
      if (g.id !== groupId) return g;
      return { ...g, conditions: g.conditions.filter((c) => c.id !== conditionId) };
    }));
  }, []);

  const updateCondition = useCallback((groupId: number, conditionId: string, patch: Partial<Condition>) => {
    setGroups((prev) => prev.map((g) => {
      if (g.id !== groupId) return g;
      return {
        ...g,
        conditions: g.conditions.map((c) => c.id === conditionId ? { ...c, ...patch } : c),
      };
    }));
  }, []);

  const allConditions = groups.flatMap((g) => g.conditions);
  const hasConditions = allConditions.length > 0;

  return (
    <div className="relative rounded-[24px] p-6 border border-[#rgba(255,255,255,0.14)] bg-[#FFFFFF] dark:bg-[#11182B] shadow-2xl space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-bold text-[#F8FAFC] dark:text-[#F8FAFC]">Rule Builder</h3>
          <p className="text-[11px] text-[#64748B] dark:text-[#94A3B8]">Define who enters this segment</p>
        </div>
        <span className={`px-2.5 py-0.5 rounded-md text-[9px] font-bold border ${hasConditions ? 'border-[#22D3EE]/20 bg-[#22D3EE]/10 text-[#22D3EE]' : 'border-[#rgba(255,255,255,0.14)] bg-[#11182B] dark:bg-[#1E293B] text-[#64748B] dark:text-[#94A3B8]'}`}>
          {allConditions.length} condition{allConditions.length !== 1 ? 's' : ''}
        </span>
      </div>

      <div className="space-y-4">
        {groups.map((group) => (
          <motion.div
            key={group.id}
            whileHover={{ x: 4 }}
            className="rounded-[16px] p-4 border border-[#rgba(255,255,255,0.14)] bg-[#FFFFFF] dark:bg-[#11182B]"
          >
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <GitBranch size={13} strokeWidth={2} className="text-[#64748B] dark:text-[#94A3B8]" />
                <span className="text-[10px] font-bold text-[#64748B] dark:text-[#94A3B8] uppercase tracking-wider">
                  Condition Group {group.id}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <select
                  value={group.logic}
                  onChange={(e) => setGroupLogic(group.id, e.target.value as 'AND' | 'OR')}
                  className="px-2.5 py-1.5 rounded-lg border border-[#rgba(255,255,255,0.14)] bg-[#FFFFFF] dark:bg-[#11182B] text-[#F8FAFC] dark:text-[#F8FAFC] text-[10px] outline-none focus:ring-1 focus-[#3B82F6]/20 transition-colors"
                >
                  <option value="AND">All match (AND)</option>
                  <option value="OR">Any match (OR)</option>
                </select>
                {groups.length > 1 && (
                  <button
                    onClick={() => removeGroup(group.id)}
                    className="w-7 h-7 rounded-lg flex items-center justify-center text-[#FCA5A5] hover:bg-[#FEE2E2] transition-colors"
                    title="Remove group"
                  >
                    <Trash2 size={11} strokeWidth={2} />
                  </button>
                )}
              </div>
            </div>

            <div className="space-y-3">
              {group.conditions.length === 0 && (
                <div className="flex flex-col items-center justify-center py-5 text-[#64748B] dark:text-[#94A3B8]">
                  <ArrowRight size={16} className="mb-2 opacity-30" />
                  <p className="text-[11px]">No conditions yet</p>
                  <p className="text-[10px] opacity-60">Click "Add Condition" to start</p>
                </div>
              )}
              {group.conditions.map((cond) => (
                <div key={cond.id} className="flex items-end gap-2.5 bg-[#11182B] dark:bg-[#1E293B] rounded-lg p-2.5 border border-[#rgba(255,255,255,0.14)]">
                  <div className="flex-1 min-w-0">
                    <label className="block text-[9px] font-bold text-[#64748B] dark:text-[#94A3B8] uppercase tracking-wider mb-1">Field</label>
                    <select
                      value={cond.field}
                      onChange={(e) => {
                        const fd = FIELD_DEFINITIONS[e.target.value as keyof typeof FIELD_DEFINITIONS];
                        updateCondition(group.id, cond.id, {
                          field: e.target.value,
                          operator: fd?.operators[0] ?? 'equals',
                          value: '',
                          field_type: fd?.type ?? 'text',
                        });
                      }}
                      className="w-full px-3 py-2 rounded-lg border border-[#rgba(255,255,255,0.14)] bg-[#FFFFFF] dark:bg-[#11182B] text-[#F8FAFC] dark:text-[#F8FAFC] text-[11px] outline-none focus:ring-1 focus-[#3B82F6]/20 transition-colors"
                    >
                      {Object.entries(FIELD_DEFINITIONS).map(([key, def]) => (
                        <option key={key} value={key}>{def.label}</option>
                      ))}
                    </select>
                  </div>
                  <div className="flex-1 min-w-0">
                    <label className="block text-[9px] font-bold text-[#64748B] dark:text-[#94A3B8] uppercase tracking-wider mb-1">Operator</label>
                    <select
                      value={cond.operator}
                      onChange={(e) => updateCondition(group.id, cond.id, { operator: e.target.value })}
                      className="w-full px-3 py-2 rounded-lg border border-[#rgba(255,255,255,0.14)] bg-[#FFFFFF] dark:bg-[#11182B] text-[#F8FAFC] dark:text-[#F8FAFC] text-[11px] outline-none focus:ring-1 focus-[#3B82F6]/20 transition-colors"
                    >
                      {FIELD_DEFINITIONS[cond.field as keyof typeof FIELD_DEFINITIONS]?.operators.map((op) => (
                        <option key={op} value={op}>{OPERATOR_LABELS[op] ?? op}</option>
                      ))}
                    </select>
                  </div>
                  <div className="flex-1 min-w-0">
                    <label className="block text-[9px] font-bold text-[#64748B] dark:text-[#94A3B8] uppercase tracking-wider mb-1">Value</label>
                    <input
                      type={cond.field_type === 'date' ? 'date' : cond.field_type === 'number' ? 'number' : 'text'}
                      value={cond.value}
                      onChange={(e) => updateCondition(group.id, cond.id, { value: e.target.value })}
                      placeholder={FIELD_DEFINITIONS[cond.field as keyof typeof FIELD_DEFINITIONS]?.placeholder ?? 'Value'}
                      className="w-full px-3 py-2 rounded-lg border border-[#rgba(255,255,255,0.14)] bg-[#FFFFFF] dark:bg-[#11182B] text-[#F8FAFC] dark:text-[#F8FAFC] text-[11px] outline-none focus:ring-1 focus-[#3B82F6]/20 transition-colors"
                    />
                  </div>
                  <button
                    onClick={() => removeCondition(group.id, cond.id)}
                    className="w-7 h-7 rounded-lg flex items-center justify-center text-[#FCA5A5] hover:bg-[#FEE2E2] transition-colors"
                    title="Remove condition"
                  >
                    <Trash2 size={11} strokeWidth={2} />
                  </button>
                </div>
              ))}
            </div>

            <div className="mt-3 pt-3 border-t border-[#rgba(255,255,255,0.14)] flex items-center gap-2">
              <button
                onClick={() => addCondition(group.id)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[#rgba(255,255,255,0.14)] bg-[#11182B] dark:bg-[#1E293B] text-[10px] font-bold text-[#3B82F6] hover:bg-[#3B82F6]/10 transition-colors"
              >
                <Plus size={12} strokeWidth={2} /> Add Condition
              </button>
            </div>
          </motion.div>
        ))}
      </div>

      <div className="pt-4 border-t border-[#rgba(255,255,255,0.14)] flex items-center justify-between">
        <button
          onClick={addGroup}
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-[#rgba(255,255,255,0.14)] bg-[#11182B] dark:bg-[#1E293B] text-[11px] font-bold text-[#F8FAFC] dark:text-[#F8FAFC] hover:bg-[#1E293B] transition-colors"
        >
          <GitBranch size={13} strokeWidth={2} /> Add Condition Group
        </button>
        <span className="text-[10px] text-[#64748B] dark:text-[#94A3B8]">
          {groups.length > 1 ? 'Groups are evaluated with AND logic between them' : 'Single condition group'}
        </span>
      </div>

      {!hasConditions && (
        <div className="mt-4 p-4 rounded-xl border border-[#rgba(255,255,255,0.14)] bg-[#11182B] dark:bg-[#1E293B] flex items-center gap-3">
          <ShieldAlert size={16} strokeWidth={2} className="text-[#FBBF24]" />
          <div>
            <p className="text-[11px] font-bold text-[#F8FAFC] dark:text-[#F8FAFC]">Add at least one condition</p>
            <p className="text-[10px] text-[#64748B] dark:text-[#94A3B8]">A segment needs conditions to identify matching contacts</p>
          </div>
        </div>
      )}
    </div>
  );
}
