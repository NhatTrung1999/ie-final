import { useEffect, useState } from 'react';
import { Eye, EyeOff, ShieldPlus, Trash2, UserPlus, X } from 'lucide-react';

import {
  deleteUser,
  fetchUsers,
  registerUser,
  type AuthUser,
} from '@/services/auth';

type CreateUserModalProps = {
  open: boolean;
  onClose: () => void;
};

type FieldErrors = {
  username?: string;
  displayName?: string;
  password?: string;
};

export function CreateUserModal({ open, onClose }: CreateUserModalProps) {
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [submitError, setSubmitError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [users, setUsers] = useState<AuthUser[]>([]);
  const [usersError, setUsersError] = useState('');
  const [isLoadingUsers, setIsLoadingUsers] = useState(false);
  const [deletingUserId, setDeletingUserId] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;

    setUsername('');
    setDisplayName('');
    setPassword('');
    setShowPassword(false);
    setErrors({});
    setSubmitError('');
    setSuccessMessage('');
    setIsSubmitting(false);
    setUsersError('');
    setDeletingUserId(null);

    setIsLoadingUsers(true);
    void fetchUsers()
      .then((nextUsers) => {
        setUsers(nextUsers);
      })
      .catch((error) => {
        setUsersError(
          error instanceof Error
            ? error.message
            : 'Unable to load users right now.'
        );
      })
      .finally(() => {
        setIsLoadingUsers(false);
      });
  }, [open]);

  if (!open) return null;

  const validate = () => {
    const nextErrors: FieldErrors = {};

    if (!username.trim()) {
      nextErrors.username = 'Please enter a username.';
    }

    if (!displayName.trim()) {
      nextErrors.displayName = 'Please enter a display name.';
    }

    if (!password.trim()) {
      nextErrors.password = 'Please enter a password.';
    }
    //  else if (password.trim().length < 6) {
    //   nextErrors.password = 'Password must be at least 6 characters.';
    // }

    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError('');
    setSuccessMessage('');

    if (!validate()) return;

    try {
      setIsSubmitting(true);
      const createdUser = await registerUser({
        username: username.trim().toLowerCase(),
        displayName: displayName.trim(),
        password,
      });

      setSuccessMessage(
        createdUser?.displayName
          ? `Created user ${createdUser.displayName} successfully.`
          : 'Created user successfully.'
      );
      setUsername('');
      setDisplayName('');
      setPassword('');
      setErrors({});
      void fetchUsers().then((nextUsers) => setUsers(nextUsers));
    } catch (error) {
      setSubmitError(
        error instanceof Error
          ? error.message
          : 'Unable to create user right now.'
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteUser = async (userId: string) => {
    try {
      setUsersError('');
      setDeletingUserId(userId);
      await deleteUser(userId);
      setSuccessMessage('Deleted user successfully.');
      setUsers((prev) => prev.filter((user) => user.id !== userId));
    } catch (error) {
      setUsersError(
        error instanceof Error
          ? error.message
          : 'Unable to delete user right now.'
      );
    } finally {
      setDeletingUserId(null);
    }
  };

  return (
    <div className="absolute inset-0 z-60 flex items-center justify-center overflow-y-auto bg-slate-950/25 px-3 py-5 backdrop-blur-[2px] sm:px-4 sm:py-8">
      <div className="w-full max-w-107.5 overflow-hidden rounded-[20px] border border-slate-200 bg-white shadow-[0_22px_64px_rgba(15,23,42,0.16)]">
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3 sm:px-4.5">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="h-4 w-1 rounded-full bg-linear-to-b from-blue-500 to-violet-500" />
              <span className="text-[11px] font-bold uppercase tracking-[0.24em] text-slate-400">
                User Access
              </span>
            </div>
            <h2 className="text-[18px] font-semibold tracking-tight text-slate-700">
              Create User
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3 px-4 py-3.5 sm:px-4.5">
          <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-2.5">
            <div className="flex items-center gap-2.5">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-50 text-blue-500">
                <ShieldPlus className="h-4 w-4" />
              </span>
              <div>
                <div className="text-[13px] font-semibold text-slate-700">
                  Add a new dashboard user
                </div>
                <div className="text-[11px] text-slate-400">
                  This account will be stored in the auth table only.
                </div>
              </div>
            </div>
          </div>

          <Field label="Username" error={errors.username}>
            <input
              value={username}
              onChange={(e) => {
                setUsername(e.target.value);
                setErrors((prev) => ({ ...prev, username: undefined }));
                setSubmitError('');
              }}
              placeholder="Enter username..."
              className={inputClassName(Boolean(errors.username))}
            />
          </Field>

          <Field label="Display Name" error={errors.displayName}>
            <input
              value={displayName}
              onChange={(e) => {
                setDisplayName(e.target.value);
                setErrors((prev) => ({ ...prev, displayName: undefined }));
                setSubmitError('');
              }}
              placeholder="Enter display name..."
              className={inputClassName(Boolean(errors.displayName))}
            />
          </Field>

          <Field label="Password" error={errors.password}>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  setErrors((prev) => ({ ...prev, password: undefined }));
                  setSubmitError('');
                }}
                placeholder="Enter password..."
                className={`${inputClassName(Boolean(errors.password))} pr-12`}
              />
              <button
                type="button"
                onClick={() => setShowPassword((value) => !value)}
                className="absolute right-3 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
              >
                {showPassword ? (
                  <EyeOff className="h-4 w-4" />
                ) : (
                  <Eye className="h-4 w-4" />
                )}
              </button>
            </div>
          </Field>

          {submitError ? (
            <div className="rounded-2xl border border-red-200 bg-red-50 px-3 py-2.5 text-[13px] font-medium text-red-500">
              {submitError}
            </div>
          ) : null}

          {successMessage ? (
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-[13px] font-medium text-emerald-600">
              {successMessage}
            </div>
          ) : null}

          <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-2.5">
            <div className="mb-2.5 flex items-center justify-between">
              <div>
                <div className="text-[13px] font-semibold text-slate-700">
                  Existing Users
                </div>
                <div className="text-[11px] text-slate-400">
                  Manage accounts in the auth table.
                </div>
              </div>
              <span className="rounded-full bg-white px-2 py-1 text-[11px] font-semibold text-slate-500">
                {users.length}
              </span>
            </div>

            {usersError ? (
              <div className="mb-2.5 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-[12px] font-medium text-red-500">
                {usersError}
              </div>
            ) : null}

            <div className="max-h-44 space-y-2 overflow-y-auto pr-1">
              {isLoadingUsers ? (
                <div className="rounded-xl border border-slate-200 bg-white px-3 py-3 text-[13px] text-slate-400">
                  Loading users...
                </div>
              ) : users.length === 0 ? (
                <div className="rounded-xl border border-slate-200 bg-white px-3 py-3 text-[13px] text-slate-400">
                  No users found.
                </div>
              ) : (
                users.map((user) => (
                  <div
                    key={user.id}
                    className="flex items-center gap-2.5 rounded-xl border border-slate-200 bg-white px-3 py-2"
                  >
                  <div className="min-w-0 flex-1">
                      <div className="truncate text-[13px] font-semibold text-slate-700">
                        {user.displayName}
                      </div>
                      <div className="truncate text-[11px] text-slate-400">
                        {user.username}
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleDeleteUser(user.id)}
                      disabled={
                        deletingUserId === user.id ||
                        user.username === 'administrator' ||
                        user.username === 'admin'
                      }
                      className="flex h-8 items-center justify-center rounded-xl border border-red-200 bg-red-50 px-2.5 text-[11px] font-semibold text-red-500 transition hover:bg-red-100 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-300"
                    >
                      <Trash2 className="mr-1 h-3.5 w-3.5" />
                      {deletingUserId === user.id ? 'Deleting...' : 'Delete'}
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-2 pt-1 sm:grid-cols-2">
            <button
              type="submit"
              disabled={isSubmitting}
              className="flex h-10 items-center justify-center gap-2 rounded-xl bg-linear-to-r from-blue-500 to-violet-600 text-[13px] font-semibold text-white shadow-[0_10px_24px_rgba(79,70,229,0.24)] transition hover:from-blue-600 hover:to-violet-700 disabled:cursor-not-allowed disabled:opacity-70"
            >
              <UserPlus className="h-4 w-4" />
              {isSubmitting ? 'Creating...' : 'Create User'}
            </button>

            <button
              type="button"
              onClick={onClose}
              className="flex h-10 items-center justify-center rounded-xl bg-red-500 text-[13px] font-semibold text-white transition hover:bg-red-600"
            >
              Close
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block space-y-1.5">
      <span className="text-[12px] font-semibold text-slate-600">{label}</span>
      {children}
      {error ? (
        <p className="text-[12px] font-medium text-red-500">{error}</p>
      ) : null}
    </label>
  );
}

function inputClassName(hasError: boolean) {
  return `h-10 w-full rounded-xl border bg-white px-3 text-[13px] text-slate-700 outline-none transition placeholder:text-slate-400 focus:ring-2 ${
    hasError
      ? 'border-red-300 focus:border-red-300 focus:ring-red-50'
      : 'border-slate-200 focus:border-blue-300 focus:ring-blue-50'
  }`;
}
