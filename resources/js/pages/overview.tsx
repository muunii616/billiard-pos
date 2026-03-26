import { Head, router } from '@inertiajs/react';
import { useState } from 'react';
import { CalendarDays } from 'lucide-react';
import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, XAxis } from 'recharts';
import AppLayout from '@/layouts/app-layout';
import type { BreadcrumbItem } from '@/types';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  ChartConfig,
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
} from '@/components/ui/chart';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

type Summary = {
  total_revenue: number;
  sessions_count: number;
  receipts_count: number;
  payments: Record<string, number>;
};

type Props = {
  mode: 'daily' | 'monthly';
  date: string;
  month: string;
  summary: Summary;
  charts: {
    sales: Record<string, number>;
    payments: Record<string, number>;
    monthly_income: { month: string; income: number }[];
  };
  invoices: {
    invoice: string;
    status: string;
    method: string;
    amount: number;
  }[];
  selected_year: number;
};

const breadcrumbs: BreadcrumbItem[] = [
  {
    title: 'Overview',
    href: '/overview',
  },
];

export default function Overview({ mode, date, month, summary, charts, invoices, selected_year }: Props) {
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [monthlyYear, setMonthlyYear] = useState<number>(() => Number(month.slice(0, 4)) || new Date().getFullYear());
  const money = (value: number) => `$${(Number(value) || 0).toFixed(2)}`;

  const monthLabels = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const salesColorMap: Record<string, string> = {
    'Table time': '#3b82f6',
    Snacks: '#f59e0b',
    Drinks: '#10b981',
    Sets: '#8b5cf6',
    Other: '#ef4444',
  };
  const paymentPalette = ['#06b6d4', '#22c55e', '#f97316', '#eab308', '#ec4899', '#6366f1'];

  const parseIsoDate = (value: string) => {
    const d = new Date(`${value}T00:00:00`);
    return Number.isNaN(d.getTime()) ? new Date() : d;
  };

  const formatIsoDate = (value: Date) => {
    const y = value.getFullYear();
    const m = String(value.getMonth() + 1).padStart(2, '0');
    const d = String(value.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  };

  const switchMode = (nextMode: 'daily' | 'monthly') => {
    const params =
      nextMode === 'daily'
        ? { mode: 'daily', date }
        : {
            mode: 'monthly',
            month,
            date, // preserve daily date when switching back
          };

    router.get('/overview', params, { preserveScroll: true, replace: true });
  };

  const handleDateChange = (selected?: Date) => {
    if (!selected) return;
    router.get(
      '/overview',
      {
        mode: 'daily',
        date: formatIsoDate(selected),
      },
      { preserveScroll: true, replace: true, onSuccess: () => setCalendarOpen(false) },
    );
  };

  const calendarMonth = mode === 'daily' ? parseIsoDate(date) : parseIsoDate(`${month}-01`);
  const selectedMonthIndex = Math.max(0, Math.min(11, Number(month.slice(5, 7)) - 1 || 0));
  const yearOptions = Array.from({ length: (new Date().getFullYear() + 2) - 2024 + 1 }, (_, i) => 2024 + i);
  const salesData = Object.entries(charts.sales)
    .map(([name, value]) => ({ name, value: Number(value) || 0 }))
    .filter((item) => item.value > 0);
  const paymentData = Object.entries(charts.payments)
    .map(([name, value]) => ({ name, value: Number(value) || 0 }))
    .filter((item) => item.value > 0);
  const monthlyIncomeData = charts.monthly_income.map((item) => ({
    month: item.month,
    income: Number(item.income) || 0,
  }));
  const invoicesTotal = invoices.reduce((sum, row) => sum + (Number(row.amount) || 0), 0);

  const salesChartConfig: ChartConfig = Object.fromEntries(
    salesData.map((item, i) => [
      item.name,
      { label: item.name, color: salesColorMap[item.name] ?? paymentPalette[i % paymentPalette.length] },
    ]),
  );
  const paymentsChartConfig: ChartConfig = Object.fromEntries(
    paymentData.map((item, i) => [
      item.name,
      { label: item.name, color: paymentPalette[i % paymentPalette.length] },
    ]),
  );
  const incomeChartConfig: ChartConfig = {
    income: { label: 'Income', color: '#22c55e' },
  };

  const handleMonthlyPick = (monthIndex: number) => {
    const nextMonth = `${monthlyYear}-${String(monthIndex + 1).padStart(2, '0')}`;
    router.get(
      '/overview',
      {
        mode: 'monthly',
        month: nextMonth,
        date,
      },
      { preserveScroll: true, replace: true, onSuccess: () => setCalendarOpen(false) },
    );
  };

  return (
    <AppLayout breadcrumbs={breadcrumbs}>
      <Head title="Overview" />
      <div className="flex flex-1 flex-col gap-4 rounded-xl p-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="inline-flex rounded-lg border border-sidebar-border/70 p-1 dark:border-sidebar-border">
            <Button
              size="sm"
              variant={mode === 'daily' ? 'default' : 'ghost'}
              className="rounded-md"
              onClick={() => switchMode('daily')}
            >
              Daily
            </Button>
            <Button
              size="sm"
              variant={mode === 'monthly' ? 'default' : 'ghost'}
              className="rounded-md"
              onClick={() => switchMode('monthly')}
            >
              Monthly
            </Button>
          </div>

          <Popover
            open={calendarOpen}
            onOpenChange={(open) => {
              if (open) setMonthlyYear(Number(month.slice(0, 4)) || new Date().getFullYear());
              setCalendarOpen(open);
            }}
          >
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="gap-2">
                <CalendarDays className="h-4 w-4" />
                {mode === 'daily' ? date : month}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              {mode === 'daily' ? (
                <Calendar
                  mode="single"
                  selected={calendarMonth}
                  defaultMonth={calendarMonth}
                  onSelect={handleDateChange}
                  showOutsideDays
                  captionLayout="dropdown"
                  fromYear={2024}
                  toYear={new Date().getFullYear() + 2}
                  className="rounded-lg"
                />
              ) : (
                <div className="w-[280px] p-3">
                  <div className="mb-3 flex items-center justify-between">
                    <span className="text-sm font-medium">Select month</span>
                    <select
                      value={monthlyYear}
                      onChange={(e) => setMonthlyYear(Number(e.target.value))}
                      className="h-8 rounded-md border border-input bg-background px-2 text-sm"
                    >
                      {yearOptions.map((year) => (
                        <option key={year} value={year}>
                          {year}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    {monthLabels.map((label, index) => (
                      <Button
                        key={label}
                        type="button"
                        size="sm"
                        variant={
                          monthlyYear === Number(month.slice(0, 4)) && index === selectedMonthIndex
                            ? 'default'
                            : 'outline'
                        }
                        className="justify-center"
                        onClick={() => handleMonthlyPick(index)}
                      >
                        {label}
                      </Button>
                    ))}
                  </div>
                </div>
              )}
            </PopoverContent>
          </Popover>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <Card className="border-sidebar-border/70 bg-background py-4 dark:border-sidebar-border">
            <CardHeader className="px-4 pb-0">
              <CardTitle className="text-xs font-medium text-muted-foreground">Total revenue</CardTitle>
            </CardHeader>
            <CardContent className="px-4">
              <div className="text-2xl font-semibold">{money(Number(summary.total_revenue) || 0)}</div>
            </CardContent>
          </Card>
          <Card className="border-sidebar-border/70 bg-background py-4 dark:border-sidebar-border">
            <CardHeader className="px-4 pb-0">
              <CardTitle className="text-xs font-medium text-muted-foreground">Sessions</CardTitle>
            </CardHeader>
            <CardContent className="px-4">
              <div className="text-2xl font-semibold">{summary.sessions_count}</div>
            </CardContent>
          </Card>
          <Card className="border-sidebar-border/70 bg-background py-4 dark:border-sidebar-border">
            <CardHeader className="px-4 pb-0">
              <CardTitle className="text-xs font-medium text-muted-foreground">Receipts</CardTitle>
            </CardHeader>
            <CardContent className="px-4">
              <div className="text-2xl font-semibold">{summary.receipts_count}</div>
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-4 xl:grid-cols-2">
          <Card className="border-sidebar-border/70 bg-background py-4 dark:border-sidebar-border">
            <CardHeader className="px-4 pb-0">
              <CardTitle className="text-sm font-semibold">Sales breakdown</CardTitle>
            </CardHeader>
            <CardContent className="px-4">
              {salesData.length === 0 ? (
                <div className="text-sm text-muted-foreground">No sales data for this period.</div>
              ) : (
                <ChartContainer config={salesChartConfig} className="mx-auto aspect-square h-[280px]">
                  <PieChart>
                    <ChartTooltip content={<ChartTooltipContent hideLabel />} />
                    <Pie data={salesData} dataKey="value" nameKey="name" outerRadius={95}>
                      {salesData.map((item, index) => (
                        <Cell key={item.name} fill={salesColorMap[item.name] ?? paymentPalette[index % paymentPalette.length]} />
                      ))}
                    </Pie>
                    <ChartLegend content={<ChartLegendContent />} />
                  </PieChart>
                </ChartContainer>
              )}
            </CardContent>
          </Card>

          <Card className="border-sidebar-border/70 bg-background py-4 dark:border-sidebar-border">
            <CardHeader className="px-4 pb-0">
              <CardTitle className="text-sm font-semibold">Payment type breakdown</CardTitle>
            </CardHeader>
            <CardContent className="px-4">
              {paymentData.length === 0 ? (
                <div className="text-sm text-muted-foreground">No payment data for this period.</div>
              ) : (
                <ChartContainer config={paymentsChartConfig} className="mx-auto aspect-square h-[280px]">
                  <PieChart>
                    <ChartTooltip content={<ChartTooltipContent hideLabel />} />
                    <Pie data={paymentData} dataKey="value" nameKey="name" outerRadius={95}>
                      {paymentData.map((item, index) => (
                        <Cell key={item.name} fill={paymentPalette[index % paymentPalette.length]} />
                      ))}
                    </Pie>
                    <ChartLegend content={<ChartLegendContent />} />
                  </PieChart>
                </ChartContainer>
              )}
            </CardContent>
          </Card>
        </div>

        {mode === 'monthly' && (
          <Card className="border-sidebar-border/70 bg-background py-4 dark:border-sidebar-border">
            <CardHeader className="px-4 pb-0">
              <CardTitle className="text-sm font-semibold">Monthly income ({selected_year})</CardTitle>
            </CardHeader>
            <CardContent className="px-4">
              <ChartContainer config={incomeChartConfig} className="h-[300px] w-full">
                <BarChart data={monthlyIncomeData} margin={{ left: 8, right: 8 }}>
                  <CartesianGrid vertical={false} />
                  <XAxis dataKey="month" tickLine={false} axisLine={false} tickMargin={8} />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Bar dataKey="income" fill="var(--color-income)" radius={6} />
                </BarChart>
              </ChartContainer>
            </CardContent>
          </Card>
        )}

        <Card className="border-sidebar-border/70 bg-background py-4 dark:border-sidebar-border">
          <CardHeader className="px-4 pb-0">
            <CardTitle className="text-sm font-semibold">Invoices</CardTitle>
          </CardHeader>
          <CardContent className="px-4">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Invoice</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Method</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {invoices.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={4} className="text-muted-foreground">
                      No invoices for this period.
                    </TableCell>
                  </TableRow>
                )}
                {invoices.map((row) => (
                  <TableRow key={row.invoice}>
                    <TableCell className="font-medium">{row.invoice}</TableCell>
                    <TableCell>{row.status}</TableCell>
                    <TableCell>{row.method}</TableCell>
                    <TableCell className="text-right">{money(Number(row.amount) || 0)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
              <TableFooter>
                <TableRow>
                  <TableCell colSpan={3}>Total</TableCell>
                  <TableCell className="text-right">{money(invoicesTotal)}</TableCell>
                </TableRow>
              </TableFooter>
              <TableCaption>
                {mode === 'daily'
                  ? 'Invoices for the selected date.'
                  : 'Invoices for the selected month, newest to oldest.'}
              </TableCaption>
            </Table>
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}

