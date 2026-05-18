import type { ReactNode } from 'react';

type DashboardShellProps = {
  sidebar: ReactNode;
  controlPanel: ReactNode;
  content: ReactNode;
  topBar: ReactNode;
  overlay?: ReactNode;
};

export function DashboardShell({
  sidebar,
  controlPanel,
  content,
  topBar,
  overlay,
}: DashboardShellProps) {
  return (
    <div className="relative flex min-h-screen flex-col overflow-hidden bg-gray-50 dark:bg-[oklch(0.108_0.012_255)] text-gray-800 dark:text-slate-100 md:h-screen">
      {topBar}

      <div className="flex flex-1 flex-col overflow-auto md:overflow-hidden lg:flex-row">
        <aside className="flex shrink-0 flex-col overflow-hidden border-b-2 border-gray-100 dark:border-slate-800/60 bg-white dark:bg-[oklch(0.128_0.013_255)] md:max-h-[48vh] lg:w-64 lg:max-h-none lg:border-r-2 lg:border-b-0 xl:w-72">
          <div
            className="flex min-h-65 flex-col overflow-hidden md:min-h-75 lg:min-h-0"
            style={{ flex: '0 0 35%' }}
          >
            {sidebar}
          </div>

          <div className="flex min-h-75 flex-1 flex-col overflow-hidden lg:min-h-0">
            {controlPanel}
          </div>
        </aside>

        <main className="flex min-h-[50vh] flex-1 flex-col overflow-visible lg:min-h-0 lg:overflow-hidden">
          {content}
        </main>
      </div>

      {overlay}
    </div>
  );
}
