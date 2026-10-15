'use client'

import { Card, CardContent } from '@/components/ui/card'
import {
  MessageSquare, Megaphone, Zap, Users, GitBranch, Phone, Layers, Ticket, Settings, BookOpen,
} from 'lucide-react'

const sections = [
  {
    icon: MessageSquare,
    title: 'Inbox & Conversations',
    items: [
      'Manage all WhatsApp conversations from one place.',
      'Messages sync in real-time via Meta Webhooks.',
      'Use quick replies and keyboard triggers to respond faster.',
      'Star important conversations for easy access.',
    ],
  },
  {
    icon: Users,
    title: 'Contacts',
    items: [
      'Contacts are created automatically when someone messages you.',
      'Add tags and custom fields to organize contacts.',
      'Filter contacts by tags for targeted campaigns.',
      'Import contacts via CSV from the API page.',
    ],
  },
  {
    icon: Megaphone,
    title: 'Campaigns',
    items: [
      'Create one-time or recurring broadcast campaigns.',
      'Filter recipients by tags or custom fields.',
      'Schedule campaigns to send at optimal times.',
      'Track delivery and read status per recipient.',
      'Duplicate existing campaigns from the list page.',
    ],
  },
  {
    icon: Layers,
    title: 'Message Templates',
    items: [
      'Templates are synced from the Meta Business API.',
      'Preview template variables before sending.',
      'Header images are uploaded to S3 and attached dynamically.',
      'Use preset campaign templates for one-click sends.',
    ],
  },
  {
    icon: Zap,
    title: 'Automations',
    items: [
      'Create visual automation flows with the flow builder.',
      'Set up AI follow-ups to engage contacts automatically.',
      'Configure quick replies for common questions.',
      'Use keyboard triggers to kick off flows.',
      'Schedule appointments and send reminders.',
    ],
  },
  {
    icon: Phone,
    title: 'Bulk AI Calls',
    items: [
      'Initiate AI-powered voice calls to contacts.',
      'Use prebuilt or custom call scripts.',
      'Track call status and duration.',
    ],
  },
  {
    icon: GitBranch,
    title: 'Pipelines & Deals',
    items: [
      'Visualize your sales process with deal pipelines.',
      'Drag and drop deals between stages.',
      'Deal status auto-syncs from the pipeline stage (Won/Lost/Open).',
      'Track deal value and close dates.',
    ],
  },
  {
    icon: Ticket,
    title: 'Tickets',
    items: [
      'Support tickets auto-create from customer messages (if enabled).',
      'Assign tickets to agents and track resolution.',
      'Categorize tickets as General, Billing, Technical, Feature Request, or Other.',
      'Each ticket gets a unique sequential number per account.',
    ],
  },
  {
    icon: BookOpen,
    title: 'Preset Campaigns',
    items: [
      'Save reusable campaign configurations as presets.',
      'Pre-configure template, audience filter, and variables.',
      'Launch a campaign from a preset in one click.',
      'Admins can create, edit, duplicate, and deactivate presets.',
    ],
  },
  {
    icon: Settings,
    title: 'Settings & Billing',
    items: [
      'Configure your WhatsApp Business API connection.',
      'Manage team members and their roles (Owner, Admin, Agent, Viewer).',
      'Track wallet balance and transaction history.',
      'Choose a plan and manage billing.',
      'Multi-account support with role-based access control.',
    ],
  },
]

export default function GuidePage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold">User Guide</h1>
        <p className="text-sm text-muted-foreground">
          How to use each feature of the TZmicha WhatsApp CRM.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {sections.map((s) => (
          <Card key={s.title}>
            <CardContent className="pt-4">
              <div className="flex items-center gap-2 mb-3">
                <s.icon className="h-4 w-4 text-primary" />
                <h2 className="text-sm font-semibold">{s.title}</h2>
              </div>
              <ul className="space-y-1.5">
                {s.items.map((item, i) => (
                  <li key={i} className="text-xs text-muted-foreground flex gap-2">
                    <span className="shrink-0 text-border mt-px">•</span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}
