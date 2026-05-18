import { SystemStatusBadge } from '@/components/common/system-status-badge';

type AuthLayoutProps = {
  children: React.ReactNode;
};

export function AuthLayout({ children }: AuthLayoutProps) {
  return (
    <div className="relative min-h-screen overflow-hidden bg-background text-foreground">
      {/* Nền gradient */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(59,130,246,0.16),transparent_30%),linear-gradient(180deg,#f8fbff_0%,#eef3fb_46%,#e7edf7_100%)] dark:bg-[radial-gradient(ellipse_at_top,rgba(59,130,246,0.14),transparent_55%),linear-gradient(180deg,oklch(0.13_0.015_255)_0%,oklch(0.105_0.01_260)_100%)]" />

      {/* Grid pattern subtle — chỉ dark */}
      <div
        className="absolute inset-0 hidden dark:block opacity-40"
        style={{
          backgroundImage:
            'linear-gradient(rgba(99,102,241,0.06) 1px,transparent 1px),linear-gradient(90deg,rgba(99,102,241,0.06) 1px,transparent 1px)',
          backgroundSize: '52px 52px',
        }}
      />

      {/* Blur orbs */}
      <div className="absolute left-[-8%] top-[8%] h-80 w-80 rounded-full bg-blue-200/35 blur-3xl dark:bg-blue-500/25" />
      <div className="absolute right-[-10%] top-[4%] h-96 w-96 rounded-full bg-violet-200/20 blur-3xl dark:bg-violet-600/20" />
      <div className="absolute bottom-[-5%] left-[30%] h-72 w-72 rounded-full bg-indigo-200/15 blur-3xl dark:bg-indigo-500/15" />

      <div className="absolute right-4 top-4 z-20">
        <SystemStatusBadge />
      </div>

      <div className="relative z-10 flex min-h-screen items-center justify-center px-4 py-8">
        {children}
      </div>
    </div>
  );
}