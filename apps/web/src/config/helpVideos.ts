// Videos de ayuda por feature (YouTube). El botón <HelpVideoButton :feature="..." />
// se oculta solo si la feature no tiene URL, así que podés dejar entradas vacías
// hasta que subas el video (con e2e/demo/upload-to-youtube.mjs) y pegues acá la URL.

export interface HelpVideo {
  /** URL de YouTube (youtu.be/... o youtube.com/watch?v=...). Vacío → sin botón. */
  url: string;
  /** Texto opcional del tooltip / aria-label. */
  title?: string;
}

export const helpVideos: Record<string, HelpVideo> = {
  'pre-retreat-tasks': {
    url: 'https://youtu.be/pPguV-Gg7Bs',
    title: 'Ver video: Tareas Pre-Retiro',
  },
};

export function getHelpVideo(feature: string): HelpVideo | undefined {
  const v = helpVideos[feature];
  return v && v.url ? v : undefined;
}
