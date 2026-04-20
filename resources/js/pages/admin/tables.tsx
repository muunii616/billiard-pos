import { Head, router, useForm } from '@inertiajs/react';
import { useState } from 'react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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
  const [deleteTarget, setDeleteTarget] = useState<Table | null>(null);
  const [editTarget, setEditTarget] = useState<Table | null>(null);
  const [editName, setEditName] = useState('');
  const [editStatus, setEditStatus] = useState<'available' | 'maintenance'>('available');
  const [editError, setEditError] = useState<string | null>(null);

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    post('/admin/tables', {
      onSuccess: () => reset(),
    });
  };

  const openEdit = (table: Table) => {
    setEditTarget(table);
    setEditName(table.name);
    setEditStatus(table.status === 'maintenance' ? 'maintenance' : 'available');
    setEditError(null);
  };

  const saveEdit = () => {
    if (!editTarget) {
      return;
    }

    const name = editName.trim();

    if (!name) {
      setEditError('Table name is required.');

      return;
    }

    setEditError(null);
    router.put(
      `/admin/tables/${editTarget.id}`,
      { name, status: editStatus },
      { onSuccess: () => setEditTarget(null) },
    );
  };

  const handleDelete = (table: Table) => {
    setDeleteTarget(table);
  };

  const confirmDelete = () => {
    if (!deleteTarget) {
      return;
    }

    router.delete(`/admin/tables/${deleteTarget.id}`, {
      onFinish: () => setDeleteTarget(null),
    });
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
                  <Button size="xs" variant="outline" onClick={() => openEdit(table)}>
                    Edit
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

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete table?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone.
              {deleteTarget ? ` "${deleteTarget.name}" will be permanently removed.` : ''}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={confirmDelete}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={!!editTarget} onOpenChange={(open) => !open && setEditTarget(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Edit table</DialogTitle>
            <DialogDescription>Update table name and availability status.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="edit-table-name">Name</Label>
              <Input
                id="edit-table-name"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                placeholder="Table name"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="edit-table-status">Status</Label>
              <Select value={editStatus} onValueChange={(value) => setEditStatus(value as 'available' | 'maintenance')}>
                <SelectTrigger id="edit-table-status" className="w-full">
                  <SelectValue placeholder="Select status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="available">Available</SelectItem>
                  <SelectItem value="maintenance">Maintenance</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {editError && <p className="text-sm text-destructive">{editError}</p>}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setEditTarget(null)}>
              Cancel
            </Button>
            <Button type="button" onClick={saveEdit}>
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}

