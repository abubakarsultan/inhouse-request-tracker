import { Badge } from '@/components/ui/badge';

const TONES: Record<string, 'blue' | 'green' | 'red' | 'slate'> = {
  'Request Shared': 'blue',
  Live: 'green',
  Removed: 'red',
};

export default function StatusBadge({ status }: { status: string }) {
  return <Badge tone={TONES[status] ?? 'slate'}>{status}</Badge>;
}
