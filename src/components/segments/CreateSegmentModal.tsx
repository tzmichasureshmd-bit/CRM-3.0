/**
 * CRM 3.0 — Premium Create Segment Modal
 * Glassmorphism modal with rule builder and live audience preview.
 */

'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X, Plus, RefreshCw, Users, Zap, ShieldAlert, ArrowRight, Mail, Settings,
} from 'lucide-react';

import SegmentRuleBuilder from '@/components/segments/SegmentRuleBuilder';
import SegmentLivePreview from '@/components/segments/SegmentLivePreview';

interface CreateSegmentModalProps {
  open: boolean;
  onClose: () => void;
  onCreated: (data: { name: string; description: string | undefined; type: string; rules?: any[] }) => Promise<void>;
}

const TYPE_CONFIG: Record<string, {
  label: string;
  icon: React.ReactNode;
  gradient: string;
  textColor: string;
}> = {
  manual: {
    label: 'Static',
    icon: <Users size={13} strokeWidth={2} />,
    gradient: 'bg-gradient-to-tr from-[#7C3AED] to-[#3B82F6]',
    textColor: 'text-[#7C3AED]',
  },
  rule_based: {
    label: 'Dynamic',
    icon: <Zap size={13} strokeWidth={2} />,
    gradient: 'bg-gradient-to-tr from-[#22D3EE] to-[#3B82F6]',
    textColor: 'text-[#22D3EE]',
  },
  ai_assisted: {
    label: 'AI',
    icon: <Settings size={13} strokeWidth={2} />,
    gradient: 'bg-gradient-to-tr from-[#A78BFA] to-[#7C3AED]',
    textColor: 'text-[#A78BFA]',
  },
};

export default function CreateSegmentModal({
  open, onClose, onCreated,
}: CreateSegmentModalProps) {
  if (!open) return null;

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [type, setType] = useState<'manual' | 'rule_based' | 'ai_assisted'>('manual');
  const [rules, setRules] = useState<any[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState<'setup' | 'preview'>('setup');

  const submit = async () => {
    if (!name.trim()) { setError('Segment name is required'); return; }
    if (type === 'rule_based' && rules.length === 0) {
      setError('Dynamic segments require at least one condition');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const res = await fetch('/api/v3/segments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim() || undefined,
          type,
          rules: type === 'rule_based' ? rules : undefined,
        }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || 'Failed to create segment');
      }
      const d = await res.json();
      onCreated(d.segment);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create segment');
    } finally {
      setSaving(false);
    }
  };

  const TYPE_ENTRIES: Array<{ key: string; label: string; icon: React.ReactNode; gradient: string; textColor: string }> = [
    { key: 'manual', label: 'Static', icon: <Users size={13} strokeWidth={2} />, gradient: TYPE_CONFIG.manual.gradient, textColor: TYPE_CONFIG.manual.textColor },
    { key: 'rule_based', label: 'Dynamic', icon: <Zap size={13} strokeWidth={2} />, gradient: TYPE_CONFIG.rule_based.gradient, textColor: TYPE_CONFIG.rule_based.textColor },
    { key: 'ai_assisted', label: 'AI Assisted', icon: <Settings size={13} strokeWidth={2} />, gradient: TYPE_CONFIG.ai_assisted.gradient, textColor: TYPE_CONFIG.ai_assisted.textColor },
  ];

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center px-4"
        >
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 backdrop-blur-sm transition-opacity"
            onClick={onClose}
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="relative z-10 w-full max-w-3xl bg-[#FFFFFF] dark:bg-[#11182B] rounded-[32px] border border-[#rgba(255,255,255,0.14)] shadow-2xl flex flex-col overflow-hidden"
            style={{ maxHeight: '90vh' }}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-5 border-b border-[#rgba(255,255,255,0.14)] bg-[#FFFFFF] dark:bg-[#11182B] backdrop-blur z-10 flex-shrink-0">
              <div className="flex items-center gap-3">
                <div className={`w-11 h-11 rounded-2xl flex items-center justify-center shadow-lg ${TYPE_CONFIG[type].gradient}`} style={{ color: '#fff' }}>
                  {TYPE_CONFIG[type].icon}
                </div>
                <div>
                  <h2 className="text-xl font-bold text-[#F8FAFC] dark:text-[#F8FAFC] leading-tight">New Segment</h2>
                  <p className="text-[11px] text-[#64748B] dark:text-[#94A3B8]">Build your audience step by step</p>
                </div>
              </div>
              <button onClick={onClose} className="w-8 h-8 rounded-xl hover:bg-[#1E293B] flex items-center justify-center text-[#64748B] dark:text-[#94A3B8] transition-colors">
                <X size={18} strokeWidth={2} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {/* Step 1: Setup */}
              <AnimatePresence>
                {activeTab === 'setup' && (
                  <motion.div
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -20 }}
                    className="space-y-6"
                  >
                    <div>
                      <label className="block text-[10px] font-bold text-[#64748B] dark:text-[#94A3B8] uppercase tracking-wider mb-2">Segment Name</label>
                      <input
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="e.g. High-Intent Leads"
                        className="w-full px-4 py-3 rounded-xl border border-[#rgba(255,255,255,0.14)] bg-[#FFFFFF] dark:bg-[#11182B] text-[#F8FAFC] dark:text-[#F8FAFC] text-sm outline-none focus:ring-2 focus:ring-[#3B82F6]/20 transition-all placeholder-[#94A3B8] dark:placeholder-[#64748B]"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-[#64748B] dark:text-[#94A3B8] uppercase tracking-wider mb-2">Description</label>
                      <textarea
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        placeholder="Optional description…"
                        rows={2}
                        className="w-full px-4 py-3 rounded-xl border border-[#rgba(255,255,255,0.14)] bg-[#FFFFFF] dark:bg-[#11182B] text-[#F8FAFC] dark:text-[#F8FAFC] text-sm outline-none focus:ring-2 focus:ring-[#3B82F6]/20 transition-all resize-none placeholder-[#94A3B8] dark:placeholder-[#64748B]"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-[#64748B] dark:text-[#94A3B8] uppercase tracking-wider mb-2">Segment Type</label>
                      <div className="flex gap-2">
                        {TYPE_ENTRIES.map((t) => {
                          const active = type === t.key;
                          return (
                            <button
                              key={t.key}
                              onClick={() => setType(t.key as 'manual' | 'rule_based' | 'ai_assisted')}
                              className={`flex-1 flex items-center justify-center gap-2 px-3.5 py-2.5 rounded-xl border text-xs font-bold transition-colors ${
                                active
                                  ? `border-[#7C3AED]/20 bg-[#7C3AED]/10 ${TYPE_CONFIG[t.key].textColor}`
                                  : 'border-[#rgba(255,255,255,0.14)] bg-[#11182B] dark:bg-[#1E293B] text-[#64748B] dark:text-[#94A3B8] hover:border-[#3B82F6]/30'
                              }`}
                            >
                              {t.icon} {t.label}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                    {type === 'rule_based' && (
                      <SegmentRuleBuilder initialConditions={rules} onChange={setRules} />
                    )}
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Step 2: Preview */}
              <AnimatePresence>
                {activeTab === 'preview' && (
                  <motion.div
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 20 }}
                    className="space-y-6"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div>
                        <h3 className="text-sm font-bold text-[#F8FAFC] dark:text-[#F8FAFC]">Live Preview</h3>
                        <p className="text-[11px] text-[#64748B] dark:text-[#94A3B8]">See who matches your rules before saving</p>
                      </div>
                      <button
                        onClick={() => setActiveTab('setup')}
                        className="flex items-center gap-1.5 text-[11px] font-bold text-[#3B82F6] transition-colors"
                      >
                        <ArrowRight size={12} strokeWidth={2} className="-rotate-180" /> Edit Rules
                      </button>
                    </div>
                    <SegmentLivePreview
                      segmentId="preview"
                      rules={rules}
                      segmentType={type}
                    />
                  </motion.div>
                )}
              </AnimatePresence>

              {error && (
                <div className="px-4 py-3 rounded-lg border border-[#FCA5A5]/30 bg-[#FEE2E2] dark:bg-[#B91C1C]/10 flex items-center gap-3">
                  <ShieldAlert size={14} strokeWidth={2} className="text-[#FCA5A5]" />
                  <span className="text-[11px] text-[#FCA5A5] dark:text-[#FCA5A5] font-medium">{error}</span>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="border-t border-[#rgba(255,255,255,0.14)] bg-[#FFFFFF] dark:bg-[#11182B] backdrop-blur p-6 flex items-center justify-between gap-3 z-10">
              {activeTab === 'setup' ? (
                <>
                  <button
                    onClick={onClose}
                    className="flex-1 px-5 py-3 rounded-xl border border-[#rgba(255,255,255,0.14)] bg-[#11182B] dark:bg-[#1E293B] text-[#F8FAFC] dark:text-[#F8FAFC] text-sm font-medium hover:bg-[#1E293B] transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => setActiveTab('preview')}
                    disabled={!name.trim() || (type === 'rule_based' && rules.length === 0)}
                    className={`flex-1 px-5 py-3 rounded-xl border border-transparent bg-linear-gradient-to-r from-[#7C3AED] to-[#3B82F6] text-white text-sm font-bold shadow-lg hover:shadow-[#7C3AED]/30 transition-all disabled:opacity-50`}
                  >
                    <Zap size={14} strokeWidth={2} className="mr-2" /> Preview & Save
                  </button>
                </>
              ) : (
                <>
                  <button
                    onClick={() => setActiveTab('setup')}
                    className="flex-1 px-5 py-3 rounded-xl border border-[#rgba(255,255,255,0.14)] bg-[#11182B] dark:bg-[#1E293B] text-[#F8FAFC] dark:text-[#F8FAFC] text-sm font-medium hover:bg-[#1E293B] transition-colors"
                  >
                    Back to Rules
                  </button>
                  <button
                    onClick={() => void submit()}
                    disabled={saving || !name.trim()}
                    className={`flex-1 px-5 py-3 rounded-xl border border-transparent bg-linear-gradient-to-r from-[#3B82F6] to-[#34D399] text-white text-sm font-bold shadow-lg hover:shadow-[#3B82F6]/30 transition-all disabled:opacity-50`}
                  >
                    {saving ? <motion.div animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}><RefreshCw size={14} strokeWidth={2} className="mr-2 text-white" /></motion.div> : <Plus size={14} strokeWidth={2} className="mr-2" />} Create Segment
                  </button>
                </>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
