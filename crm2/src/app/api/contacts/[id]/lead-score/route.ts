import { NextResponse, type NextRequest } from 'next/server'
import { requireRole, toErrorResponse } from '@/lib/auth/account'
import { supabaseAdmin } from '@/lib/ai/admin-client'

/**
 * POST /api/contacts/[id]/lead-score  (agent+)
 *
 * Recomputes the lead score for the given contact using the
 * compute_lead_score() RPC (migration 068) and returns the result.
 *
 * Uses the service-role client so the SECURITY DEFINER function
 * runs with proper privileges. Returns { score, tier, reasons,
 * recommended_action, signals } on success.
 */
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireRole('agent')
    const { id: contactId } = await params

    if (!contactId) {
      return NextResponse.json({ error: 'contact id is required' }, { status: 400 })
    }

    const { data, error } = await supabaseAdmin().rpc('compute_lead_score', {
      p_contact_id: contactId,
    })

    if (error) {
      console.error('[lead-score] rpc error:', error)
      return NextResponse.json(
        { error: 'Failed to compute lead score', details: error.message },
        { status: 500 },
      )
    }

    return NextResponse.json({ lead_score: data })
  } catch (err) {
    return toErrorResponse(err)
  }
}

/**
 * GET /api/contacts/[id]/lead-score  (agent+)
 *
 * Reads the cached lead score from the contacts row (no recompute).
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { supabase, accountId } = await requireRole('agent')
    const { id: contactId } = await params

    const { data, error } = await supabase
      .from('contacts')
      .select('lead_score, lead_score_reason, lead_score_tier, lead_score_updated_at')
      .eq('id', contactId)
      .eq('account_id', accountId)
      .maybeSingle()

    if (error) {
      return NextResponse.json({ error: 'Failed to fetch lead score' }, { status: 500 })
    }
    if (!data) {
      return NextResponse.json({ error: 'Contact not found' }, { status: 404 })
    }

    return NextResponse.json({ lead_score: data })
  } catch (err) {
    return toErrorResponse(err)
  }
}
