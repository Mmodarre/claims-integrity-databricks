import { createBrowserRouter, NavLink, Outlet, RouterProvider, useLocation } from 'react-router';
import {
  Badge,
  Separator,
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
  TooltipProvider,
  useAnalyticsQuery,
} from '@databricks/appkit-ui/react';
import {
  Building2,
  Coins,
  FileSearch,
  Filter,
  LayoutDashboard,
  MessageSquareText,
  ScanText,
  ShieldCheck,
  UserRound,
} from 'lucide-react';
import { useMemo } from 'react';
import { OverviewPage } from './pages/OverviewPage';
import { FunnelPage } from './pages/FunnelPage';
import { RecoveryPage } from './pages/RecoveryPage';
import { HospitalRiskPage } from './pages/HospitalRiskPage';
import { EvidencePage } from './pages/EvidencePage';
import { PipelinePage } from './pages/PipelinePage';
import { AskPage } from './pages/AskPage';
import { useWhoAmI } from './lib/app-config';
import { fmtDateTime } from './lib/format';

const NAV = [
  {
    label: 'Leadership view',
    items: [
      { to: '/', label: 'Overview', icon: LayoutDashboard, end: true },
      { to: '/funnel', label: 'Integrity funnel', icon: Filter },
      { to: '/recovery', label: 'Recovery', icon: Coins },
      { to: '/hospitals', label: 'Hospital risk', icon: Building2 },
    ],
  },
  {
    label: 'AI you can trust',
    items: [
      { to: '/evidence', label: 'Evidence explorer', icon: FileSearch },
      { to: '/pipeline', label: 'AI pipeline', icon: ScanText },
      { to: '/ask', label: 'Ask the data', icon: MessageSquareText },
    ],
  },
];

function Freshness() {
  const params = useMemo(() => ({}), []);
  const { data, loading } = useAnalyticsQuery('data_freshness', params);
  const row = data?.[0];
  if (loading || !row) return null;
  return (
    <span className="hidden text-xs text-muted-foreground lg:inline">
      Claims Jan 2021 – Dec 2023 · AI pipeline last run {fmtDateTime(row.last_ai_review)}
    </span>
  );
}

function UserBadge() {
  const { data } = useWhoAmI();
  const who = data?.email ?? data?.preferredUsername ?? data?.user;
  return (
    <Badge variant="secondary" className="gap-1 font-normal">
      <UserRound className="h-3 w-3" aria-hidden />
      {who ?? 'Signed in'}
    </Badge>
  );
}

function Layout() {
  const location = useLocation();
  return (
    <TooltipProvider delayDuration={150}>
      <SidebarProvider>
        <Sidebar collapsible="icon">
          <SidebarHeader>
            <div className="flex items-center gap-2 px-1 py-1.5">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-ai text-ai-foreground">
                <ShieldCheck className="h-4 w-4" aria-hidden />
              </div>
              <div className="min-w-0 group-data-[collapsible=icon]:hidden">
                <div className="truncate text-sm font-semibold text-foreground">Claims Integrity</div>
                <div className="truncate text-xs text-muted-foreground">AI-native insights</div>
              </div>
            </div>
          </SidebarHeader>
          <SidebarContent>
            {NAV.map((group) => (
              <SidebarGroup key={group.label}>
                <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
                <SidebarGroupContent>
                  <SidebarMenu>
                    {group.items.map((item) => {
                      const active = item.end ? location.pathname === item.to : location.pathname.startsWith(item.to);
                      return (
                        <SidebarMenuItem key={item.to}>
                          <SidebarMenuButton asChild isActive={active} tooltip={item.label}>
                            <NavLink to={item.to} end={item.end}>
                              <item.icon />
                              <span>{item.label}</span>
                            </NavLink>
                          </SidebarMenuButton>
                        </SidebarMenuItem>
                      );
                    })}
                  </SidebarMenu>
                </SidebarGroupContent>
              </SidebarGroup>
            ))}
          </SidebarContent>
          <SidebarFooter>
            <p className="px-2 pb-1 text-[11px] leading-snug text-muted-foreground group-data-[collapsible=icon]:hidden">
              Demo data. Governed metrics from Unity Catalog metric views; AI outputs from Lakeflow pipelines using
              Databricks AI Functions.
            </p>
          </SidebarFooter>
        </Sidebar>
        <SidebarInset>
          <header className="sticky top-0 z-10 flex h-12 items-center gap-3 border-b bg-background/95 px-4 backdrop-blur">
            <SidebarTrigger className="-ml-1" />
            <Separator orientation="vertical" className="h-5" />
            <Freshness />
            <div className="ml-auto flex items-center gap-2">
              <UserBadge />
            </div>
          </header>
          <main className="mx-auto w-full max-w-[1500px] flex-1 space-y-6 p-4 md:p-6">
            <Outlet />
          </main>
        </SidebarInset>
      </SidebarProvider>
    </TooltipProvider>
  );
}

const router = createBrowserRouter([
  {
    element: <Layout />,
    children: [
      { path: '/', element: <OverviewPage /> },
      { path: '/funnel', element: <FunnelPage /> },
      { path: '/recovery', element: <RecoveryPage /> },
      { path: '/hospitals', element: <HospitalRiskPage /> },
      { path: '/evidence', element: <EvidencePage /> },
      { path: '/pipeline', element: <PipelinePage /> },
      { path: '/ask', element: <AskPage /> },
      { path: '*', element: <OverviewPage /> },
    ],
  },
]);

export default function App() {
  return <RouterProvider router={router} />;
}
