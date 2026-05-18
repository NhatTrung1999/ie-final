import { ArrowLeft, Compass } from 'lucide-react';
import { Link } from 'react-router-dom';

type NotFoundScreenProps = {
  isAuthenticated: boolean;
};

export function NotFoundScreen({ isAuthenticated }: NotFoundScreenProps) {
  const target = isAuthenticated ? '/dashboard' : '/login';

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-100 px-4">
      <div className="w-full max-w-md rounded-[28px] border border-white/70 bg-white/90 p-6 text-center shadow-[0_24px_90px_rgba(15,23,42,0.12)] backdrop-blur sm:p-8">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-3xl bg-blue-50 text-blue-600">
          <Compass className="h-8 w-8" />
        </div>
        <div className="mt-6 text-xs font-bold uppercase tracking-[0.24em] text-slate-400">
          404 Error
        </div>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-800">
          Page not found
        </h1>
        <p className="mt-3 text-sm leading-6 text-slate-500">
          The page you are looking for does not exist or may have been moved.
        </p>
        <Link
          to={target}
          className="mt-6 inline-flex h-11 items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-blue-500 to-violet-600 px-5 text-sm font-semibold text-white shadow-[0_18px_34px_rgba(59,130,246,0.22)] transition hover:translate-y-[-1px] hover:from-blue-600 hover:to-violet-700"
        >
          <ArrowLeft className="h-4 w-4" />
          Back
        </Link>
      </div>
    </div>
  );
}
