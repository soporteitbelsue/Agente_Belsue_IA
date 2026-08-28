/**
 * Cómo se convierte un contacto en el texto que lee el agente.
 *
 * Va en su propio módulo y SIN imports para que puedan usarlo tanto la
 * aplicación (`lib/contacts.ts`) como los scripts de `scripts/`, que se
 * ejecutan con ts-node y no resuelven el alias `@/`. Si el formato cambia,
 * cambia en los dos sitios a la vez.
 */

/**
 * Categoría con la que se marcan los documentos que genera la agenda. Sirve
 * para localizar el documento de una compañía al reindexar y para dejarlos
 * fuera del listado de conocimiento.
 */
export const CONTACTS_CATEGORY = "contactos";

/** Lo mínimo que necesita un contacto para poder escribirse. */
export interface ContactoLegible {
  company: string;
  department?: string | null;
  phone?: string | null;
  phone2?: string | null;
  mobile?: string | null;
  fax?: string | null;
  email?: string | null;
  address?: string | null;
  city?: string | null;
  postal_code?: string | null;
  province?: string | null;
  notes?: string | null;
}

const VIAS: { campo: keyof ContactoLegible; etiqueta: string }[] = [
  { campo: "phone", etiqueta: "Teléfono" },
  { campo: "phone2", etiqueta: "Teléfono 2" },
  { campo: "mobile", etiqueta: "Móvil" },
  { campo: "fax", etiqueta: "Fax" },
  { campo: "email", etiqueta: "Correo" },
];

const POSTAL: (keyof ContactoLegible)[] = [
  "address",
  "city",
  "postal_code",
  "province",
];

/**
 * Un contacto en una línea. Se omiten los campos vacíos: la mayoría de
 * contactos solo tienen una o dos vías, y arrastrar "Fax: —" por toda la
 * agenda solo diluiría el embedding.
 */
export function contactoATexto(c: ContactoLegible): string {
  const quien = c.department ? `${c.company} — ${c.department}` : c.company;

  const vias = VIAS.filter((v) => c[v.campo])
    .map((v) => `${v.etiqueta}: ${c[v.campo]}`)
    .join(". ");

  const direccion = POSTAL.map((k) => c[k])
    .filter(Boolean)
    .join(", ");

  return [quien, vias, direccion, c.notes]
    .filter((p) => p && String(p).trim())
    .join(". ");
}

/** Texto completo de una compañía: un contacto por línea. */
export function companiaATexto(contactos: ContactoLegible[]): string {
  return contactos.map(contactoATexto).join("\n");
}

/** Nombre del documento indexado de una compañía. */
export function nombreDocumentoContactos(company: string): string {
  return `Contactos de ${company}`;
}

/** Descripción del documento indexado de una compañía. */
export function descripcionDocumentoContactos(company: string): string {
  return `Agenda de contactos de ${company}, mantenida por el equipo.`;
}
