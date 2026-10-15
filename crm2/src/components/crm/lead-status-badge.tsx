import { cn } from '@/lib/utils';
import {
  leadStatusBadgeClassName,
  leadStatusLabel,
} from '@/lib/crm/lead-status';

/**
 * The canonical CRM status pill (colour + label come from
 * `@/lib/crm/lead-status`, so every surface renders the same badge).
 * Renders an em dash for a contact with no status yet.
 */
export function LeadStatusBadge({
  status,
  className,
}: {
  status?: string | null;
  className?: string;
}) {
  if (!status) return <span className="text-muted-foreground">—</span>;
  return (
    <span className={cn(leadStatusBadgeClassName(status), className)}>
      {leadStatusLabel(status)}
    </span>
  );
}
