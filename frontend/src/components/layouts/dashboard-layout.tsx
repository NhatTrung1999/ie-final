import { DashboardShell } from '@/components/dashboard/dashboard-shell';

type DashboardLayoutProps = React.ComponentProps<typeof DashboardShell>;

export function DashboardLayout(props: DashboardLayoutProps) {
  return <DashboardShell {...props} />;
}
