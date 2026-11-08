import { LETTER_PALANQUERO_NONE } from '@repo/types';
import type { LetterFolderRow } from '@repo/types';

export { LETTER_PALANQUERO_NONE };

/**
 * ¿La carpeta es del palanquero elegido? '' = todos; LETTER_PALANQUERO_NONE =
 * caminantes sin palanquero asignado (null o cadena vacía, como en el API).
 * Bandeja (lista del filtro de caminante, alcance de impresión) y Carpetas
 * filtran con esta misma regla.
 */
export const folderMatchesPalanquero = (folder: LetterFolderRow, palanquero: string): boolean => {
	if (!palanquero) return true;
	if (palanquero === LETTER_PALANQUERO_NONE) return !folder.palancasCoordinator;
	return folder.palancasCoordinator === palanquero;
};
