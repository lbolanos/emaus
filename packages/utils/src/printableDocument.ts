/**
 * Documento imprimible A4 compartido por el navegador y el servidor.
 *
 * Vive aquí, y no en `apps/web`, porque el PDF se genera de dos maneras y
 * ambas deben producir EXACTAMENTE el mismo papel:
 *  - el navegador, con `window.print()` (composable `usePrintableDocument`);
 *  - el API, con Chrome headless, que además le añade los marcadores.
 * Si el diseño se duplicara, las dos rutas divergirían a la primera semana.
 *
 * El diseño reproduce los .docx originales de las preparaciones: Cambria para
 * los títulos y Calibri para el cuerpo, rótulos de sección en versalitas
 * azules (#002060) y tabla con cabecera azul (#4F81BD) sobre texto blanco.
 * Los valores salen de `word/styles.xml`, no están inventados.
 */

const INK = '#1f2328';
const NAVY = '#16365C'; // títulos principales
const BLUE = '#002060'; // rótulos de sección
const STEEL = '#4F81BD'; // acentos y cabecera de tabla
const SLATE = '#365F91'; // subtítulos
const MIST = '#DCE6F1'; // filetes y fondos suaves
const TEAL = '#215868'; // citas

export const PRINT_STYLESHEET = `
  /* Al imprimir desde el navegador el encabezado va solo en la primera hoja.
     El PDF del servidor ignora este @page: usa los márgenes de Chrome para
     poder pintar encabezado y pie en CADA página. */
  @page { size: A4; margin: 22mm 16mm 18mm; }

  body {
    font-family: Calibri, Carlito, Candara, 'Segoe UI', 'Helvetica Neue', Arial, sans-serif;
    font-size: 11pt; line-height: 1.42; color: ${INK};
    max-width: 720px; margin: 0 auto; padding: 8mm;
    -webkit-print-color-adjust: exact; print-color-adjust: exact;
  }

  /* Encabezado corrido, como el del .docx: a la izquierda el retiro, a la
     derecha la preparación y su fecha. En impresión se fija dentro del margen
     superior con position:fixed, que es como Chrome repite un elemento en
     todas las páginas (no soporta los margin-boxes @top-left de Paged Media). */
  .running-head {
    display: flex; justify-content: space-between; align-items: flex-start; gap: 12pt;
    font-size: 8.5pt; color: ${SLATE};
    border-bottom: 0.5pt solid ${MIST}; padding-bottom: 4pt; margin-bottom: 14pt;
  }
  .running-head .rh-right { text-align: right; white-space: pre-line; color: ${NAVY}; font-weight: 600; }

  /* Título del documento: versalitas centradas sobre un filete, como el original */
  header.doc-head {
    text-align: center; padding: 0 0 7pt; margin: 0 0 16pt;
    border-bottom: 1.5pt solid ${STEEL};
  }
  header.doc-head h1 {
    font-family: Cambria, 'Palatino Linotype', Georgia, serif;
    font-size: 17pt; font-weight: 700; color: ${NAVY};
    font-variant: small-caps; letter-spacing: 0.3pt;
    margin: 0; border: none; padding: 0;
  }

  h1, h2, h3, h4 {
    font-family: Cambria, 'Palatino Linotype', Georgia, serif;
    line-height: 1.25;
  }
  h1 { font-size: 18pt; color: ${NAVY}; border-bottom: 2pt solid ${STEEL}; padding-bottom: 4pt; margin: 0 0 12pt; }
  /* Rótulos de sección: versalitas azules sobre un filete, como el original */
  h2 {
    font-size: 13pt; font-weight: 700; color: ${BLUE};
    font-variant: small-caps; letter-spacing: 0.2pt;
    margin: 18pt 0 8pt; padding-bottom: 3pt; border-bottom: 0.75pt solid ${MIST};
  }
  h3 { font-size: 12pt; font-weight: 700; color: ${SLATE}; font-variant: small-caps; margin: 14pt 0 6pt; }
  h4 { font-size: 11pt; color: ${SLATE}; margin: 12pt 0 4pt; }

  p { margin: 0 0 8pt; text-align: justify; hyphens: auto; }
  strong { color: ${BLUE}; }

  /* Párrafos rotulados ("Tema:", "Objetivo:", "Dónde estamos:"): sangría
     francesa con el rótulo en su propia columna, como en el .docx. La clase la
     pone el script de la ventana, que sí puede medir cuál es un rótulo. */
  p.labeled { padding-left: 92pt; text-indent: -92pt; }
  p.labeled > strong:first-child {
    display: inline-block; width: 84pt; vertical-align: top;
    color: ${BLUE}; text-indent: 0;
  }

  /* Oraciones y citas bíblicas */
  blockquote {
    margin: 10pt 0; padding: 9pt 14pt;
    background: #F5F8FC; border-left: 3pt solid ${STEEL};
    color: ${TEAL}; font-style: italic;
  }
  blockquote p { margin: 0 0 5pt; text-align: left; }
  blockquote p:last-child { margin-bottom: 0; }
  blockquote strong { color: ${TEAL}; }

  /* Calendario de preparaciones y demás tablas */
  table {
    border-collapse: collapse; width: 100%; margin: 10pt 0 14pt;
    font-size: 10pt; box-shadow: none;
  }
  thead th {
    background: ${STEEL}; color: #fff;
    font-family: Cambria, Georgia, serif; font-weight: 700;
    text-align: left; padding: 6pt 8pt;
    border: 1pt solid #fff;
  }
  tbody td {
    padding: 5pt 8pt; border: 0.75pt solid #B8CCE4;
    vertical-align: top;
  }
  tbody tr:nth-child(even) td { background: #EDF2F9; }
  /* Columna del número de semana: angosta y centrada */
  tbody td:first-child, thead th:first-child { text-align: center; width: 8%; font-weight: 700; color: ${NAVY}; }

  ul, ol { padding-left: 18pt; margin: 0 0 10pt; }
  li { margin: 3pt 0; }
  li::marker { color: ${STEEL}; }

  code { background: #F1F4F8; padding: 1pt 3pt; border-radius: 2pt; font-size: 9.5pt; }
  hr { border: none; border-top: 0.75pt solid ${MIST}; margin: 14pt 0; }
  /* max-height acota las ilustraciones del .docx, que vienen a tamaño natural
     y si no se comen media página impresa. */
  img { max-width: 100%; max-height: 105mm; width: auto; height: auto; display: block; margin: 12pt auto; }
  a { color: ${SLATE}; }

  @media print {
    body { max-width: none; padding: 0; }
    /* Nada de position:fixed para repetirlo: Chrome lo pinta al pie y encima
       del texto. El encabezado por página lo pone el generador de PDF con el
       headerTemplate de Chrome; aquí queda solo en la primera hoja. */
    h1, h2, h3, h4 { page-break-after: avoid; break-after: avoid; }
    tr, blockquote, img, li { page-break-inside: avoid; break-inside: avoid; }
    thead { display: table-header-group; }
    p { orphans: 3; widows: 3; }
  }
`;

/** Marca los párrafos rotulados para darles sangría francesa. */
const LABELED_SCRIPT = `
    // Sangría francesa para los párrafos rotulados ("Tema:", "Objetivo:",
    // "Dónde estamos:"). Se hace aquí y no en CSS porque hay que medir el
    // rótulo: un párrafo entero en negrita no es un rótulo y no debe sangrarse.
    Array.prototype.forEach.call(document.querySelectorAll('p'), function (p) {
      var first = p.firstElementChild;
      if (!first || first !== p.firstChild || first.tagName !== 'STRONG') return;
      var label = (first.textContent || '').trim();
      var rest = (p.textContent || '').slice(label.length).trim();
      if (label.length > 24 || !rest) return;
      if (!/[:：]$/.test(label) && !/^[:：]/.test(rest)) return;
      // Si el markdown deja los dos puntos fuera de la negrita ("**Amor**: …"),
      // pasarlos al rótulo: si no, quedan flotando solos en la columna del texto.
      var next = first.nextSibling;
      if (!/[:：]$/.test(label) && next && next.nodeType === 3) {
        first.textContent = label + ':';
        next.nodeValue = next.nodeValue.replace(/^\\s*[:：]\\s*/, ' ');
      }
      p.className = 'labeled';
    });
`;

export interface PrintableDocumentData {
	/** Encabezado del documento y `<title>` de la página. */
	title: string;
	/** Contexto a la izquierda del encabezado corrido: parroquia, retiro… */
	subtitle?: string;
	/**
	 * Fecha y hora a la que pertenece el documento, a la derecha del
	 * encabezado corrido. En las preparaciones es la sesión dueña del
	 * documento: sin ella, el papel impreso no dice a qué reunión corresponde.
	 * Admite varias líneas con `\n`.
	 */
	meta?: string;
	/** Cuerpo YA renderizado a HTML y sanitizado por el caller. */
	bodyHtml: string;
}

export interface PrintableHtmlOptions {
	/**
	 * Base para resolver las rutas raíz-relativas de las imágenes
	 * (`/preparation-assets/...`). Obligatoria en la ventana del navegador,
	 * que se abre como `about:blank` y no tiene base propia.
	 */
	baseHref?: string;
	/** Dispara el diálogo de impresión al cargar (ventana del navegador). */
	autoPrint?: boolean;
	/** Ruta que el navegador muestra en el pie de página al imprimir. */
	printPath?: string;
	/**
	 * Omite el encabezado del cuerpo. Lo usa el generador de PDF, que lo pinta
	 * en el margen de cada página con el headerTemplate de Chrome.
	 */
	omitRunningHead?: boolean;
}

export function escapeHtmlText(value: string): string {
	return value
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;');
}

/** Ruta legible para el pie de página que imprime el navegador. */
export function printableSlug(value: string): string {
	return (
		value
			.normalize('NFD')
			.replace(/[\u0300-\u036f]/g, '')
			.replace(/[^a-zA-Z0-9]+/g, '-')
			.replace(/^-|-$/g, '')
			.toLowerCase()
			.slice(0, 60) || 'documento'
	);
}

/**
 * Documento HTML completo listo para imprimir o para pasarle a Chrome.
 *
 * El `<script>` del final solo toca el DOM (sangría de los rótulos) y, cuando
 * `autoPrint`, lanza la impresión. Chrome headless lo ejecuta igual, así que
 * el servidor obtiene la misma maquetación que el navegador.
 */
export function buildPrintableHtml(
	data: PrintableDocumentData,
	options: PrintableHtmlOptions = {},
): string {
	const title = escapeHtmlText(data.title);
	const runningHead =
		!options.omitRunningHead && (data.subtitle || data.meta)
			? `<div class="running-head"><span class="rh-left">${escapeHtmlText(
					data.subtitle ?? '',
				)}</span><span class="rh-right">${escapeHtmlText(data.meta ?? '')}</span></div>`
			: '';
	const base = options.baseHref ? `<base href="${escapeHtmlText(options.baseHref)}" />` : '';

	const printPath = options.printPath ?? `/imprimir/${printableSlug(data.title)}`;
	// Chrome imprime la URL de la ventana en el pie. Abierta con
	// `window.open('')` sería "about:blank", que afea el PDF; la ventana hereda
	// nuestro origen, así que se puede reescribir a algo legible. Quitar el pie
	// del todo no se puede por CSS: solo con `@page { margin: 0 }`, que dejaría
	// sin margen las páginas 2 en adelante.
	const rename = options.autoPrint
		? `    try { history.replaceState(null, '', ${JSON.stringify(printPath)}); } catch (e) {}\n`
		: '';

	const autoPrint = options.autoPrint
		? `
    function done() { setTimeout(function () { window.print(); }, 50); }
    var pending = Array.prototype.filter.call(
      document.images, function (img) { return !img.complete; }
    );
    if (!pending.length) { done(); }
    else {
      var left = pending.length;
      var fired = false;
      var finish = function () { if (!fired) { fired = true; done(); } };
      pending.forEach(function (img) {
        var tick = function () { if (--left === 0) finish(); };
        img.addEventListener('load', tick);
        img.addEventListener('error', tick);
      });
      setTimeout(finish, 3000);
    }
    window.addEventListener('afterprint', function () { window.close(); });`
		: '';

	return `<!DOCTYPE html>
<html lang="es"><head><meta charset="UTF-8" />
${base}
<title>${title}</title>
<style>${PRINT_STYLESHEET}</style></head><body>
${runningHead}
<header class="doc-head"><h1>${title}</h1></header>
${data.bodyHtml}
<script>
  (function () {
${rename}${LABELED_SCRIPT}${autoPrint}
  })();
</` + `script>
</body></html>`;
}
