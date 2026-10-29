import { Link, usePage } from '@inertiajs/react';
import {
    BarChart3,
    Banknote,
    Boxes,
    LayoutGrid,
    Package,
    Receipt,
    Table2,
    Users,
} from 'lucide-react';
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
import { LanguageSwitch } from '@/lib/i18n';
import { dashboard, overview } from '@/routes';
import tablesRoutes from '@/routes/tables';
import type { NavItem } from '@/types';

const floorNavItems: NavItem[] = [
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
        icon: Receipt,
    },
];

export function AppSidebar() {
    const page = usePage();
    const isAdmin =
        (page.props as { auth?: { user?: { role?: string } } })?.auth?.user
            ?.role === 'admin';

    const officeNavItems: NavItem[] = [
        {
            title: 'Overview',
            href: overview.url(),
            icon: BarChart3,
        },
        {
            title: 'Register',
            href: '/cash-register',
            icon: Banknote,
        },
        {
            title: 'Products',
            href: '/admin/products',
            icon: Package,
        },
        {
            title: 'Stock',
            href: '/stock',
            icon: Boxes,
        },
        ...(isAdmin
            ? [
                  {
                      title: 'Users',
                      href: '/admin/users',
                      icon: Users,
                  },
              ]
            : []),
    ];

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
                                        src="/logo-ui.png"
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
                <NavMain items={floorNavItems} label="Floor" />
                <NavMain items={officeNavItems} label="Office" />
            </SidebarContent>

            <SidebarFooter>
                <div className="px-2 pb-2 group-data-[collapsible=icon]:px-1">
                    <LanguageSwitch className="w-full justify-center" />
                </div>
                <NavUser />
            </SidebarFooter>
        </Sidebar>
    );
}
