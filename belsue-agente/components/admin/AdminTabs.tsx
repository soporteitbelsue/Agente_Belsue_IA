import Link from "next/link";

/**
 * Pestañas de Administración. Estaban repetidas a mano en cada página, así que
 * añadir una obligaba a tocarlas todas y era fácil que se desincronizaran.
 */
const TABS = [
  { href: "/admin", label: "Conocimiento" },
  { href: "/admin/huecos", label: "Huecos" },
  { href: "/admin/formacion", label: "Formación" },
  { href: "/admin/usuarios", label: "Usuarios" },
  { href: "/admin/metrics", label: "Métricas" },
];

export default function AdminTabs({ active }: { active: string }) {
  return (
    <div className="flex flex-wrap gap-1 border-b border-gray-200">
      {TABS.map((tab) =>
        tab.href === active ? (
          <span
            key={tab.href}
            className="border-b-2 border-belsue px-4 py-2 text-sm font-semibold text-belsue"
          >
            {tab.label}
          </span>
        ) : (
          <Link
            key={tab.href}
            href={tab.href}
            className="border-b-2 border-transparent px-4 py-2 text-sm font-medium text-gray-500 hover:text-gray-700"
          >
            {tab.label}
          </Link>
        ),
      )}
    </div>
  );
}
