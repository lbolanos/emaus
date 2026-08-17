import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { printMarkdownDocument, PRINT_STYLESHEET } from '../usePrintableDocument';

function makeFakeWindow() {
  const written: string[] = [];
  return {
    written,
    document: {
      write: (html: string) => written.push(html),
      close: vi.fn(),
      images: [] as unknown[],
    },
    print: vi.fn(),
    close: vi.fn(),
    addEventListener: vi.fn(),
  };
}

describe('printMarkdownDocument', () => {
  let fakeWin: ReturnType<typeof makeFakeWindow>;

  beforeEach(() => {
    fakeWin = makeFakeWindow();
    vi.stubGlobal('open', vi.fn(() => fakeWin));
  });

  afterEach(() => {
    // Un stub global olvidado contamina los demás tests del archivo.
    vi.unstubAllGlobals();
  });

  const html = () => fakeWin.written.join('');

  it('inyecta <base> con el origen: sin esto las imágenes no cargan en about:blank', () => {
    printMarkdownDocument({ title: 'Servicio', markdown: '# Hola' });
    expect(html()).toContain(`<base href="${window.location.origin}/" />`);
  });

  it('renderiza el markdown a HTML y arrastra la hoja de estilos A4', () => {
    printMarkdownDocument({
      title: 'Servicio',
      markdown: '| # | Fecha |\n| --- | --- |\n| 1 | hoy |',
    });
    expect(html()).toContain('<table>');
    expect(html()).toContain(PRINT_STYLESHEET);
    // Margen superior amplio: ahí se fija el encabezado corrido.
    expect(html()).toContain('@page { size: A4; margin: 22mm 16mm 18mm; }');
  });

  it('la hoja replica el diseño del .docx original (Cambria/Calibri y azules)', () => {
    // Valores sacados de word/styles.xml de las preparaciones: si alguien los
    // cambia por genéricos, el PDF vuelve a verse plano.
    expect(PRINT_STYLESHEET).toContain('Cambria');
    expect(PRINT_STYLESHEET).toContain('Calibri');
    expect(PRINT_STYLESHEET).toContain('#002060'); // rótulos de sección
    expect(PRINT_STYLESHEET).toContain('#4F81BD'); // cabecera de tabla
    expect(PRINT_STYLESHEET).toContain('print-color-adjust: exact'); // o no imprime los fondos
  });

  it('escapa el título, el subtítulo y la fecha en el encabezado', () => {
    printMarkdownDocument({
      title: 'Servicio & <Humildad>',
      markdown: 'texto',
      subtitle: 'Parroquia "San Agustín"',
      meta: 'lunes, 1 de junio & 20:00',
    });
    expect(html()).toContain('Servicio &amp; &lt;Humildad&gt;');
    expect(html()).toContain('Parroquia &quot;San Agustín&quot;');
    expect(html()).toContain('lunes, 1 de junio &amp; 20:00');
  });

  it('sanitiza el HTML del markdown antes de escribirlo', () => {
    printMarkdownDocument({
      title: 'Doc',
      markdown: 'hola <img src=x onerror="alert(1)">',
    });
    expect(html()).not.toContain('onerror');
  });

  it('espera a que carguen las imágenes antes de imprimir', () => {
    printMarkdownDocument({ title: 'Doc', markdown: '![x](/preparation-assets/a/img.png)' });
    expect(html()).toContain('document.images');
    expect(html()).toContain('window.print()');
  });

  it('reescribe la URL para que el pie no imprima "about:blank"', () => {
    printMarkdownDocument({ title: '1ª preparación — Servicio', markdown: 'x' });
    expect(html()).toContain('history.replaceState');
    // Acentos y símbolos fuera; queda una ruta legible en el pie de página.
    expect(html()).toContain('"/imprimir/1-preparacion-servicio"');
  });

  it('pone el retiro a la izquierda y la fecha de la sesión a la derecha del encabezado corrido', () => {
    printMarkdownDocument({
      title: 'Servicio',
      markdown: 'x',
      subtitle: 'Buen Despacho',
      meta: '1ª preparación · miércoles, 26 de agosto de 2026 · 20:00',
    });
    expect(html()).toContain('<span class="rh-left">Buen Despacho</span>');
    expect(html()).toContain(
      '<span class="rh-right">1ª preparación · miércoles, 26 de agosto de 2026 · 20:00</span>',
    );
    // Nada de position:fixed para repetirlo por página: Chrome lo pinta al pie
    // y encima del texto. La repetición la hace el PDF del servidor con
    // headerTemplate; aquí el encabezado va solo en la primera hoja.
    expect(PRINT_STYLESHEET).not.toContain('position: fixed');
  });

  it('omite el encabezado corrido cuando no hay contexto ni fecha', () => {
    printMarkdownDocument({ title: 'Guion', markdown: 'x' });
    // El selector vive siempre en la hoja de estilos: lo que no debe existir
    // es el elemento.
    expect(html()).not.toContain('<div class="running-head">');
  });

  it('marca los párrafos rotulados para darles sangría francesa', () => {
    printMarkdownDocument({ title: 'Doc', markdown: '**Tema:** algo' });
    // El marcado corre en la ventana: aquí se comprueba que va el script y su
    // regla de estilo, no el resultado del DOM hijo.
    expect(html()).toContain("p.className = 'labeled'");
    expect(PRINT_STYLESHEET).toContain('p.labeled');
  });

  it('avisa y devuelve false cuando el navegador bloquea el popup', () => {
    vi.stubGlobal('open', vi.fn(() => null));
    const onPopupBlocked = vi.fn();
    const result = printMarkdownDocument({ title: 'Doc', markdown: 'x', onPopupBlocked });
    expect(result).toBe(false);
    expect(onPopupBlocked).toHaveBeenCalledOnce();
  });

  it('cierra el documento tras escribirlo', () => {
    expect(printMarkdownDocument({ title: 'Doc', markdown: 'x' })).toBe(true);
    expect(fakeWin.document.close).toHaveBeenCalledOnce();
  });
});
