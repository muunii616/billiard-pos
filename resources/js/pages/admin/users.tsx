import { Head, router, useForm, usePage } from '@inertiajs/react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
      onSuccess: () => reset('password', 'password_confirmation'),
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
        <form
          onSubmit={handleCreate}
          className="flex flex-wrap items-end gap-4 rounded-xl border border-sidebar-border/70 bg-background p-4 shadow-sm dark:border-sidebar-border"
        >
          <div className="flex flex-col gap-1">
            <Label className="text-xs">Name</Label>
            <Input
              value={data.name}
              onChange={(e) => setData('name', e.target.value)}
              required
              className="w-48"
            />
            {errors.name && <span className="text-xs text-destructive">{errors.name}</span>}
          </div>
          <div className="flex flex-col gap-1">
            <Label className="text-xs">Email</Label>
            <Input
              type="email"
              value={data.email}
              onChange={(e) => setData('email', e.target.value)}
              required
              className="w-48"
            />
            {errors.email && <span className="text-xs text-destructive">{errors.email}</span>}
          </div>
          <div className="flex flex-col gap-1">
            <Label className="text-xs">Phone</Label>
            <Input
              value={data.phone}
              onChange={(e) => setData('phone', e.target.value)}
              placeholder="Optional"
              className="w-40"
            />
          </div>
          <div className="flex flex-col gap-1">
            <Label className="text-xs">Password</Label>
            <Input
              type="password"
              value={data.password}
              onChange={(e) => setData('password', e.target.value)}
              required
              minLength={8}
              className="w-40"
            />
            {errors.password && <span className="text-xs text-destructive">{errors.password}</span>}
          </div>
          <div className="flex flex-col gap-1">
            <Label className="text-xs">Confirm password</Label>
            <Input
              type="password"
              value={data.password_confirmation}
              onChange={(e) => setData('password_confirmation', e.target.value)}
              required
              minLength={8}
              className="w-40"
            />
            {errors.password_confirmation && (
              <span className="text-xs text-destructive">{errors.password_confirmation}</span>
            )}
          </div>
          <div className="flex flex-col gap-1">
            <Label className="text-xs">Role</Label>
            <select
              value={data.role}
              onChange={(e) => setData('role', e.target.value as 'admin' | 'employee')}
              className="h-9 w-28 rounded-md border border-input bg-background px-3 py-1 text-sm"
            >
              <option value="employee">Employee</option>
              <option value="admin">Admin</option>
            </select>
          </div>
          <Button type="submit" disabled={processing}>
            Add user
          </Button>
        </form>

        <div className="rounded-xl border border-sidebar-border/70 bg-background p-4 shadow-sm dark:border-sidebar-border">
          <div className="mb-2 text-sm font-medium text-muted-foreground">Users</div>
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
    </AppLayout>
  );
}
