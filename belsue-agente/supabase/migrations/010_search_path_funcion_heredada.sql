-- Función heredada de una versión anterior de la búsqueda: no la llama nadie
-- en el código. Mientras siga existiendo, que no herede el search_path de
-- quien la invoque. Se puede eliminar cuando se confirme que no hace falta.
ALTER FUNCTION match_chunks_by_company(vector, text, double precision, integer)
  SET search_path = public, pg_temp;
