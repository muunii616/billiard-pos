import { Head, router, useForm, usePage } from '@inertiajs/react';
import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
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

function userInitials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase() || '?';
}

export default function AdminUsers({ users }: Props) {
  const { auth } = usePage().props as { auth: { user: { id: number } } };
  const currentUserId = auth.user.id;
  const [createOpen, setCreateOpen] = useState(false);
  const [editUser, setEditUser] = useState<User | null>(null);

  const { data, setData, post, reset, processing, errors } = useForm({
    name: '',
    email: '',
    phone: '',
    password: '',
    password_confirmation: '',
    role: 'employee',
  });

  const editForm = useForm({
    name: '',
    email: '',
    phone: '',
    role: 'employee' as 'admin' | 'employee',
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

  const openEdit = (user: User) => {
    setEditUser(user);
    editForm.setData({
      name: user.name,
      email: user.email,
      phone: user.phone ?? '',
      role: user.role === 'admin' ? 'admin' : 'employee',
    });
  };

  const closeEdit = () => {
    setEditUser(null);
    editForm.reset();
    editForm.clearErrors();
  };

  const handleEditSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editUser) return;
    editForm.put(`/admin/users/${editUser.id}`, {
      preserveScroll: true,
      onSuccess: () => closeEdit(),
    });
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
      <div className="flex flex-1 flex-col gap-6 rounded-xl p-4">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-xl font-semibold tracking-tight">Users</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Manage staff accounts and roles for your venue.
            </p>
          </div>
          <Button className="w-full shrink-0 sm:w-auto" onClick={() => setCreateOpen(true)}>
            + Add user
          </Button>
        </div>

        {users.length === 0 ? (
          <Card className="border-dashed border-sidebar-border/70 dark:border-sidebar-border">
            <CardContent className="py-16 text-center text-sm text-muted-foreground">
              No users yet. Add your first staff member to get started.
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {users.map((user) => (
              <Card
                key={user.id}
                className="border-sidebar-border/70 shadow-sm transition-shadow hover:shadow-md dark:border-sidebar-border"
              >
                <CardHeader className="pb-3">
                  <div className="flex items-start gap-3">
                    <div
                      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary/15 text-sm font-semibold text-primary"
                      aria-hidden
                    >
                      {userInitials(user.name)}
                    </div>
                    <div className="min-w-0 flex-1 space-y-2">
                      <CardTitle className="truncate text-base">{user.name}</CardTitle>
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge
                          variant={user.role === 'admin' ? 'default' : 'secondary'}
                          className="text-xs capitalize"
                        >
                          {user.role}
                        </Badge>
                        {user.id === currentUserId && (
                          <span className="text-xs text-muted-foreground">(you)</span>
                        )}
                      </div>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-1 pb-2 pt-0 text-sm text-muted-foreground">
                  <p className="truncate" title={user.email}>
                    {user.email}
                  </p>
                  {user.phone ? (
                    <p className="truncate" title={user.phone}>
                      {user.phone}
                    </p>
                  ) : (
                    <p className="text-xs italic opacity-80">No phone on file</p>
                  )}
                </CardContent>
                <CardFooter className="mt-auto flex flex-wrap gap-2 border-t border-border/60 pt-4">
                  <Button size="sm" variant="outline" onClick={() => openEdit(user)}>
                    Edit
                  </Button>
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={() => handleDelete(user)}
                    disabled={user.id === currentUserId}
                  >
                    Delete
                  </Button>
                </CardFooter>
              </Card>
            ))}
          </div>
        )}
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

      <Dialog
        open={editUser !== null}
        onOpenChange={(open) => {
          if (!open) closeEdit();
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit user</DialogTitle>
            <DialogDescription>
              Update profile details and role for {editUser?.name ?? 'this user'}.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleEditSubmit} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1 sm:col-span-2">
                <Label htmlFor="edit-name" className="text-xs">
                  Name
                </Label>
                <Input
                  id="edit-name"
                  value={editForm.data.name}
                  onChange={(e) => editForm.setData('name', e.target.value)}
                  required
                />
                {editForm.errors.name && (
                  <span className="text-xs text-destructive">{editForm.errors.name}</span>
                )}
              </div>
              <div className="space-y-1 sm:col-span-2">
                <Label htmlFor="edit-email" className="text-xs">
                  Email
                </Label>
                <Input
                  id="edit-email"
                  type="email"
                  value={editForm.data.email}
                  onChange={(e) => editForm.setData('email', e.target.value)}
                  required
                />
                {editForm.errors.email && (
                  <span className="text-xs text-destructive">{editForm.errors.email}</span>
                )}
              </div>
              <div className="space-y-1 sm:col-span-2">
                <Label htmlFor="edit-phone" className="text-xs">
                  Phone
                </Label>
                <Input
                  id="edit-phone"
                  value={editForm.data.phone}
                  onChange={(e) => editForm.setData('phone', e.target.value)}
                  placeholder="Optional"
                />
                {editForm.errors.phone && (
                  <span className="text-xs text-destructive">{editForm.errors.phone}</span>
                )}
              </div>
              <div className="space-y-1 sm:col-span-2">
                <Label className="text-xs">Role</Label>
                <Select
                  value={editForm.data.role}
                  onValueChange={(value) => editForm.setData('role', value as 'admin' | 'employee')}
                  disabled={editUser?.id === currentUserId}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select role" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="employee">Employee</SelectItem>
                    <SelectItem value="admin">Admin</SelectItem>
                  </SelectContent>
                </Select>
                {editUser?.id === currentUserId && (
                  <p className="text-xs text-muted-foreground">You cannot change your own role.</p>
                )}
                {editForm.errors.role && (
                  <span className="text-xs text-destructive">{editForm.errors.role}</span>
                )}
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={closeEdit}>
                Cancel
              </Button>
              <Button type="submit" disabled={editForm.processing}>
                Save changes
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
