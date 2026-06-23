"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { signIn } from "next-auth/react";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get("callbackUrl") || "/chat";

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

      router.push(callbackUrl);
      router.refresh();
    } catch {
      setError("No se ha podido iniciar sesión. Inténtalo de nuevo.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-white px-4">
      <div className="mb-6 flex flex-col items-center">
        <span className="flex h-12 w-12 items-center justify-center rounded-full bg-belsue text-lg font-bold text-white">
          B
        </span>
        <h1 className="mt-3 text-2xl font-bold text-belsue">Asistente Belsué</h1>
      </div>

      <div className="w-full max-w-[400px] rounded-xl border border-gray-100 bg-white p-6 shadow-lg">
        <p className="mb-5 text-center text-sm text-gray-500">
          Accede con tu cuenta de asesor
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
