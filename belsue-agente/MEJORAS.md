# Mejoras del Agente IA de Belsué

Ideas y mejoras pendientes para el asistente interno de la correduría.
Marca con `[x]` lo que se vaya completando y añade tus notas donde quieras.

> **Leyenda de esfuerzo/valor:** 🟢 rápido · 🟡 medio · 🔴 grande | ⭐ valor para el corredor

---

## ✅ Ya hecho

- [x] Chat RAG que responde solo con los documentos indexados y cita fuentes
- [x] Panel de administración: subida de PDF/DOCX/TXT con metadatos
- [x] Login por rol (admin / asesor) con NextAuth
- [x] Historial de conversaciones y panel de métricas
- [x] **Notas de conocimiento**: meter información suelta (reglas, trucos por
      compañía) sin subir documento; se indexa igual que un PDF
- [x] **Personalidad de asesor de corredor**: el agente habla con un corredor
      profesional (no con el cliente final), usa jerga técnica y da respuestas
      accionables
- [x] **Aportar conocimiento desde el chat**: todos los usuarios pueden añadir
      notas (con autor registrado)
- [x] **Gestión de usuarios** en /admin/usuarios: alta con generador de
      contraseña + mostrar/ocultar, roles y activar/desactivar
- [x] **Editar notas** de conocimiento (con re-indexado automático)
- [x] **Sección "Conocimiento del equipo"** (/conocimiento): todos ven y buscan
      las notas aportadas por el equipo

---

## 🎯 Ganancias rápidas (poco esfuerzo, mucho valor)

- [ ] **Editar notas de conocimiento** 🟢 — ahora solo se crean y borran;
      poder corregir una nota sin rehacerla.
- [ ] **Revivir el glosario** 🟢 ⭐ — existe una tabla `glossary` (17 términos)
      que el código no usa. Mostrarla como sección consultable e inyectarla en
      el chat para que el agente entienda/explique jerga del sector.
- [ ] **Valoración 👍 / 👎 en las respuestas** 🟢 ⭐ — la tabla `messages` ya
      tiene una columna `feedback` preparada. Añadir los botones y un panel de
      "respuestas marcadas como malas" para saber dónde falta conocimiento.
- [ ] **Preguntas sugeridas** 🟢 — botones de ejemplo en el chat vacío
      ("Comparar multirriesgo hostelería", "Garantías clave en decesos"…) para
      arrancar rápido.

---

## 🛠️ Herramientas para el corredor (más potentes)

- [ ] **Resumen automático de póliza** 🟡 ⭐⭐ — subes un PDF y devuelve
      garantías, exclusiones, límites y franquicias en una ficha. Ideal para
      leer condicionados rápido.
- [ ] **Comparador de compañías** 🔴 ⭐⭐ — tabla por garantía
      (Mapfre vs Allianz vs AXA…) que el agente rellena desde documentos/notas.
- [ ] **Generador de textos al cliente** 🟡 ⭐ — redacta el correo de
      presupuesto, la explicación de una cobertura o el aviso de renovación,
      en tono para cliente final (lo revisa el corredor).
- [ ] **Checklist de datos para cotizar** por ramo 🟢 — qué pedir al cliente
      para auto, hogar, vida, etc.

---

## 📊 Gestión y mejora continua

- [ ] **Buscador de documentos** en el panel 🟢 — ahora solo se filtra por
      compañía/categoría.
- [ ] **Panel de "lagunas de conocimiento"** 🟡 ⭐ — preguntas que el agente no
      supo responder → qué documentos/notas faltan.
- [ ] **Exportar conversación a PDF** 🟡 — para adjuntar a un expediente.

---

## 📱 Acceso

- [ ] **Versión / acceso móvil** 🔴 — consultar en visita con el cliente.

---

## 🧠 Recordatorio de conceptos

- **System prompt** = las instrucciones que definen *cómo* actúa el agente
  (su personalidad y reglas). Está en `app/api/chat/route.ts`.
- **Notas y documentos** = definen *qué sabe* el agente. Cuanto más
  conocimiento real (criterios de suscripción por compañía, comisiones, trucos
  de tarificación…), mejor asesora.
- No se "reentrena" el modelo: se ajustan el system prompt y el conocimiento.

---

## ✍️ Notas propias

_(Espacio para apuntar tus ideas, prioridades o dudas.)_

-
-
-
