"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { MIN_PASSWORD_LENGTH } from "@/lib/password";

export default function CambiarContrasenaPage() {
  const router = useRouter();
  const { data: session, update } = useSession();

  // Cuando el usuario llega obligado por un reseteo no le enseñamos enlaces
  // de vuelta: el middleware se los devolvería aquí igualmente.
  const forced = session?.user?.mustChangePassword === true;

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [repeatPassword, setRepeatPassword] = useState("");
  const [show, setShow] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (newPassword !== repeatPassword) {
      setError("Las dos contraseñas nuevas no coinciden.");
      return;
    }
    if (newPassword.length < MIN_PASSWORD_LENGTH) {
      setError(
        `La contraseña debe tener al menos ${MIN_PASSWORD_LENGTH} caracteres.`,
      );
      return;
    }

    setSaving(true);
    try {
      const res = await fetch("/api/account/password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error ?? "No se ha podido cambiar la contraseña.");
      }

      // Relee el flag en el servidor: sin esto el middleware seguiría viendo
      // la obligación en el token y devolvería al usuario a esta página.
      await update();
      setDone(true);
      setCurrentPassword("");
      setNewPassword("");
      setRepeatPassword("");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error desconocido.");
    } finally {
      setSaving(false);
    }
  }

  const inputClass =
    "w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-belsue focus:outline-none focus:ring-1 focus:ring-belsue";

  return (
    <div className="mx-auto w-full max-w-[520px] px-4 py-10">
      <h1 className="text-2xl font-bold text-gray-800">Cambiar contraseña</h1>
      <p className="mt-1 text-sm text-gray-500">
        {session?.user?.email ?? "Tu cuenta"}
      </p>

      {forced && !done && (
        <div className="mt-5 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <strong className="font-semibold">
            Tienes que cambiar la contraseña para continuar.
          </strong>
          <p className="mt-1">
            Administración te ha puesto una contraseña temporal. Escríbela abajo
            como contraseña actual y elige una nueva que sólo conozcas tú.
          </p>
        </div>
      )}

      {done ? (
        <div className="mt-6 rounded-lg border border-green-200 bg-green-50 p-5">
          <p className="text-sm font-medium text-green-800">
            Contraseña actualizada correctamente.
          </p>
          <p className="mt-1 text-sm text-green-700">
            Úsala la próxima vez que inicies sesión.
          </p>
          <Link
            href="/"
            className="mt-4 inline-block rounded-md bg-belsue px-4 py-2 text-sm font-medium text-white hover:bg-belsue-700"
          >
            Ir a los portales
          </Link>
        </div>
      ) : (
        <form
          onSubmit={handleSubmit}
          className="mt-6 space-y-4 rounded-lg border border-gray-200 bg-white p-5 shadow-sm"
        >
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-gray-600">
              Contraseña actual
            </span>
            <input
              type={show ? "text" : "password"}
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              required
              autoComplete="current-password"
              disabled={saving}
              className={inputClass}
            />
          </label>

          <label className="block text-sm">
            <span className="mb-1 block font-medium text-gray-600">
              Contraseña nueva
            </span>
            <input
              type={show ? "text" : "password"}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              required
              autoComplete="new-password"
              disabled={saving}
              className={inputClass}
            />
            <span className="mt-1 block text-xs text-gray-400">
              Mínimo {MIN_PASSWORD_LENGTH} caracteres.
            </span>
          </label>

          <label className="block text-sm">
            <span className="mb-1 block font-medium text-gray-600">
              Repite la contraseña nueva
            </span>
            <input
              type={show ? "text" : "password"}
              value={repeatPassword}
              onChange={(e) => setRepeatPassword(e.target.value)}
              required
              autoComplete="new-password"
              disabled={saving}
              className={inputClass}
            />
          </label>

          <label className="flex items-center gap-2 text-sm text-gray-600">
            <input
              type="checkbox"
              checked={show}
              onChange={(e) => setShow(e.target.checked)}
              className="h-4 w-4 rounded border-gray-300 text-belsue focus:ring-belsue"
            />
            Mostrar las contraseñas
          </label>

          {error && (
            <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-600">
              {error}
            </p>
          )}

          <div className="flex items-center gap-3">
            <button
              type="submit"
              disabled={saving}
              className="rounded-md bg-belsue px-4 py-2.5 text-sm font-medium text-white transition hover:bg-belsue-700 disabled:opacity-60"
            >
              {saving ? "Guardando…" : "Cambiar contraseña"}
            </button>
            {!forced && (
              <Link
                href="/"
                className="text-sm font-medium text-gray-500 hover:underline"
              >
                Cancelar
              </Link>
            )}
          </div>
        </form>
      )}

      {forced && !done && (
        <p className="mt-4 text-center text-xs text-gray-400">
          ¿No recuerdas la contraseña temporal? Pídele a administración que te
          la vuelva a generar.
        </p>
      )}
    </div>
  );
}
