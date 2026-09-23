"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { signIn } from "next-auth/react";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  // Si viene un callbackUrl explícito lo respetamos; si no, al selector de
  // portales.
  const callbackUrl = searchParams.get("callbackUrl");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const res = await signIn("credentials", {
        email,
        password,
        redirect: false,
      });

      if (!res || res.error) {
        // Mensaje genérico siempre (no distinguir email/contraseña).
        setError("Credenciales incorrectas. Revisa tu email y contraseña.");
        return;
      }

      // Todos entran por el selector de portales, salvo que vinieran de una
      // página concreta (callbackUrl).
      router.push(callbackUrl ?? "/");
      router.refresh();
    } catch {
      setError("No se ha podido iniciar sesión. Inténtalo de nuevo.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden px-4">
      {/* Resplandor detrás de la tarjeta. */}
      <div
        aria-hidden
        className="pointer-events-none absolute left-[calc(50%-20rem)] top-[calc(50%-20rem)] h-[40rem] w-[40rem] bg-[radial-gradient(circle,rgb(var(--belsue-bright)/0.22),transparent_60%)]"
      />

      <div className="animate-rise relative mb-7 flex flex-col items-center">
        <span className="glow-ring flex h-14 w-14 items-center justify-center rounded-full bg-belsue text-xl font-bold text-white">
          B
        </span>
        <h1 className="text-glow mt-4 text-2xl font-bold tracking-tight">
          Asistente Belsué
        </h1>
      </div>

      <div className="glass animate-rise relative w-full max-w-[400px] rounded-2xl p-7">
        <p className="mb-5 text-center text-sm text-gray-500">
          Inicia sesión para continuar
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-gray-600">Email</span>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="tu@belsue.es"
              required
              autoComplete="email"
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-belsue focus:outline-none focus:ring-1 focus:ring-belsue"
            />
          </label>

          <label className="block text-sm">
            <span className="mb-1 block font-medium text-gray-600">
              Contraseña
            </span>
            <div className="relative">
              <input
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
                className="w-full rounded-md border border-gray-300 px-3 py-2 pr-16 text-sm focus:border-belsue focus:outline-none focus:ring-1 focus:ring-belsue"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="absolute inset-y-0 right-2 my-auto text-xs font-medium text-belsue"
              >
                {showPassword ? "Ocultar" : "Mostrar"}
              </button>
            </div>
          </label>

          {error && (
            <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-600">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="flex w-full items-center justify-center gap-2 rounded-md bg-belsue px-4 py-2.5 text-sm font-medium text-white transition hover:bg-belsue-700 disabled:opacity-60"
          >
            {loading && (
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
            )}
            {loading ? "Entrando…" : "Entrar"}
          </button>
        </form>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}
