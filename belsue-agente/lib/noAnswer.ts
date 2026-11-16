/**
 * Reconoce una respuesta en la que el agente dice que no ha encontrado la
 * información. El modelo no siempre usa la misma frase exacta, así que
 * reconocemos las formas habituales: "no encuentro / no dispongo de / no tengo
 * esa información", "no aparece/consta/figura en los documentos ni notas", etc.
 *
 * Se usa en el servidor para avisar por correo del hueco de conocimiento y en
 * el chat para no presentar como "documentos consultados" los que no sirvieron.
 */
export const NO_ANSWER_RE =
  /no\s+(?:encuentro|dispongo\s+de|tengo|hay|consta|aparece|figura|puedo\s+(?:encontrar|ofrecer|proporcionar|dar))\b[\s\S]{0,60}?(?:informaci|dato|document|nota|belsu)/i;
