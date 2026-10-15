"use client"

import Link from 'next/link'
import { UserPlus, Briefcase, Radio, Zap, MessageSquare, Bot } from 'lucide-react'
import type { ComponentType } from 'react'

import { useTranslations } from 'next-intl'

interface Action {
  labelKey: string
  descKey: string
  href: string
  icon: ComponentType<{ className?: string }>
  tint: string
  bg: string
}

const ACTIONS: Action[] = [
  { labelKey: 'newContact', descKey: 'newContactDesc', href: '/contacts', icon: UserPlus, tint: 'text-primary', bg: 'bg-primary/10' },
  { labelKey: 'newDeal', descKey: 'newDealDesc', href: '/pipelines', icon: Briefcase, tint: 'text-blue-500', bg: 'bg-blue-500/10' },
  { labelKey: 'newBroadcast', descKey: 'newBroadcastDesc', href: '/broadcasts/new', icon: Radio, tint: 'text-amber-500', bg: 'bg-amber-500/10' },
  { labelKey: 'newAutomation', descKey: 'newAutomationDesc', href: '/automations/new', icon: Zap, tint: 'text-violet-500', bg: 'bg-violet-500/10' },
  { labelKey: 'openInbox', descKey: 'openInboxDesc', href: '/inbox', icon: MessageSquare, tint: 'text-emerald-500', bg: 'bg-emerald-500/10' },
  { labelKey: 'buildBotFlow', descKey: 'buildBotFlowDesc', href: '/automations/bot-builder', icon: Bot, tint: 'text-rose-500', bg: 'bg-rose-500/10' },
]

export function QuickActions() {
  const t = useTranslations('Dashboard.quickActions')
  
  return (
    <div className="rounded-xl border border-border/60 bg-card p-5">
      <h2 className="mb-4 text-sm font-semibold text-foreground">{t('title')}</h2>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {ACTIONS.map((a) => {
          const Icon = a.icon
          return (
            <Link
              key={a.href}
              href={a.href}
              title={t(a.labelKey as string)}
              className="group flex flex-col items-center justify-center rounded-xl border border-transparent bg-muted/30 px-3 py-4 transition-all duration-200 hover:border-border hover:bg-muted/60 hover:shadow-sm"
            >
              <div className={`flex h-11 w-11 items-center justify-center rounded-xl ${a.bg} ${a.tint} transition-all duration-200 group-hover:scale-110 group-hover:shadow-sm`}>
                <Icon className="h-5 w-5" />
              </div>
            </Link>
          )
        })}
      </div>
    </div>
  )
}
