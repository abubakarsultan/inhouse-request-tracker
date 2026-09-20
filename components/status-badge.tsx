import { Badge } from '@/components/ui/badge';

// Section 6.9 — Live green, Request shared amber, Failed sync red.
const TONES: Record<string, 'blue' | 'green' | 'red' | 'amber' | 'slate'> = {
  'Request shared': 'amber',
  Live: 'green',
  'Failed sync': 'red',
};

export default function StatusBadge({ status }: { status: string }) {
  return <Badge tone={TONES[status] ?? 'slate'}>{status}</Badge>;
}
