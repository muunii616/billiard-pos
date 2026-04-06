import { Head } from '@inertiajs/react';
import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import AppLayout from '@/layouts/app-layout';
import type { BreadcrumbItem } from '@/types';

type CashSessionInfo = {
  id: number;
  status: 'open' | 'closed';
  opening_cash: number;
  opened_at: string | null;
  closed_at: string | null;
  counted_cash: number | null;
  expected_cash: number;
  variance: number | null;
  variance_reason: string | null;
  receipts_count: number;
  total_sales: number;
  cash_sales: number;
  card_sales: number;
  transfer_sales: number;
  opened_by: string | null;
  closed_by: string | null;
};

const breadcrumbs: BreadcrumbItem[] = [
  { title: 'Register', href: '/cash-register' },
];

function adminJsonHeaders(): Record<string, string> {
  const csrfToken = document.cookie.split('; ').find((r) => r.startsWith('XSRF-TOKEN='))?.split('=')[1];
  const headers: Record<string, string> = {
    'X-Requested-With': 'XMLHttpRequest',
    Accept: 'application/json',
    'Content-Type': 'application/json',
  };
  if (csrfToken) headers['X-XSRF-TOKEN'] = decodeURIComponent(csrfToken);
  return headers;
}

export default function RegisterPage() {
  const money = (value: number) => `$${(Number(value) || 0).toFixed(2)}`;
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [openSession, setOpenSession] = useState<CashSessionInfo | null>(null);
  const [latestClosedSession, setLatestClosedSession] = useState<CashSessionInfo | null>(null);
  const [openingCash, setOpeningCash] = useState('');
  const [countedCash, setCountedCash] = useState('');
  const [varianceReason, setVarianceReason] = useState('');

  const closeVariancePreview = useMemo(() => {
    if (!openSession) return 0;
    return Math.round(((Number(countedCash) || 0) - Number(openSession.expected_cash || 0)) * 100) / 100;
  }, [countedCash, openSession]);

  const loadCurrent = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/admin/cash/current', { headers: { Accept: 'application/json' } });
      if (!res.ok) throw new Error('Failed to load register shift.');
      const data = await res.json();
      const open = (data.open_session ?? null) as CashSessionInfo | null;
      const closed = (data.latest_closed_session ?? null) as CashSessionInfo | null;
      setOpenSession(open);
      setLatestClosedSession(closed);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load register shift.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCurrent();
  }, []);

  const handleOpenShift = async () => {
    setActionLoading(true);
    setError(null);
    try {
      const res = await fetch('/admin/cash/open', {
        method: 'POST',
        headers: adminJsonHeaders(),
        credentials: 'same-origin',
        body: JSON.stringify({ opening_cash: Number(openingCash) || 0 }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || 'Failed to open shift.');
      setOpeningCash('');
      await loadCurrent();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to open shift.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleCloseShift = async () => {
    if (!openSession) return;
    const variance = closeVariancePreview;
    if (Math.abs(variance) > 0.0001 && varianceReason.trim() === '') {
      setError('Reason is required when variance is not zero.');
      return;
    }

    setActionLoading(true);
    setError(null);
    try {
      const res = await fetch('/admin/cash/close', {
        method: 'POST',
        headers: adminJsonHeaders(),
        credentials: 'same-origin',
        body: JSON.stringify({
          counted_cash: Number(countedCash) || 0,
          variance_reason: varianceReason.trim() || null,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || 'Failed to close shift.');
      const receiptUrl = typeof data.receipt_url === 'string' ? data.receipt_url : null;
      setCountedCash('');
      setVarianceReason('');
      if (receiptUrl) {
        window.open(receiptUrl, '_blank', 'noopener,noreferrer');
      }
      await loadCurrent();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to close shift.');
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <AppLayout breadcrumbs={breadcrumbs}>
      <Head title="Register" />
      <div className="flex flex-1 flex-col gap-4 rounded-xl p-4">
        <Card className="border-sidebar-border/70 bg-background py-4 dark:border-sidebar-border">
          <CardHeader className="px-4 pb-2">
            <CardTitle className="text-sm font-semibold">Register Shift</CardTitle>
          </CardHeader>
          <CardContent className="px-4 space-y-4">
            {loading && <p className="text-sm text-muted-foreground">Loading…</p>}
            {!loading && !openSession && (
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  No open shift. Count cash in register and open shift.
                </p>
                <div className="space-y-2 max-w-xs">
                  <Label htmlFor="opening-cash">Opening cash</Label>
                  <Input
                    id="opening-cash"
                    type="number"
                    min={0}
                    step="0.01"
                    value={openingCash}
                    onChange={(e) => setOpeningCash(e.target.value)}
                    placeholder="0.00"
                  />
                </div>
                <Button onClick={handleOpenShift} disabled={actionLoading}>
                  {actionLoading ? 'Opening…' : 'Open Shift'}
                </Button>
              </div>
            )}

            {!loading && openSession && (
              <div className="space-y-4">
                <div className="grid gap-1 text-sm sm:grid-cols-2 lg:grid-cols-4">
                  <div><span className="text-muted-foreground">Status:</span> Open</div>
                  <div><span className="text-muted-foreground">Opened:</span> {openSession.opened_at ? new Date(openSession.opened_at).toLocaleString() : '—'}</div>
                  <div><span className="text-muted-foreground">Opening cash:</span> {money(openSession.opening_cash)}</div>
                  <div><span className="text-muted-foreground">Expected cash:</span> {money(openSession.expected_cash)}</div>
                  <div><span className="text-muted-foreground">Receipts:</span> {openSession.receipts_count}</div>
                  <div><span className="text-muted-foreground">Sales:</span> {money(openSession.total_sales)}</div>
                  <div><span className="text-muted-foreground">Card:</span> {money(openSession.card_sales)}</div>
                  <div><span className="text-muted-foreground">Transfer:</span> {money(openSession.transfer_sales)}</div>
                </div>

                <div className="space-y-2 max-w-xs">
                  <Label htmlFor="counted-cash">Counted cash</Label>
                  <Input
                    id="counted-cash"
                    type="number"
                    min={0}
                    step="0.01"
                    value={countedCash}
                    onChange={(e) => setCountedCash(e.target.value)}
                    placeholder="0.00"
                  />
                </div>

                <div className="text-sm">
                  <span className="text-muted-foreground">Variance preview: </span>
                  <span className={Math.abs(closeVariancePreview) > 0.0001 ? 'text-amber-600 dark:text-amber-400' : ''}>
                    {money(closeVariancePreview)}
                  </span>
                </div>

                <div className="space-y-2 max-w-lg">
                  <Label htmlFor="variance-reason">
                    Reason {Math.abs(closeVariancePreview) > 0.0001 ? '(required)' : '(optional)'}
                  </Label>
                  <Input
                    id="variance-reason"
                    value={varianceReason}
                    onChange={(e) => setVarianceReason(e.target.value)}
                    placeholder="Explain difference when variance is not zero"
                  />
                </div>

                <Button variant="destructive" onClick={handleCloseShift} disabled={actionLoading}>
                  {actionLoading ? 'Closing…' : 'Close Shift'}
                </Button>
              </div>
            )}

            {error && <p className="text-sm text-destructive">{error}</p>}
          </CardContent>
        </Card>

        {latestClosedSession && (
          <Card className="border-sidebar-border/70 bg-background py-4 dark:border-sidebar-border">
            <CardHeader className="px-4 pb-2">
              <CardTitle className="text-sm font-semibold">Latest Closed Shift Report</CardTitle>
            </CardHeader>
            <CardContent className="px-4">
              <div className="grid gap-1 text-sm sm:grid-cols-2 lg:grid-cols-4">
                <div><span className="text-muted-foreground">Opened:</span> {latestClosedSession.opened_at ? new Date(latestClosedSession.opened_at).toLocaleString() : '—'}</div>
                <div><span className="text-muted-foreground">Closed:</span> {latestClosedSession.closed_at ? new Date(latestClosedSession.closed_at).toLocaleString() : '—'}</div>
                <div><span className="text-muted-foreground">Opening cash:</span> {money(latestClosedSession.opening_cash)}</div>
                <div><span className="text-muted-foreground">Receipts:</span> {latestClosedSession.receipts_count}</div>
                <div><span className="text-muted-foreground">Total sales:</span> {money(latestClosedSession.total_sales)}</div>
                <div><span className="text-muted-foreground">Card:</span> {money(latestClosedSession.card_sales)}</div>
                <div><span className="text-muted-foreground">Transfer:</span> {money(latestClosedSession.transfer_sales)}</div>
                <div><span className="text-muted-foreground">Cash sales:</span> {money(latestClosedSession.cash_sales)}</div>
                <div><span className="text-muted-foreground">Expected cash:</span> {money(latestClosedSession.expected_cash)}</div>
                <div><span className="text-muted-foreground">Counted cash:</span> {money(latestClosedSession.counted_cash ?? 0)}</div>
                <div><span className="text-muted-foreground">Variance:</span> {money(latestClosedSession.variance ?? 0)}</div>
              </div>
              {latestClosedSession.variance_reason && (
                <p className="mt-3 text-sm">
                  <span className="text-muted-foreground">Reason:</span> {latestClosedSession.variance_reason}
                </p>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </AppLayout>
  );
}

