import { LoginScreen } from '@/components/auth/login-screen';
import { AuthLayout } from '@/components/layouts/auth-layout';

type LoginPageProps = {
  onSignIn: (payload: {
    username: string;
    password: string;
    category: string;
  }) => Promise<void>;
};

export function LoginPage({ onSignIn }: LoginPageProps) {
  return (
    <AuthLayout>
      <LoginScreen onSignIn={onSignIn} />
    </AuthLayout>
  );
}
