'use client';
import React from 'react';

type GlassVariant = 'default' | 'soft' | 'strong' | 'ai';

interface GlassPanelProps {
  children: React.ReactNode;
  variant?: GlassVariant;
  className?: string;
  style?: React.CSSProperties;
}

const variantClass: Record<GlassVariant, string> = {
  default: 'crm-glass',
  soft: 'crm-glass-soft',
  strong: 'crm-glass-strong',
  ai: 'crm-glass-ai',
};

export function GlassPanel({ children, variant = 'default', className = '', style }: GlassPanelProps) {
  return (
    <div className={`${variantClass[variant]} ${className}`} style={style}>
      {children}
    </div>
  );
}
