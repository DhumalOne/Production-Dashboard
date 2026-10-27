import { LoginForm } from "./login-form";

export const metadata = { title: "Sign in · Dhumal Dashboard" };

export default function LoginPage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-4 py-10">
      <h1 className="text-2xl font-semibold">Dhumal Dashboard</h1>
      <p className="mt-1 text-muted">Sign in once on this device. You stay signed in for 90 days.</p>
      <LoginForm />
    </main>
  );
}
