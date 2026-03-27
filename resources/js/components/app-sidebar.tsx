import { Link, usePage } from '@inertiajs/react';
import { BarChart3, LayoutGrid, Table2, Users, Wallet } from 'lucide-react';
import { NavFooter } from '@/components/nav-footer';
import { NavMain } from '@/components/nav-main';
import { NavUser } from '@/components/nav-user';
import {
    Sidebar,
    SidebarContent,
    SidebarFooter,
    SidebarHeader,
    SidebarMenu,
    SidebarMenuButton,
    SidebarMenuItem,
} from '@/components/ui/sidebar';
import { dashboard, overview } from '@/routes';
import tablesRoutes from '@/routes/tables';
import type { NavItem } from '@/types';

const mainNavItems: NavItem[] = [
    {
        title: 'Dashboard',
        href: dashboard(),
        icon: LayoutGrid,
    },
    {
        title: 'Tables',
        href: tablesRoutes.index.url(),
        icon: Table2,
    },
    {
        title: 'Open tab',
        href: '/checkouts',
        icon: Wallet,
    },
    {
        title: 'Overview',
        href: overview.url(),
        icon: BarChart3,
    },
];

const footerNavItems: NavItem[] = [];

export function AppSidebar() {
    const page = usePage();
    const isAdmin = (page.props as any)?.auth?.user?.role === 'admin';

    const navItems: NavItem[] = isAdmin
        ? [
              ...mainNavItems,
              {
                  title: 'Products',
                  href: '/admin/products',
                  icon: LayoutGrid,
              },
              {
                  title: 'Users',
                  href: '/admin/users',
                  icon: Users,
              },
          ]
        : mainNavItems;

    return (
        <Sidebar collapsible="icon" variant="inset">
            <SidebarHeader>
                <SidebarMenu>
                    <SidebarMenuItem>
                        <SidebarMenuButton
                            size="lg"
                            className="group-data-[collapsible=icon]:size-12 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:p-0"
                            asChild
                        >
                            <Link
                                href={dashboard()}
                                prefetch
                                className="flex w-full items-center group-data-[collapsible=icon]:justify-center"
                            >
                                <div className="flex aspect-square size-12 shrink-0 items-center justify-center overflow-hidden rounded-md">
                                    <img
                                        src="/logo.png"
                                        alt="Lox Billiard"
                                        className="h-full w-full object-contain"
                                    />
                                </div>
                                <div className="ml-1 grid flex-1 text-left text-sm group-data-[collapsible=icon]:hidden">
                                    <span className="mb-0.5 truncate leading-tight font-semibold">
                                        Lox Billiard
                                    </span>
                                </div>
                            </Link>
                        </SidebarMenuButton>
                    </SidebarMenuItem>
                </SidebarMenu>
            </SidebarHeader>

            <SidebarContent>
                <NavMain items={navItems} />
            </SidebarContent>

            <SidebarFooter>
                <NavFooter items={footerNavItems} className="mt-auto" />
                <NavUser />
            </SidebarFooter>
        </Sidebar>
    );
}
