/**
 * Reglas y generación de contraseñas, compartidas por el navegador y el
 * servidor. No importa nada de Node ni de React a propósito: la usan tanto
 * el panel de administración (componente de cliente) como las rutas de API.
 */

/** Longitud mínima aceptada al crear o cambiar una contraseña. */
export const MIN_PASSWORD_LENGTH = 8;

/**
 * Alfabeto sin caracteres que se confunden al dictar o al copiar a mano:
 * nada de 0/O, 1/l/I ni símbolos. Las contraseñas temporales se comunican
 * por teléfono o en persona, así que priorizamos que se entiendan.
 */
const ALPHABET = "abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";

/** Devuelve `count` caracteres aleatorios del alfabeto (CSPRNG). */
function randomChars(count: number): string {
  const values = new Uint32Array(count);
  crypto.getRandomValues(values);
  let out = "";
  for (let i = 0; i < count; i++) {
    out += ALPHABET[values[i]! % ALPHABET.length];
  }
  return out;
}

/**
 * Contraseña temporal en tres grupos de cuatro (`xK4m-9Rtq-2Lp7`).
 * Los guiones son sólo para leerla en voz alta; cuentan como caracteres.
 * Doce caracteres de este alfabeto son ~70 bits de entropía, de sobra para
 * algo que además hay que cambiar en el primer acceso.
 */
export function generateTempPassword(): string {
  return [randomChars(4), randomChars(4), randomChars(4)].join("-");
}

/**
 * Comprueba una contraseña elegida por una persona.
 * Devuelve el motivo del rechazo, o null si es válida.
 */
export function describePasswordProblem(password: string): string | null {
  if (password.length < MIN_PASSWORD_LENGTH) {
    return `La contraseña debe tener al menos ${MIN_PASSWORD_LENGTH} caracteres.`;
  }
  if (password.trim().length === 0) {
    return "La contraseña no puede ser sólo espacios.";
  }
  return null;
}
