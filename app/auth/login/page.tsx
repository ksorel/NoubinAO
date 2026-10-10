import { LoginForm } from "@/components/login-form";

// `searchParams` (next de redirection) est une donnée non cachée lue hors
// Suspense — cassait le build prod sous Cache Components (même piège que
// app/invitation/[token]/page.tsx, voir 7929365).
export const instant = false;

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  const redirectTo =
    next && next.startsWith("/") && !next.startsWith("//") && !next.startsWith("/\\")
      ? next
      : undefined;

  return (
    <div className="flex min-h-svh w-full items-center justify-center p-6 md:p-10">
      <div className="w-full max-w-sm">
        <LoginForm redirectTo={redirectTo} />
      </div>
    </div>
  );
}
