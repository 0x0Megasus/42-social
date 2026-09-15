import { AuthButtons } from "@/components/auth-buttons";
import { getSession } from "@/lib/session";
import { safeNext } from "@/lib/redirect";
import { redirect } from "next/navigation";
import { isMaintenanceMode } from "@/lib/maintenance";
import { cachedUserById } from "@/lib/db";
import { isSupportUser } from "@/lib/support";

export default async function Login({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; next?: string }>;
}) {
  const session = await getSession();
  const { error, next } = await searchParams;
  const isMaintenance = isMaintenanceMode();
  let isSupport = false;
  if (session?.sub) {
    const user = await cachedUserById(session.sub);
    isSupport = isSupportUser(user);
  }
  if (session && isSupport) redirect(safeNext(next));

  return (
    <section className="mx-auto mt-10 max-w-sm">
      <div className="rounded-3xl border border-zinc-200 bg-white p-8 dark:border-zinc-800 dark:bg-zinc-950">
        <h1 className="text-center text-2xl font-bold tracking-tight">
          42<span className="text-cyan-500">·</span>social
        </h1>
        {isMaintenance && !isSupport ? (
          <>
            <p className="mt-2 text-center text-[14px] leading-6 text-rose-600">
              Site under maintenance.
            </p>
            <p className="mt-1 text-center text-[13px] leading-6 text-zinc-500">
              Only support/owner accounts can log in.
            </p>
          </>
        ) : (
          <>
            <p className="mt-2 text-center text-[14px] leading-6 text-zinc-500">
              For 42 / 1337 students.
              <br />
              Sign in with Google to join.
            </p>
            {isMaintenance && (
              <p className="mt-2 text-center text-[13px] leading-6 text-amber-600">
                Site under maintenance — support only.
              </p>
            )}
          </>
        )}
        {error && (
          <p
            role="alert"
            className="mt-4 rounded-xl bg-rose-50 px-3 py-2 text-center text-[13px] text-rose-600 dark:bg-rose-950/40"
          >
            {error === "denied"
              ? "Authorization was cancelled."
              : error === "state"
                ? "Security check failed. Try again."
                : "Login failed. Try again."}
          </p>
        )}
        <div className="mt-6">
          <AuthButtons />
        </div>
      </div>
    </section>
  );
}
