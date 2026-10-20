'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { ChevronLeft, RefreshCw, CheckCircle2, XCircle, AlertCircle, Clock } from 'lucide-react';
import Link from 'next/link';

interface HealthCheck {
  id: string;
  label: string;
  description: string;
  status: 'ok' | 'error' | 'warning' | 'checking';
  detail: string;
  latency?: number;
}

const MIGRATIONS = [
  '000_crm3_standalone_base',
  '001_crm3_foundation',
  '002_conversation_ai_columns',
  '003_smart_automation_ai',
  '004_ai_agents_full',
  '005_attribution_enhancements',
  '006_journey_builder',
  '007_journey_scheduler',
  '008_auth_trigger',
  '009_fix_profiles_rls',
  '010_broadcasts_appointments',
  '011_missing_tables',
  '012_updated_at_triggers',
];

function StatusIcon({ status }: { status: HealthCheck['status'] }) {
  if (status === 'checking') return <RefreshCw size={16} style={{ animation: 'spin 1s linear infinite', color: '#4f6df5' }} />;
  if (status === 'ok') return <CheckCircle2 size={16} color="#28c99a" />;
  if (status === 'warning') return <AlertCircle size={16} color="#f4c95d" />;
  return <XCircle size={16} color="#f46b72" />;
}

function StatusBadge({ status }: { status: HealthCheck['status'] }) {
  const meta = {
    ok:       { color: '#28c99a', label: 'OK' },
    error:    { color: '#f46b72', label: 'Error' },
    warning:  { color: '#f4c95d', label: 'Warning' },
    checking: { color: '#4f6df5', label: 'Checking...' },
  }[status];
  return (
    <span style={{ fontSize: 11, fontWeight: 700, color: meta.color, background: `${meta.color}15`, borderRadius: 8, padding: '3px 8px' }}>
      {meta.label}
    </span>
  );
}

export default function HealthPage() {
  const [checks, setChecks] = useState<HealthCheck[]>([]);
  const [migrationStatus, setMigrationStatus] = useState<Record<string, boolean>>({});
  const [loadingMigrations, setLoadingMigrations] = useState(true);
  const [lastChecked, setLastChecked] = useState<Date | null>(null);
  const supabase = createClient();

  const runChecks = useCallback(async () => {
    // Init all as checking
    setChecks([
      { id: 'supabase', label: 'Supabase Database', description: 'PostgreSQL connection via Supabase', status: 'checking', detail: 'Connecting...' },
      { id: 'auth', label: 'Supabase Auth', description: 'User authentication service', status: 'checking', detail: 'Checking...' },
      { id: 'openai', label: 'OpenAI API', description: 'AI features — lead scoring, content, reply assist', status: 'checking', detail: 'Checking...' },
      { id: 'realtime', label: 'Supabase Realtime', description: 'Live updates for inbox and dashboard', status: 'checking', detail: 'Checking...' },
      { id: 'env_supabase', label: 'Supabase Env Vars', description: 'NEXT_PUBLIC_SUPABASE_URL + ANON_KEY', status: 'checking', detail: 'Checking...' },
      { id: 'env_openai', label: 'OpenAI Env Var', description: 'OPENAI_API_KEY configured', status: 'checking', detail: 'Checking...' },
    ]);

    const results: HealthCheck[] = [];

    // 1. Supabase DB
    try {
      const t0 = Date.now();
      const { error } = await supabase.from('accounts').select('id').limit(1);
      const latency = Date.now() - t0;
      results.push({
        id: 'supabase', label: 'Supabase Database', description: 'PostgreSQL connection via Supabase',
        status: error ? 'error' : 'ok',
        detail: error ? error.message : `Connected · ${latency}ms`,
        latency,
      });
    } catch (e) {
      results.push({ id: 'supabase', label: 'Supabase Database', description: 'PostgreSQL connection via Supabase', status: 'error', detail: e instanceof Error ? e.message : 'Connection failed' });
    }

    // 2. Auth
    try {
      const t0 = Date.now();
      const { data: { user }, error } = await supabase.auth.getUser();
      const latency = Date.now() - t0;
      results.push({
        id: 'auth', label: 'Supabase Auth', description: 'User authentication service',
        status: error ? 'warning' : 'ok',
        detail: error ? 'Not authenticated' : `Authenticated as ${user?.email ?? 'unknown'} · ${latency}ms`,
        latency,
      });
    } catch {
      results.push({ id: 'auth', label: 'Supabase Auth', description: 'User authentication service', status: 'error', detail: 'Auth service unreachable' });
    }

    // 3. OpenAI
    try {
      const t0 = Date.now();
      const res = await fetch('/api/v3/ai/recommendations');
      const latency = Date.now() - t0;
      results.push({
        id: 'openai', label: 'OpenAI API', description: 'AI features — lead scoring, content, reply assist',
        status: res.status === 401 ? 'warning' : res.ok ? 'ok' : 'error',
        detail: res.status === 401 ? 'Not authenticated (expected in health check)' : res.ok ? `API route reachable · ${latency}ms` : `HTTP ${res.status}`,
        latency,
      });
    } catch {
      results.push({ id: 'openai', label: 'OpenAI API', description: 'AI features', status: 'error', detail: 'AI route unreachable' });
    }

    // 4. Realtime
    try {
      const channel = supabase.channel('health-check');
      const connected = await new Promise<boolean>(resolve => {
        const timeout = setTimeout(() => resolve(false), 3000);
        channel.subscribe(status => {
          if (status === 'SUBSCRIBED') { clearTimeout(timeout); resolve(true); }
        });
      });
      await supabase.removeChannel(channel);
      results.push({
        id: 'realtime', label: 'Supabase Realtime', description: 'Live updates for inbox and dashboard',
        status: connected ? 'ok' : 'warning',
        detail: connected ? 'Realtime connected' : 'Realtime connection timed out',
      });
    } catch {
      results.push({ id: 'realtime', label: 'Supabase Realtime', description: 'Live updates', status: 'error', detail: 'Realtime unavailable' });
    }

    // 5. Env: Supabase
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';
    const supabaseOk = supabaseUrl.includes('supabase.co') && supabaseKey.length > 20;
    results.push({
      id: 'env_supabase', label: 'Supabase Env Vars', description: 'NEXT_PUBLIC_SUPABASE_URL + ANON_KEY',
      status: supabaseOk ? 'ok' : 'error',
      detail: supabaseOk ? `URL: ${supabaseUrl.slice(0, 40)}...` : 'Missing or invalid Supabase env vars',
    });

    // 6. Env: OpenAI (can only check if NEXT_PUBLIC_ — server key is hidden)
    results.push({
      id: 'env_openai', label: 'OpenAI Env Var', description: 'OPENAI_API_KEY configured',
      status: 'warning',
      detail: 'OPENAI_API_KEY is server-side only — cannot verify from browser. Check .env.local manually.',
    });

    setChecks(results);
    setLastChecked(new Date());

    // Migration checks
    setLoadingMigrations(true);
    const migStatus: Record<string, boolean> = {};
    const tablesToCheck: Record<string, string> = {
      '000_crm3_standalone_base': 'contacts',
      '001_crm3_foundation': 'crm3_content',
      '002_conversation_ai_columns': 'conversations',
      '003_smart_automation_ai': 'crm3_automation_executions',
      '004_ai_agents_full': 'crm3_agent_execution_steps',
      '005_attribution_enhancements': 'crm3_attribution',
      '006_journey_builder': 'crm3_journeys',
      '007_journey_scheduler': 'crm3_journeys',
      '008_auth_trigger': 'profiles',
      '009_fix_profiles_rls': 'profiles',
      '010_broadcasts_appointments': 'broadcasts',
      '011_missing_tables': 'knowledge_documents',
      '012_updated_at_triggers': 'accounts',
    };

    for (const [migration, table] of Object.entries(tablesToCheck)) {
      try {
        const { error } = await supabase.from(table).select('id').limit(1);
        migStatus[migration] = !error;
      } catch {
        migStatus[migration] = false;
      }
    }
    setMigrationStatus(migStatus);
    setLoadingMigrations(false);
  }, [supabase]);

  useEffect(() => { void runChecks(); }, [runChecks]);

  const okCount = checks.filter(c => c.status === 'ok').length;
  const errorCount = checks.filter(c => c.status === 'error').length;
  const migrationsApplied = Object.values(migrationStatus).filter(Boolean).length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20, maxWidth: 760 }}>
      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>

      <Link href="/settings" style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 13, color: 'var(--crm-text-muted)', textDecoration: 'none', fontWeight: 500, width: 'fit-content' }}>
        <ChevronLeft size={16} /> Settings
      </Link>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 750, color: 'var(--crm-text)', margin: 0 }}>Platform Health</h1>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--crm-text-secondary)' }}>
            System status, connections, and migration checks
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {lastChecked && (
            <span style={{ fontSize: 11, color: 'var(--crm-text-muted)', display: 'flex', alignItems: 'center', gap: 4 }}>
              <Clock size={11} /> {lastChecked.toLocaleTimeString()}
            </span>
          )}
          <button onClick={() => void runChecks()}
            style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '7px 13px', borderRadius: 9, border: '1px solid rgba(130,145,190,0.20)', background: 'rgba(255,255,255,0.50)', fontSize: 12, cursor: 'pointer', color: 'var(--crm-text-muted)' }}>
            <RefreshCw size={12} /> Re-run
          </button>
        </div>
      </div>

      {/* Summary */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10 }}>
        {[
          { label: 'Services OK', value: `${okCount}/${checks.length}`, color: '#28c99a' },
          { label: 'Errors', value: String(errorCount), color: errorCount > 0 ? '#f46b72' : '#28c99a' },
          { label: 'Migrations', value: `${migrationsApplied}/${MIGRATIONS.length}`, color: migrationsApplied === MIGRATIONS.length ? '#28c99a' : '#f4c95d' },
        ].map(s => (
          <div key={s.label} className="crm-glass-soft" style={{ padding: '14px 16px', borderRadius: 12, textAlign: 'center' }}>
            <div style={{ fontSize: 24, fontWeight: 750, color: s.color }}>{s.value}</div>
            <div style={{ fontSize: 11, color: 'var(--crm-text-muted)', marginTop: 4 }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Service Checks */}
      <div>
        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--crm-text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>Service Checks</div>
        <div className="crm-glass" style={{ borderRadius: 14, overflow: 'hidden' }}>
          {checks.map((check, i) => (
            <div key={check.id} style={{ padding: '14px 20px', display: 'flex', alignItems: 'center', gap: 14, borderBottom: i < checks.length - 1 ? '1px solid rgba(130,145,190,0.08)' : 'none' }}>
              <StatusIcon status={check.status} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--crm-text)' }}>{check.label}</div>
                <div style={{ fontSize: 11, color: 'var(--crm-text-muted)', marginTop: 2 }}>{check.detail}</div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                {check.latency !== undefined && (
                  <span style={{ fontSize: 11, color: 'var(--crm-text-muted)' }}>{check.latency}ms</span>
                )}
                <StatusBadge status={check.status} />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Migration Status */}
      <div>
        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--crm-text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>
          Database Migrations ({migrationsApplied}/{MIGRATIONS.length} applied)
        </div>
        {migrationsApplied < MIGRATIONS.length && (
          <div style={{ marginBottom: 10, padding: '10px 14px', borderRadius: 10, background: 'rgba(244,201,93,0.10)', border: '1px solid rgba(244,201,93,0.25)', fontSize: 12, color: '#d97706' }}>
            <AlertCircle size={13} style={{ display: 'inline', marginRight: 5 }} />
            {MIGRATIONS.length - migrationsApplied} migration(s) not yet applied. Go to Supabase SQL Editor and run the missing files from <code style={{ background: 'rgba(0,0,0,0.06)', padding: '1px 4px', borderRadius: 4 }}>supabase/migrations/</code>
          </div>
        )}
        <div className="crm-glass" style={{ borderRadius: 14, overflow: 'hidden' }}>
          {loadingMigrations ? (
            <div style={{ padding: '20px', textAlign: 'center', color: 'var(--crm-text-muted)', fontSize: 13 }}>Checking migrations...</div>
          ) : MIGRATIONS.map((m, i) => {
            const applied = migrationStatus[m] ?? false;
            return (
              <div key={m} style={{ padding: '12px 20px', display: 'flex', alignItems: 'center', gap: 12, borderBottom: i < MIGRATIONS.length - 1 ? '1px solid rgba(130,145,190,0.08)' : 'none' }}>
                {applied ? <CheckCircle2 size={15} color="#28c99a" /> : <XCircle size={15} color="#f46b72" />}
                <code style={{ flex: 1, fontSize: 12, color: 'var(--crm-text)', fontFamily: 'monospace' }}>{m}.sql</code>
                <span style={{ fontSize: 11, fontWeight: 700, color: applied ? '#28c99a' : '#f46b72', background: applied ? 'rgba(40,201,154,0.12)' : 'rgba(244,107,114,0.12)', borderRadius: 7, padding: '2px 8px' }}>
                  {applied ? 'Applied' : 'Pending'}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
