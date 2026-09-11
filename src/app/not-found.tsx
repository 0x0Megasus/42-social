import Link from "next/link";

export default function NotFound() {
  return (
    <div className="mx-auto mt-16 max-w-sm rounded-3xl border border-zinc-200 bg-white p-10 text-center dark:border-zinc-800 dark:bg-zinc-950">
      <p className="text-5xl font-bold tracking-tight">404</p>
      <p className="mt-2 text-[15px] font-semibold">Lost on campus?</p>
      <p className="mt-1 text-[13px] text-zinc-500">
        This page or student doesn&apos;t exist.
      </p>
      <Link
        href="/"
        className="mt-5 inline-block rounded-full bg-zinc-900 px-6 py-2.5 text-[14px] font-semibold text-white hover:opacity-80 dark:bg-zinc-50 dark:text-zinc-900"
      >
        Back to feed
      </Link>
    </div>
  );
}
