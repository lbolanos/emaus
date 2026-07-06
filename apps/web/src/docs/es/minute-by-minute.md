# Minuto a Minuto

La **agenda en vivo del retiro**, dividida por días. Cada item es una actividad con su hora, duración, responsable y guion. Reemplaza la "hoja minuto a minuto" en papel: el coordinador la maneja desde aquí en tiempo real y los servidores ven los cambios al instante en sus dispositivos.

📺 **[Ver video tutorial (2 min)](https://youtu.be/YYwjzHcumpA)**

## Durante el retiro (controles en cada fila)

- **▶ Iniciar**: marca el item como "en curso". Notifica al responsable y aparece como AHORA en la pantalla pública.
- **✓ Completar**: cierra el item activo. Solo aparece cuando el item está en curso.
- **−5 / +5**: corre el item (y los siguientes del día) por 5 minutos hacia atrás o adelante.
- **📎 Documentos**: abre los guiones del rol (markdown editable, PDF, imágenes). El número es el conteo.
- **Click en la fila**: abre el modal completo (hora, duración, responsable, notas, status, horarios reales).

## Reordenar items (drag & drop)

Solo cuando agrupas **por Día**: arrastra una fila sobre otra del mismo día para intercambiar sus posiciones. Las horas se preservan (cada slot conserva su hora original); cambia **qué** item ocupa cada slot. Útil si el coordinador decide intercambiar dos charlas o mover una al final.

## Menú "Más acciones" (⋮)

- **🔔 Tocar campana**: dispara una notificación en pantalla a todos los servidores conectados (pasa a comedor, capilla, etc.).
- **🖨 Imprimir**: vista de impresión con todo el calendario en A4.
- **📦 Descargar guiones (zip)**: bundle con todos los markdowns y PDFs del retiro, organizados por carpeta de responsabilidad. Útil para llevar offline.
- **📺 Copiar link de pantalla pública**: vista big-screen sin login en `/mam/<slug>` para proyectar en el salón. Refleja en vivo lo que el coordinador marca como AHORA.
- **⏱ Mover día**: corre todos los items del día por N minutos. Útil cuando se atrasa el retiro completo.
- **✨ Auto-asignar angelitos**: rellena los slots de Santísimo durante comidas con participantes tipo "Angelito" disponibles.
- **📥 Importar desde template** (sobrescribe): borra todos los items actuales y materializa de nuevo desde el template. **Cuidado: pierde shifts y reorders.**

## Pantalla pública

El link `/mam/<slug>` abre una vista sin autenticación pensada para proyectar. Muestra la actividad marcada como AHORA y la siguiente, y se actualiza en tiempo real conforme el coordinador avanza la agenda.
