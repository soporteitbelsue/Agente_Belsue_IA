"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import type { User } from "@/types";

const DEPARTMENTS = [
  "Producción",
  "Siniestros",
  "Administración",
  "Dirección",
  "Departamento Tecnológico",
];

/** Genera una contraseña aleatoria segura de 12 caracteres. */
function generatePassword(length = 12): string {
  const chars =
    "abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789!@#$%&*";
  const values = new Uint32Array(length);
  crypto.getRandomValues(values);
  let out = "";
  for (let i = 0; i < length; i++) {
    out += chars[values[i]! % chars.length];
  }
  return out;
}

function RoleBadge({ role }: { role: string }) {
  const cls =
    role === "admin"
      ? "bg-belsue/10 text-belsue"
      : "bg-gray-100 text-gray-600";
  return (
    <span className={`rounded px-2 py-0.5 text-xs font-medium capitalize ${cls}`}>
      {role}
    </span>
  );
}

export default function UsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Formulario de creación
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<"asesor" | "admin">("asesor");
  const [department, setDepartment] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [copied, setCopied] = useState(false);
  const [creating, setCreating] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await fetch("/api/admin/users");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Error al cargar usuarios.");
      setUsers(data.users as User[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error desconocido.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    setOkMsg(null);

    if (!name.trim() || !email.trim() || password.length < 6) {
      setFormError(
        "Nombre, email y contraseña (mínimo 6 caracteres) son obligatorios.",
      );
      return;
    }

    setCreating(true);
    try {
      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          email: email.trim(),
          password,
          role,
          department: department.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Error al crear el usuario.");

      setOkMsg(`Usuario ${data.user.name} creado correctamente.`);
      setName("");
      setEmail("");
      setPassword("");
      setRole("asesor");
      setDepartment("");
      await load();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Error desconocido.");
    } finally {
      setCreating(false);
    }
  }

  async function changeRole(user: User, newRole: "asesor" | "admin") {
    try {
      const res = await fetch(`/api/admin/users/${user.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: newRole }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Error al cambiar el rol.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al cambiar el rol.");
    }
  }

  async function toggleActive(user: User) {
    try {
      const res = user.is_active
        ? await fetch(`/api/admin/users/${user.id}`, { method: "DELETE" })
        : await fetch(`/api/admin/users/${user.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ is_active: true }),
          });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Error al actualizar.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al actualizar.");
    }
  }

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 overflow-y-auto px-4 py-6">
      <div>
        <Link
          href="/chat"
          className="mb-2 inline-flex items-center gap-1 text-sm font-medium text-belsue hover:underline"
        >
          ← Volver al chat
        </Link>
        <h1 className="text-2xl font-bold text-gray-800">
          Gestión de usuarios
        </h1>
        <p className="text-sm text-gray-500">
          Da de alta a los trabajadores de Belsué y gestiona sus accesos.
        </p>
      </div>

      {/* Pestañas */}
      <div className="flex gap-1 border-b border-gray-200">
        <Link
          href="/admin"
          className="border-b-2 border-transparent px-4 py-2 text-sm font-medium text-gray-500 hover:text-gray-700"
        >
          Documentos
        </Link>
        <span className="border-b-2 border-belsue px-4 py-2 text-sm font-semibold text-belsue">
          Usuarios
        </span>
        <Link
          href="/admin/metrics"
          className="border-b-2 border-transparent px-4 py-2 text-sm font-medium text-gray-500 hover:text-gray-700"
        >
          Métricas
        </Link>
      </div>

      {/* Formulario de creación */}
      <form
        onSubmit={handleCreate}
        className="space-y-4 rounded-lg border border-gray-200 bg-white p-5 shadow-sm"
      >
        <h2 className="text-lg font-semibold text-gray-800">Crear usuario</h2>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="text-sm">
            <span className="mb-1 block font-medium text-gray-600">
              Nombre <span className="text-belsue">*</span>
            </span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              disabled={creating}
              className="w-full rounded-md border border-gray-300 px-3 py-2 focus:border-belsue focus:outline-none focus:ring-1 focus:ring-belsue"
            />
          </label>

          <label className="text-sm">
            <span className="mb-1 block font-medium text-gray-600">
              Email <span className="text-belsue">*</span>
            </span>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              disabled={creating}
              placeholder="nombre@belsue.es"
              className="w-full rounded-md border border-gray-300 px-3 py-2 focus:border-belsue focus:outline-none focus:ring-1 focus:ring-belsue"
            />
          </label>

          <label className="text-sm">
            <span className="mb-1 block font-medium text-gray-600">
              Contraseña <span className="text-belsue">*</span>
            </span>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    setCopied(false);
                  }}
                  required
                  disabled={creating}
                  placeholder="Mínimo 6 caracteres"
                  className="w-full rounded-md border border-gray-300 px-3 py-2 pr-9 focus:border-belsue focus:outline-none focus:ring-1 focus:ring-belsue"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? "Ocultar" : "Mostrar"}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  {showPassword ? (
                    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88" />
                    </svg>
                  ) : (
                    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                  )}
                </button>
              </div>
              <button
                type="button"
                onClick={() => {
                  setPassword(generatePassword());
                  setShowPassword(true);
                  setCopied(false);
                }}
                disabled={creating}
                className="shrink-0 rounded-md border border-belsue/40 px-3 py-2 text-xs font-medium text-belsue hover:bg-belsue/5"
              >
                Generar
              </button>
              <button
                type="button"
                onClick={async () => {
                  if (!password) return;
                  try {
                    await navigator.clipboard.writeText(password);
                    setCopied(true);
                  } catch {
                    /* sin portapapeles */
                  }
                }}
                disabled={creating || !password}
                className="shrink-0 rounded-md border border-gray-300 px-3 py-2 text-xs font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-40"
              >
                {copied ? "Copiado ✓" : "Copiar"}
              </button>
            </div>
            <span className="mt-1 block text-xs text-gray-400">
              El trabajador podrá usarla para entrar. Comunícasela de forma
              segura.
            </span>
          </label>

          <label className="text-sm">
            <span className="mb-1 block font-medium text-gray-600">Rol</span>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as "asesor" | "admin")}
              disabled={creating}
              className="w-full rounded-md border border-gray-300 px-3 py-2 focus:border-belsue focus:outline-none focus:ring-1 focus:ring-belsue"
            >
              <option value="asesor">Asesor</option>
              <option value="admin">Administrador</option>
            </select>
          </label>

          <label className="text-sm sm:col-span-2">
            <span className="mb-1 block font-medium text-gray-600">
              Departamento
            </span>
            <input
              value={department}
              onChange={(e) => setDepartment(e.target.value)}
              list="departamentos"
              disabled={creating}
              placeholder="Ej: Producción, Siniestros…"
              className="w-full rounded-md border border-gray-300 px-3 py-2 focus:border-belsue focus:outline-none focus:ring-1 focus:ring-belsue"
            />
            <datalist id="departamentos">
              {DEPARTMENTS.map((d) => (
                <option key={d} value={d} />
              ))}
            </datalist>
          </label>
        </div>

        {formError && (
          <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">
            {formError}
          </div>
        )}
        {okMsg && (
          <div className="rounded-md border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700">
            {okMsg}
          </div>
        )}

        <button
          type="submit"
          disabled={creating}
          className="w-full rounded-lg bg-belsue px-4 py-2.5 text-sm font-medium text-white hover:bg-belsue-700 disabled:opacity-40 sm:w-auto"
        >
          {creating ? "Creando…" : "Crear usuario"}
        </button>
      </form>

      {/* Lista de usuarios */}
      <div className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
        <h2 className="mb-4 text-lg font-semibold text-gray-800">
          Usuarios ({users.length})
        </h2>

        {error && <p className="mb-3 text-sm text-red-500">{error}</p>}
        {loading && <p className="text-sm text-gray-400">Cargando…</p>}

        {!loading && (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-gray-200 text-gray-500">
                <tr>
                  <th className="py-2 pr-4 font-medium">Nombre</th>
                  <th className="py-2 pr-4 font-medium">Email</th>
                  <th className="py-2 pr-4 font-medium">Rol</th>
                  <th className="py-2 pr-4 font-medium">Departamento</th>
                  <th className="py-2 pr-4 font-medium">Estado</th>
                  <th className="py-2 pr-4 font-medium">Últ. conexión</th>
                  <th className="py-2 font-medium">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr
                    key={u.id}
                    className={`border-b border-gray-100 ${
                      u.is_active ? "" : "opacity-50"
                    }`}
                  >
                    <td className="py-2 pr-4 font-medium text-gray-700">
                      {u.name}
                    </td>
                    <td className="py-2 pr-4 text-gray-500">{u.email}</td>
                    <td className="py-2 pr-4">
                      <RoleBadge role={u.role} />
                    </td>
                    <td className="py-2 pr-4 text-gray-500">
                      {u.department ?? "—"}
                    </td>
                    <td className="py-2 pr-4">
                      {u.is_active ? (
                        <span className="rounded bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
                          Activo
                        </span>
                      ) : (
                        <span className="rounded bg-gray-200 px-2 py-0.5 text-xs font-medium text-gray-600">
                          Inactivo
                        </span>
                      )}
                    </td>
                    <td className="py-2 pr-4 text-gray-500">
                      {u.last_login
                        ? new Date(u.last_login).toLocaleDateString("es-ES")
                        : "Nunca"}
                    </td>
                    <td className="py-2">
                      <div className="flex items-center gap-3">
                        <button
                          onClick={() =>
                            changeRole(
                              u,
                              u.role === "admin" ? "asesor" : "admin",
                            )
                          }
                          className="text-xs font-medium text-belsue hover:underline"
                        >
                          {u.role === "admin" ? "Hacer asesor" : "Hacer admin"}
                        </button>
                        <button
                          onClick={() => toggleActive(u)}
                          className={`text-xs font-medium hover:underline ${
                            u.is_active ? "text-red-600" : "text-green-600"
                          }`}
                        >
                          {u.is_active ? "Desactivar" : "Reactivar"}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {users.length === 0 && (
                  <tr>
                    <td colSpan={7} className="py-4 text-center text-gray-400">
                      No hay usuarios todavía.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
