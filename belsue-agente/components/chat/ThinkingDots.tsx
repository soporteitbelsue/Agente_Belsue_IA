/**
 * Tres puntos saltando: se muestran mientras el agente busca y prepara la
 * respuesta, antes de que llegue el primer trozo de texto.
 *
 * Es el momento más largo de la conversación —búsqueda de fragmentos más
 * primera respuesta del modelo—, y sin nada en pantalla parece que no funciona.
 */
export default function ThinkingDots() {
  return (
    <span
      className="flex items-center gap-1.5 py-1"
      role="status"
      aria-label="El asistente está preparando la respuesta"
    >
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          aria-hidden
          className="thinking-dot block h-1.5 w-1.5 rounded-full bg-belsue"
          style={{ animationDelay: `${i * 0.16}s` }}
        />
      ))}
    </span>
  );
}
