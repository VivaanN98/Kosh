import { useEffect } from 'react';
import { useToast } from '@/components/ui/Toast';
import { useAddSheet } from '@/features/add/AddSheetContext';

export function AppEvents() {
  const toast = useToast();
  const add = useAddSheet();

  useEffect(() => {
    const onUpdate = () =>
      toast({
        message: 'A new version of Kosh is ready.',
        duration: 15_000,
        action: { label: 'Reload', onClick: () => void import('@/pwa').then((m) => m.reloadToUpdate()) },
      });
    window.addEventListener('kosh:update-ready', onUpdate);
    return () => window.removeEventListener('kosh:update-ready', onUpdate);
  }, [toast]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('add') === 'expense') {
      add.open({ mode: 'expense' });
      params.delete('add');
      const q = params.toString();
      window.history.replaceState(null, '', `${window.location.pathname}${q ? `?${q}` : ''}`);
    }
  }, [add]);

  return null;
}
