import { signIn } from "@/lib/auth";

export default function LoginPage() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-sm flex-col justify-center gap-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold">Helping Hands</h1>
        <p className="mt-1 text-sm text-neutral-600">
          Sign in to see your contributions.
        </p>
      </div>
      <form
        action={async () => {
          "use server";
          await signIn("google", { redirectTo: "/me" });
        }}
      >
        <button
          type="submit"
          className="min-h-[44px] w-full rounded-lg bg-neutral-900 px-4 text-white"
        >
          Continue with Google
        </button>
      </form>
    </main>
  );
}
