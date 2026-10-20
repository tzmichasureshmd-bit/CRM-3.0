/**
 * CRM 3.0 — Premium Segment Summary Cards
 * Glassmorphism analytics cards with explicit text colors for visibility.
 */

'use client';

import { motion } from 'framer-motion';
import { Target, Activity, Users, Zap } from 'lucide-react';

interface Segment {
  id: string;
  name: string;
  description: string | null;
  type: string;
  contact_count: number;
  last_computed_at: string | null;
  created_at: string;
}

interface SegmentSummaryProps {
  segments: Segment[];
}

export default function SegmentSummary({ segments }: SegmentSummaryProps) {
  const totalSegments = segments.length;
  const dynamicSegments = segments.filter((s) => s.type === 'rule_based').length;
  const staticSegments = segments.filter((s) => s.type === 'manual').length;
  const totalContacts = segments.reduce((acc, s) => acc + (s.contact_count || 0), 0);

  const stats = [
    {
      title: 'Total Segments',
      subtitle: 'All segment types',
      icon: <Target size={16} strokeWidth={2} />,
      iconBg: 'bg-[#7C3AED]/10',
      iconColor: 'text-[#7C3AED]',
      badge: 'crm-seg-badge-static',
      badgeText: 'All',
      value: totalSegments,
      valueColor: 'text-[#F8FAFC]',
      labelColor: 'text-[#A8B5CA]',
      subColor: 'text-[#64748B]',
    },
    {
      title: 'Dynamic Segments',
      subtitle: 'Rule-based audiences',
      icon: <Activity size={16} strokeWidth={2} />,
      iconBg: 'bg-[#22D3EE]/10',
      iconColor: 'text-[#22D3EE]',
      badge: 'crm-seg-badge-dynamic',
      badgeText: 'Dynamic',
      value: dynamicSegments,
      valueColor: 'text-[#F8FAFC]',
      labelColor: 'text-[#A8B5CA]',
      subColor: 'text-[#64748B]',
    },
    {
      title: 'Static Segments',
      subtitle: 'Manually managed',
      icon: <Users size={16} strokeWidth={2} />,
      iconBg: 'bg-[#7C3AED]/10',
      iconColor: 'text-[#7C3AED]',
      badge: 'crm-seg-badge-static',
      badgeText: 'Static',
      value: staticSegments,
      valueColor: 'text-[#F8FAFC]',
      labelColor: 'text-[#A8B5CA]',
      subColor: 'text-[#64748B]',
    },
    {
      title: 'Total Contacts',
      subtitle: 'Across all segments',
      icon: <Zap size={16} strokeWidth={2} />,
      iconBg: 'bg-[#3B82F6]/10',
      iconColor: 'text-[#3B82F6]',
      badge: 'crm-seg-badge-dynamic',
      badgeText: 'Contacts',
      value: totalContacts,
      valueColor: 'text-[#F8FAFC]',
      labelColor: 'text-[#A8B5CA]',
      subColor: 'text-[#64748B]',
    },
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
      {stats.map((card, idx) => (
        <motion.div
          key={card.title}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: idx * 0.06, duration: 0.5 }}
          className="relative overflow-hidden rounded-[20px] p-5 border border-[#rgba(255,255,255,0.14)] bg-[#FFFFFF] dark:bg-[#11182B] shadow-sm"
        >
          <div className="absolute inset-0 opacity-0 transition-opacity duration-300 bg-gradient-to-tr from-[#7C3AED]/10 to-[#3B82F6]/10" />
          <div className="relative z-10">
            <div className="flex items-center justify-between mb-3">
              <div className={`w-11 h-11 rounded-xl flex items-center justify-center shadow-lg ${card.iconBg}`} style={{ color: card.iconColor === 'text-[#7C3AED]' ? '#7C3AED' : card.iconColor === 'text-[#22D3EE]' ? '#22D3EE' : card.iconColor === 'text-[#3B82F6]' ? '#3B82F6' : '#7C3AED' }}>
                {card.icon}
              </div>
              <span className={`px-2 py-1 rounded-md text-[9px] font-bold border ${card.badge} text-[#F8FAFC]`}>
                {card.badgeText}
              </span>
            </div>
            <div className={`${card.valueColor} font-bold text-2xl font-variant-numeric`}>{card.value}</div>
            <div className="text-[10px] font-bold text-[#64748B] dark:text-[#94A3B8] mt-0.5 uppercase tracking-wider">{card.subtitle}</div>
          </div>
        </motion.div>
      ))}
    </div>
  );
}
