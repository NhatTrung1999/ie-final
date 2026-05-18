import { useState } from 'react';
import { Eye, EyeOff, LockKeyhole, UserRound, Video } from 'lucide-react';

type LoginScreenProps = {
  onSignIn: (payload: {
    username: string;
    password: string;
    category: string;
  }) => Promise<void>;
};

export function LoginScreen({ onSignIn }: LoginScreenProps) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [category, setCategory] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errors, setErrors] = useState<{
    username?: string;
    password?: string;
    category?: string;
  }>({});
  const [authError, setAuthError] = useState('');

  const validate = () => {
    const nextErrors: {
      username?: string;
      password?: string;
      category?: string;
    } = {};

    if (!username.trim()) {
      nextErrors.username = 'Please enter your username.';
    }

    if (!password.trim()) {
      nextErrors.password = 'Please enter your password.';
    }

    if (!category) {
      nextErrors.category = 'Please choose a category.';
    }

    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError('');

    if (!validate()) return;

    try {
      setIsSubmitting(true);
      await onSignIn({ username: username.trim(), password, category });
    } catch (error) {
      setAuthError(
        error instanceof Error ? error.message : 'Unable to sign in right now.'
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const inputBase =
    'h-11 w-full rounded-2xl border bg-white/80 dark:bg-slate-800/80 text-[15px] text-foreground outline-none transition placeholder:text-muted-foreground focus:ring-4 dark:text-slate-100 dark:placeholder:text-slate-500';
  const inputOk =
    'border-slate-200 dark:border-slate-600/70 focus:border-blue-400 dark:focus:border-blue-500 focus:ring-blue-500/10 dark:focus:ring-blue-500/15';
  const inputErr =
    'border-destructive/50 dark:border-red-500/60 focus:border-destructive/50 focus:ring-destructive/10';

  return (
    <div className="w-full max-w-95 rounded-[28px] border border-slate-200/60 dark:border-slate-700/60 bg-white/90 dark:bg-slate-900/80 backdrop-blur-xl p-5 shadow-[0_24px_90px_rgba(15,23,42,0.12)] dark:shadow-[0_32px_80px_rgba(0,0,0,0.5)] sm:p-6">
      <div className="mx-auto max-w-[320px]">
        {/* Logo */}
        <div className="mb-6 flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-500 to-violet-600 text-white shadow-lg shadow-blue-500/30">
            <Video className="h-5 w-5" />
          </span>
          <div>
            <div className="text-lg font-semibold tracking-tight text-slate-800 dark:text-slate-100">
              IE Video CT
            </div>
          </div>
        </div>

        {/* Heading */}
        <div className="space-y-1">
          <h2 className="text-2xl font-semibold tracking-tight text-slate-800 dark:text-slate-50">
            Sign in
          </h2>
          <p className="text-sm leading-6 text-slate-500 dark:text-slate-400">
            Enter your account to continue.
          </p>
        </div>

        <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
          {/* Username */}
          <Field label="Username">
            <div className="relative">
              <UserRound className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400 dark:text-slate-500" />
              <input
                type="text"
                value={username}
                placeholder="Enter your username"
                onChange={(e) => {
                  setUsername(e.target.value);
                  setErrors((prev) => ({ ...prev, username: undefined }));
                  setAuthError('');
                }}
                className={`${inputBase} pl-11 pr-4 ${errors.username ? inputErr : inputOk}`}
              />
            </div>
            {errors.username ? (
              <p className="text-sm font-medium text-destructive dark:text-red-400">
                {errors.username}
              </p>
            ) : null}
          </Field>

          {/* Password */}
          <Field label="Password">
            <div className="relative">
              <LockKeyhole className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400 dark:text-slate-500" />
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                placeholder="Enter your password"
                onChange={(e) => {
                  setPassword(e.target.value);
                  setErrors((prev) => ({ ...prev, password: undefined }));
                  setAuthError('');
                }}
                className={`${inputBase} pl-11 pr-12 ${errors.password ? inputErr : inputOk}`}
              />
              <button
                type="button"
                onClick={() => setShowPassword((value) => !value)}
                className="absolute right-3 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-lg text-slate-400 dark:text-slate-500 transition hover:bg-slate-100 dark:hover:bg-slate-700 hover:text-slate-700 dark:hover:text-slate-300"
              >
                {showPassword ? (
                  <EyeOff className="h-4 w-4" />
                ) : (
                  <Eye className="h-4 w-4" />
                )}
              </button>
            </div>
            {errors.password ? (
              <p className="text-sm font-medium text-destructive dark:text-red-400">
                {errors.password}
              </p>
            ) : null}
          </Field>

          {/* Category */}
          <Field label="Category">
            <div>
              <select
                value={category}
                onChange={(e) => {
                  setCategory(e.target.value);
                  setErrors((prev) => ({ ...prev, category: undefined }));
                  setAuthError('');
                }}
                className={`${inputBase} px-4 ${errors.category ? inputErr : inputOk}`}
              >
                <option value="">Choose option</option>
                <option value="LSA">LSA</option>
              </select>
            </div>
            {errors.category ? (
              <p className="text-sm font-medium text-destructive dark:text-red-400">
                {errors.category}
              </p>
            ) : null}
          </Field>

          {/* Auth error */}
          {authError ? (
            <div className="rounded-2xl border border-red-200 dark:border-red-500/30 bg-red-50 dark:bg-red-500/10 px-4 py-3 text-sm font-medium text-red-600 dark:text-red-400">
              {authError}
            </div>
          ) : null}

          {/* Submit */}
          <button
            type="submit"
            disabled={isSubmitting}
            className="flex h-11 w-full items-center justify-center rounded-2xl bg-gradient-to-r from-blue-500 to-violet-600 text-[15px] font-semibold text-white shadow-[0_18px_34px_rgba(59,130,246,0.26)] dark:shadow-[0_18px_34px_rgba(59,130,246,0.18)] transition hover:-translate-y-px hover:from-blue-600 hover:to-violet-700 disabled:cursor-not-allowed disabled:opacity-70 disabled:hover:translate-y-0 disabled:hover:from-blue-500 disabled:hover:to-violet-600"
          >
            {isSubmitting ? 'Signing in...' : 'Sign in'}
          </button>
        </form>
      </div>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block space-y-2">
      <span className="text-sm font-semibold text-slate-600 dark:text-slate-300">{label}</span>
      {children}
    </label>
  );
}