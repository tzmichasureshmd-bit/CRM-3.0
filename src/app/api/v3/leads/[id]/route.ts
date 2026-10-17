/**
 * CRM 3.0 — Lead Detail API Alias
 * GET    /api/v3/leads/[id] — alias to /api/v3/contacts/[id]
 * DELETE /api/v3/leads/[id] — alias to /api/v3/contacts/[id]
 */

export { GET, DELETE } from '../../contacts/[id]/route';
