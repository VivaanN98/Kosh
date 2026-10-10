import { Link } from 'react-router';
import { Compass } from 'lucide-react';
import { EmptyState, Page } from '@/components/ui/bits';

export default function NotFound() {
  return (
    <Page>
      <EmptyState
        icon={<Compass size={24} />}
        title="Nothing here"
        body="That page doesn't exist."
        action={
          <Link to="/" className="tap inline-flex items-center rounded-[13px] bg-surface-2 px-4 font-medium">
            Go home
          </Link>
        }
      />
    </Page>
  );
}
