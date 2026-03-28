import { Head, router, useForm, usePage } from '@inertiajs/react';
import { useState } from 'react';
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

type User = {
  id: number;
  name: string;
  email: string;
  phone: string | null;
  role: string;
};

type Props = {
  users: User[];
};

const breadcrumbs: BreadcrumbItem[] = [
  {
    title: 'Admin',
    href: '/admin/users',
  },
  {
    title: 'Users',
    href: '/admin/users',
  },
];

export default function AdminUsers({ users }: Props) {
  const { auth } = usePage().props as { auth: { user: { id: number } } };
  const currentUserId = auth.user.id;
  const [createOpen, setCreateOpen] = useState(false);

  const { data, setData, post, reset, processing, errors } = useForm({
    name: '',
    email: '',
    phone: '',
    password: '',
    password_confirmation: '',
    role: 'employee',
  });

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    post('/admin/users', {
      onSuccess: () => {
        reset();
        setCreateOpen(false);
      },
    });
  };

  const handleEditRole = (user: User) => {
    const role = window.prompt('Role (admin or employee)', user.role) ?? user.role;

    if (!['admin', 'employee'].includes(role)) {
      alert('Role must be admin or employee.');

      return;
    }

    router.put(`/admin/users/${user.id}`, { role });
  };

  const handleEdit = (user: User) => {
    const name = window.prompt('Name', user.name);

    if (name === null) {
      return;
    }

    const email = window.prompt('Email', user.email);

    if (email === null) {
      return;
    }

    const phone = window.prompt('Phone', user.phone ?? '');

    if (phone === null) {
      return;
    }

    router.put(`/admin/users/${user.id}`, { name, email, phone: phone || null });
  };

  const handleDelete = (user: User) => {
    if (user.id === currentUserId) {
      alert('You cannot delete your own account.');

      return;
    }

    if (!window.confirm(`Delete user "${user.name}"?`)) {
      return;
    }

    router.delete(`/admin/users/${user.id}`);
  };

  return (
    <AppLayout breadcrumbs={breadcrumbs}>
      <Head title="Users" />
      <div className="flex flex-1 flex-col gap-4 rounded-xl p-4">
        <div className="rounded-xl border border-sidebar-border/70 bg-background p-4 shadow-sm dark:border-sidebar-border">
          <div className="mb-3 flex items-center justify-between">
            <div className="text-sm font-medium text-muted-foreground">Users</div>
            <Button className="rounded-full px-4" onClick={() => setCreateOpen(true)}>
              + Add user
            </Button>
          </div>
          <div className="space-y-2 text-sm">
            {users.length === 0 && <div className="text-muted-foreground">No users yet.</div>}
            {users.map((user) => (
              <div
                key={user.id}
                className="flex items-center gap-3 rounded-lg border border-border/60 px-3 py-2"
              >
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{user.name}</span>
                    <Badge variant="outline" className="text-xs">
                      {user.role}
                    </Badge>
                    {user.id === currentUserId && (
                      <span className="text-xs text-muted-foreground">(you)</span>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground">{user.email}</div>
                  {user.phone && (
                    <div className="text-xs text-muted-foreground">Phone: {user.phone}</div>
                  )}
                </div>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => handleEdit(user)}>
                    Edit
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => handleEditRole(user)}>
                    Change role
                  </Button>
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={() => handleDelete(user)}
                    disabled={user.id === currentUserId}
                  >
                    Delete
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <Dialog
        open={createOpen}
        onOpenChange={(open) => {
          setCreateOpen(open);
          if (!open) reset();
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Add user</DialogTitle>
            <DialogDescription>Fill in account details to register a new staff user.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleCreate} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1">
                <Label className="text-xs">Name</Label>
                <Input value={data.name} onChange={(e) => setData('name', e.target.value)} required />
                {errors.name && <span className="text-xs text-destructive">{errors.name}</span>}
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Email</Label>
                <Input
                  type="email"
                  value={data.email}
                  onChange={(e) => setData('email', e.target.value)}
                  required
                />
                {errors.email && <span className="text-xs text-destructive">{errors.email}</span>}
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Phone</Label>
                <Input
                  value={data.phone}
                  onChange={(e) => setData('phone', e.target.value)}
                  placeholder="Optional"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Role</Label>
                <Select
                  value={data.role}
                  onValueChange={(value) => setData('role', value as 'admin' | 'employee')}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select role" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="employee">Employee</SelectItem>
                    <SelectItem value="admin">Admin</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Password</Label>
                <Input
                  type="password"
                  value={data.password}
                  onChange={(e) => setData('password', e.target.value)}
                  required
                  minLength={8}
                />
                {errors.password && <span className="text-xs text-destructive">{errors.password}</span>}
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Confirm password</Label>
                <Input
                  type="password"
                  value={data.password_confirmation}
                  onChange={(e) => setData('password_confirmation', e.target.value)}
                  required
                  minLength={8}
                />
                {errors.password_confirmation && (
                  <span className="text-xs text-destructive">{errors.password_confirmation}</span>
                )}
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={processing}>
                Add user
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
