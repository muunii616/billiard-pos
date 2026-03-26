import { Head, router, useForm } from '@inertiajs/react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import AppLayout from '@/layouts/app-layout';
import type { BreadcrumbItem } from '@/types';

type Table = {
  id: number;
  name: string;
  status: string;
};

type Props = {
  tables: Table[];
};

const breadcrumbs: BreadcrumbItem[] = [
  {
    title: 'Admin',
    href: '/admin/tables',
  },
  {
    title: 'Tables',
    href: '/admin/tables',
  },
];

export default function AdminTables({ tables }: Props) {
  const { data, setData, post, reset } = useForm({
    name: '',
  });

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    post('/admin/tables', {
      onSuccess: () => reset(),
    });
  };

  const handleRename = (table: Table) => {
    const name = window.prompt('New table name', table.name);

    if (!name) {
return;
}

    router.put(`/admin/tables/${table.id}`, { name });
  };

  const handleStatus = (table: Table) => {
    const status = window.prompt('Status (available/maintenance)', table.status);

    if (!status) {
return;
}

    if (!['available', 'maintenance'].includes(status)) {
      alert('Only "available" or "maintenance" are allowed here.');

      return;
    }

    router.put(`/admin/tables/${table.id}`, { status });
  };

  const handleDelete = (table: Table) => {
    if (!window.confirm(`Delete table "${table.name}"?`)) {
return;
}

    router.delete(`/admin/tables/${table.id}`);
  };

  const statusColor = (status: string) => {
    switch (status) {
      case 'running':
        return 'bg-emerald-500';
      case 'paused':
        return 'bg-amber-500';
      case 'maintenance':
        return 'bg-rose-500';
      default:
        return 'bg-slate-500';
    }
  };

  return (
    <AppLayout breadcrumbs={breadcrumbs}>
      <Head title="Tables" />
      <div className="flex flex-1 flex-col gap-4 rounded-xl p-4">
        <form onSubmit={handleCreate} className="flex flex-wrap items-end gap-2 rounded-xl border border-sidebar-border/70 bg-background p-4 shadow-sm dark:border-sidebar-border">
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-muted-foreground">Table name</label>
            <Input value={data.name} onChange={(e) => setData('name', e.target.value)} required placeholder="Table 1" />
          </div>
          <Button type="submit" className="ml-auto">
            Add table
          </Button>
        </form>

        <div className="rounded-xl border border-sidebar-border/70 bg-background p-4 shadow-sm dark:border-sidebar-border">
          <div className="mb-2 text-sm font-medium text-muted-foreground">Tables</div>
          <div className="space-y-2 text-sm">
            {tables.length === 0 && <div className="text-muted-foreground">No tables yet.</div>}
            {tables.map((table) => (
              <div key={table.id} className="flex items-center gap-3 rounded-lg border border-border/60 px-3 py-2">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{table.name}</span>
                    <Badge className={statusColor(table.status)}>{table.status}</Badge>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button size="xs" variant="outline" onClick={() => handleRename(table)}>
                    Rename
                  </Button>
                  <Button size="xs" variant="outline" onClick={() => handleStatus(table)}>
                    Status
                  </Button>
                  <Button size="xs" variant="destructive" onClick={() => handleDelete(table)}>
                    Delete
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </AppLayout>
  );
}

