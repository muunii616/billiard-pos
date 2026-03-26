import { Head, router, useForm } from '@inertiajs/react';
import { useState } from 'react';
import AppLayout from '@/layouts/app-layout';
import type { BreadcrumbItem } from '@/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

type Product = {
  id: number;
  name: string;
  category: string;
  price: string;
  is_active: boolean;
};

type Props = {
  products: Product[];
};

const breadcrumbs: BreadcrumbItem[] = [
  {
    title: 'Admin',
    href: '/admin/products',
  },
  {
    title: 'Products',
    href: '/admin/products',
  },
];

export default function AdminProducts({ products }: Props) {
  const CATEGORY_OPTIONS = ['Drinks', 'Snacks', 'Sets'] as const;

  const normalizeCategory = (raw: string): string => {
    const key = (raw || '').trim().toLowerCase();
    if (key === 'drink' || key === 'drinks') return 'Drinks';
    if (key === 'snack' || key === 'snacks') return 'Snacks';
    if (key === 'set' || key === 'sets' || key === 'combo' || key === 'combos') return 'Sets';
    return 'Snacks';
  };

  const { data, setData, post, reset } = useForm({
    name: '',
    category: 'Snacks',
    price: '',
  });
  const [editOpen, setEditOpen] = useState(false);
  const [editingProductId, setEditingProductId] = useState<number | null>(null);
  const {
    data: editData,
    setData: setEditData,
    put: putEdit,
    reset: resetEdit,
  } = useForm({
    name: '',
    category: 'Snacks',
    price: '',
  });

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    post('/admin/products', {
      onSuccess: () => reset(),
    });
  };

  const toggleActive = (product: Product) => {
    router.put(`/admin/products/${product.id}`, {
      is_active: !product.is_active,
    });
  };

  const handleDelete = (product: Product) => {
    if (!window.confirm(`Delete product "${product.name}"?`)) return;
    router.delete(`/admin/products/${product.id}`);
  };

  const openEditModal = (product: Product) => {
    setEditingProductId(product.id);
    setEditData('name', product.name);
    setEditData('category', normalizeCategory(product.category));
    setEditData('price', String(product.price));
    setEditOpen(true);
  };

  const closeEditModal = () => {
    setEditOpen(false);
    setEditingProductId(null);
    resetEdit();
  };

  const handleSaveEdit = (e: React.FormEvent) => {
    e.preventDefault();
    if (editingProductId == null) return;
    putEdit(`/admin/products/${editingProductId}`, {
      onSuccess: () => closeEditModal(),
    });
  };

  return (
    <AppLayout breadcrumbs={breadcrumbs}>
      <Head title="Products" />
      <div className="flex flex-1 flex-col gap-4 rounded-xl p-4">
        <form
          onSubmit={handleCreate}
          className="flex flex-wrap items-center gap-3 rounded-xl border border-sidebar-border/70 bg-background p-4 shadow-sm dark:border-sidebar-border"
        >
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-muted-foreground">Name</label>
            <Input value={data.name} onChange={(e) => setData('name', e.target.value)} required />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-muted-foreground">Category</label>
            <select
              value={data.category}
              onChange={(e) => setData('category', e.target.value)}
              className="h-9 rounded-md border border-input bg-background px-3 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              required
            >
              {CATEGORY_OPTIONS.map((category) => (
                <option key={category} value={category}>
                  {category}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-muted-foreground">Price</label>
            <Input
              type="number"
              step="0.01"
              min="0"
              value={data.price}
              onChange={(e) => setData('price', e.target.value)}
              required
            />
          </div>
          <Button type="submit" className="ml-auto rounded-full px-4">
            + Add product
          </Button>
        </form>

        <div className="rounded-xl border border-sidebar-border/70 bg-background p-4 shadow-sm dark:border-sidebar-border">
          <div className="mb-2 text-sm font-medium text-muted-foreground">Products</div>
          <div className="space-y-2 text-sm">
            {products.length === 0 && <div className="text-muted-foreground">No products yet.</div>}
            {products.map((product) => (
              <div key={product.id} className="flex items-center gap-3 rounded-lg border border-border/60 px-3 py-2">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{product.name}</span>
                    <Badge variant="outline" className="text-xs">
                      {normalizeCategory(product.category)}
                    </Badge>
                    {!product.is_active && <Badge variant="outline">inactive</Badge>}
                  </div>
                  <div className="text-xs text-muted-foreground">Price: ${Number(product.price).toFixed(2)}</div>
                </div>
                <div className="flex gap-1.5">
                  <Button
                    size="sm"
                    variant={product.is_active ? 'outline' : 'secondary'}
                    className="h-7 rounded-full px-3 text-xs"
                    onClick={() => toggleActive(product)}
                  >
                    {product.is_active ? 'Disable' : 'Enable'}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 rounded-full px-3 text-xs"
                    onClick={() => openEditModal(product)}
                  >
                    Edit
                  </Button>
                  <Button
                    size="sm"
                    variant="destructive"
                    className="h-7 rounded-full px-3 text-xs"
                    onClick={() => handleDelete(product)}
                  >
                    Delete
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <Dialog open={editOpen} onOpenChange={(open) => !open && closeEditModal()}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit product</DialogTitle>
            <DialogDescription>Update product details and save changes.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSaveEdit} className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Name</label>
              <Input
                value={editData.name}
                onChange={(e) => setEditData('name', e.target.value)}
                required
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Category</label>
              <select
                value={editData.category}
                onChange={(e) => setEditData('category', e.target.value)}
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                required
              >
                {CATEGORY_OPTIONS.map((category) => (
                  <option key={category} value={category}>
                    {category}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Price</label>
              <Input
                type="number"
                step="0.01"
                min="0"
                value={editData.price}
                onChange={(e) => setEditData('price', e.target.value)}
                required
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={closeEditModal}>
                Cancel
              </Button>
              <Button type="submit">Save changes</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}

