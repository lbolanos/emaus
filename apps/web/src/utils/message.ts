/**
 * Utility functions for message formatting and conversion
 */

const MAX_LINE_LENGTH = 100;

/**
 * Converts HTML content to WhatsApp-compatible text format
 * Handles text formatting (bold, italic, underline) and text alignment
 */
export const convertHtmlToWhatsApp = (html: string): string => {
  // Create a temporary div to parse HTML
  const tempDiv = document.createElement('div');
  tempDiv.innerHTML = html;

  // Convert HTML to WhatsApp format
  let whatsappText = '';

  const processNode = (node: Node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      // Preserve all text content including emojis, but handle whitespace
      const textContent = node.textContent || '';
      whatsappText += textContent.trim();
      // Skip pure whitespace/indentation from HTML formatting
    } else if (node.nodeType === Node.ELEMENT_NODE) {
      const element = node as Element;

      switch (element.tagName.toLowerCase()) {
        case 'strong':
        case 'b': {
          // Process all child nodes to preserve formatting within bold text
          const content = Array.from(element.childNodes)
            .map(node => {
              if (node.nodeType === Node.TEXT_NODE) {
                return node.textContent || '';
              } else {
                // For nested elements, recursively process them
                let nestedText = '';
                const processNestedNode = (nestedNode: Node) => {
                  if (nestedNode.nodeType === Node.TEXT_NODE) {
                    nestedText += nestedNode.textContent || '';
                  } else if (nestedNode.nodeType === Node.ELEMENT_NODE) {
                    const nestedElement = nestedNode as Element;
                    switch (nestedElement.tagName.toLowerCase()) {
                      case 'br':
                        nestedText += '\n';
                        break;
                      default:
                        Array.from(nestedElement.childNodes).forEach(processNestedNode);
                    }
                  }
                };
                processNestedNode(node);
                return nestedText;
              }
            })
            .join('');
          whatsappText += ` *${content.trim()}* `;
          break;
        }
        case 'em':
        case 'i': {
          // Process all child nodes to preserve formatting within italic text
          const content = Array.from(element.childNodes)
            .map(node => {
              if (node.nodeType === Node.TEXT_NODE) {
                return node.textContent || '';
              } else {
                // For nested elements, recursively process them
                let nestedText = '';
                const processNestedNode = (nestedNode: Node) => {
                  if (nestedNode.nodeType === Node.TEXT_NODE) {
                    nestedText += nestedNode.textContent || '';
                  } else if (nestedNode.nodeType === Node.ELEMENT_NODE) {
                    const nestedElement = nestedNode as Element;
                    switch (nestedElement.tagName.toLowerCase()) {
                      case 'br':
                        nestedText += '\n';
                        break;
                      default:
                        Array.from(nestedElement.childNodes).forEach(processNestedNode);
                    }
                  }
                };
                processNestedNode(node);
                return nestedText;
              }
            })
            .join('');
          whatsappText += ` _${content.trim()}_ `;
          break;
        }
        case 'u': {
          // Process all child nodes to preserve formatting within underlined text
          const content = Array.from(element.childNodes)
            .map(node => {
              if (node.nodeType === Node.TEXT_NODE) {
                return node.textContent || '';
              } else {
                // For nested elements, recursively process them
                let nestedText = '';
                const processNestedNode = (nestedNode: Node) => {
                  if (nestedNode.nodeType === Node.TEXT_NODE) {
                    nestedText += nestedNode.textContent || '';
                  } else if (nestedNode.nodeType === Node.ELEMENT_NODE) {
                    const nestedElement = nestedNode as Element;
                    switch (nestedElement.tagName.toLowerCase()) {
                      case 'br':
                        nestedText += '\n';
                        break;
                      default:
                        Array.from(nestedElement.childNodes).forEach(processNestedNode);
                    }
                  }
                };
                processNestedNode(node);
                return nestedText;
              }
            })
            .join('');
          whatsappText += ` ~${content.trim()}~ `;
          break;
        }
        case 'p': {
          // Process all child nodes to preserve formatting within paragraphs
          const htmlElement = element as HTMLElement;
          const textAlign = htmlElement.style.textAlign || htmlElement.getAttribute('align');

          if (textAlign === 'center' || textAlign === 'right') {
            // Calculate spaces needed for alignment
            const content = element.textContent || '';
            const spaceCount = textAlign === 'center' ? Math.floor((MAX_LINE_LENGTH - content.length) / 2) : (MAX_LINE_LENGTH - content.length);
            const spaces = ' '.repeat(Math.max(0, spaceCount));

            whatsappText += spaces;
            Array.from(element.childNodes).forEach(processNode);
            if (textAlign === 'center') {
              whatsappText += spaces;
            }
          } else {
            Array.from(element.childNodes).forEach(processNode);
          }
          whatsappText += '\n';
          break;
        }
        case 'br':
          whatsappText += '\n';
          break;
        case 'ul': {
          Array.from(element.childNodes).forEach((node) => {
            if (node.nodeType === Node.ELEMENT_NODE && (node as Element).tagName.toLowerCase() === 'li') {
              whatsappText += '• ';
              processNode(node);
              whatsappText += '\n';
            } else if (node.nodeType === Node.TEXT_NODE && node.textContent?.trim()) {
              // Handle direct text content in UL (unusual but possible)
              whatsappText += `• ${node.textContent.trim()}\n`;
            }
          });
          break;
        }
        case 'ol': {
          let listIndex = 1;
          Array.from(element.childNodes).forEach((node) => {
            if (node.nodeType === Node.ELEMENT_NODE && (node as Element).tagName.toLowerCase() === 'li') {
              whatsappText += `${listIndex}. `;
              processNode(node);
              whatsappText += '\n';
              listIndex++;
            } else if (node.nodeType === Node.TEXT_NODE && node.textContent?.trim()) {
              // Handle direct text content in OL (unusual but possible)
              whatsappText += `${listIndex}. ${node.textContent.trim()}\n`;
              listIndex++;
            }
          });
          break;
        }
        case 'li': {
          // Process all child nodes of the li element to preserve formatting
          Array.from(element.childNodes).forEach(processNode);
          break;
        }
        case 'span': {
          // Handle spans (like those used for variables or emojis)
          // Check if it's a variable span (with background color)
          const htmlElement = element as HTMLElement;
          if (htmlElement.style.backgroundColor) {
            // For variables, just use the text content
            whatsappText += element.textContent || '';
          } else {
            // For regular spans, process child nodes
            Array.from(element.childNodes).forEach(processNode);
          }
          break;
        }
        case 'div': {
          // Handle div containers
          const htmlElement = element as HTMLElement;
          const textAlign = htmlElement.style.textAlign || htmlElement.getAttribute('align');

          if (textAlign === 'center' || textAlign === 'right') {
            // Calculate spaces needed for alignment
            const content = element.textContent || '';
            const spaceCount = textAlign === 'center' ? Math.floor((MAX_LINE_LENGTH - content.length) / 2) : (MAX_LINE_LENGTH - content.length);
            const spaces = ' '.repeat(Math.max(0, spaceCount));

            whatsappText += spaces;
            Array.from(element.childNodes).forEach(processNode);
            if (textAlign === 'center') {
              whatsappText += spaces;
            }
          } else {
            Array.from(element.childNodes).forEach(processNode);
          }
          break;
        }
        default: {
          // Process child nodes for any other elements
          Array.from(element.childNodes).forEach(processNode);
          break;
        }
      }
    }
  };

  Array.from(tempDiv.childNodes).forEach(processNode);

  // Clean up extra whitespace and line breaks but preserve emojis
  const cleanedText = whatsappText.trim();

  // Remove excessive line breaks (3 or more become 2)
  // cleanedText = cleanedText.replace(/\n{3,}/g, '\n\n');

  // Ensure emojis and other Unicode characters are preserved
  // This step is important because sometimes the HTML parsing can alter Unicode

  return cleanedText;
};

/**
 * Test function to debug emoji conversion
 */
export const testEmojiConversion = (text: string): string => {
  //console.log('Original text:', text);
  //console.log('Text length:', text.length);
  //console.log('Text char codes:', Array.from(text).map(char => char.charCodeAt(0)));

  // Test if emojis are preserved
  const hasEmojis = /[\p{Emoji_Presentation}\p{Emoji}\u200D]+/gu.test(text);
  //console.log('Has emojis:', hasEmojis);

  return text;
};

/**
 * Converts HTML content to email-compatible format with inline CSS and JavaScript support
 */
export const convertHtmlToEmail = (html: string, options: {
  format?: 'basic' | 'enhanced' | 'outlook';
  includeJavaScript?: boolean;
  preserveStyles?: boolean;
} = {}): string => {
  const {
    format = 'enhanced',
    includeJavaScript = true,
    preserveStyles = true
  } = options;

  try {
    // Create a temporary div to parse HTML
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = html;

    // Extract any styles from style tags
    const styles: { [key: string]: string } = {};
    const styleTags = tempDiv.querySelectorAll('style');
    styleTags.forEach(styleTag => {
      const cssRules = styleTag.textContent || '';
      // Simple CSS parsing for common properties
      const rules = cssRules.match(/([^{]+)\{([^}]*)\}/g);
      if (rules) {
        rules.forEach(rule => {
          const [selector, properties] = rule.split('{');
          const cleanSelector = selector.trim();
          const cleanProps = properties.replace('}', '').trim();
          styles[cleanSelector] = cleanProps;
        });
      }
      styleTag.remove();
    });

    // Extract JavaScript
    let javascript = '';
    const scriptTags = tempDiv.querySelectorAll('script');
    if (includeJavaScript) {
      scriptTags.forEach(scriptTag => {
        javascript += scriptTag.textContent + '\n';
        scriptTag.remove();
      });
    }

    // Process HTML and inline styles
    const processNode = (node: Node): string => {
      if (node.nodeType === Node.TEXT_NODE) {
        return node.textContent || '';
      } else if (node.nodeType === Node.ELEMENT_NODE) {
        const element = node as Element;
        const tagName = element.tagName.toLowerCase();

        let attributes = '';
        let inlineStyle = '';

        // Handle different email formats
        if (preserveStyles) {
          // Apply matching styles as inline CSS
          Object.entries(styles).forEach(([selector, properties]) => {
            if (element.matches(selector)) {
              inlineStyle += properties + '; ';
            }
          });

          // Add existing inline styles
          const existingStyle = (element as HTMLElement).getAttribute('style') || '';
          if (existingStyle) {
            inlineStyle += existingStyle;
          }

          if (inlineStyle.trim()) {
            attributes += ` style="${inlineStyle.trim()}"`;
          }
        }

        // Add other attributes
        Array.from(element.attributes).forEach(attr => {
          if (attr.name !== 'style') {
            attributes += ` ${attr.name}="${attr.value}"`;
          }
        });

        // Process content based on tag type
        let content = '';
        Array.from(element.childNodes).forEach(child => {
          content += processNode(child);
        });

        // Special handling for different elements
        switch (tagName) {
          case 'div':
          case 'p':
            return `<div${attributes}>${content}</div>`;
          case 'strong':
          case 'b':
            return `<strong${attributes}>${content}</strong>`;
          case 'em':
          case 'i':
            return `<em${attributes}>${content}</em>`;
          case 'u':
            return `<u${attributes}>${content}</u>`;
          case 'br':
            return '<br>';
          case 'ul':
            return `<ul${attributes}>${content}</ul>`;
          case 'ol':
            return `<ol${attributes}>${content}</ol>`;
          case 'li':
            return `<li${attributes}>${content}</li>`;
          case 'span':
            return `<span${attributes}>${content}</span>`;
          case 'img':
            return `<img${attributes} />`;
          case 'a':
            return `<a${attributes}>${content}</a>`;
          case 'table':
            return `<table${attributes} border="1" cellpadding="5" cellspacing="0">${content}</table>`;
          case 'td':
          case 'th':
            return `<${tagName}${attributes}>${content}</${tagName}>`;
          default:
            return `<${tagName}${attributes}>${content}</${tagName}>`;
        }
      }
      return '';
    };

    // Process all nodes
    let emailContent = '';
    Array.from(tempDiv.childNodes).forEach(node => {
      emailContent += processNode(node);
    });

    // Create email template based on format
    const emailTemplate = createEmailTemplate(emailContent, {
      format,
      javascript: includeJavaScript ? javascript : undefined
    });

    return emailTemplate;
  } catch (error) {
    console.error('Error converting HTML to email:', error);
    // Fallback to basic HTML
    return `<div>${html}</div>`;
  }
};

/**
 * Detects email client and suggests appropriate format
 */
export const detectEmailClient = (): string => {
  const userAgent = navigator.userAgent.toLowerCase();

  if (userAgent.includes('outlook') || userAgent.includes('windows mail')) {
    return 'outlook';
  } else if (userAgent.includes('gmail') || userAgent.includes('google')) {
    return 'enhanced';
  } else if (userAgent.includes('yahoo')) {
    return 'basic';
  } else if (userAgent.includes('iphone') || userAgent.includes('ipad')) {
    return 'enhanced';
  } else if (userAgent.includes('android')) {
    return 'basic';
  }

  return 'enhanced'; // Default fallback
};

/**
 * Creates email template with proper structure and fallbacks
 */
const createEmailTemplate = (content: string, options: {
  format: 'basic' | 'enhanced' | 'outlook';
  javascript?: string;
}): string => {
  const { format, javascript } = options;

  // Fallback content for non-HTML email clients
  const textFallback = `
    <!-- Fallback content for text-only email clients -->
    <div style="display:none;font-size:0;color:#ffffff;line-height:0;mso-hide:all">
      ${content.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()}
    </div>
  `;

  const baseStyles = `
    body {
      font-family: Arial, sans-serif, 'Helvetica Neue', sans-serif;
      line-height: 1.6;
      margin: 0;
      padding: 20px;
      background-color: #f5f5f5;
      -webkit-text-size-adjust: 100%;
      -ms-text-size-adjust: 100%;
    }
    .email-container {
      max-width: 600px;
      margin: 0 auto;
      background-color: white;
      padding: 30px;
      border-radius: 8px;
      box-shadow: 0 2px 10px rgba(0,0,0,0.1);
    }
    .email-header {
      text-align: center;
      margin-bottom: 30px;
      border-bottom: 2px solid #e0e0e0;
      padding-bottom: 20px;
    }
    .email-body {
      margin-bottom: 30px;
    }
    .email-footer {
      text-align: center;
      color: #666;
      font-size: 12px;
      border-top: 1px solid #e0e0e0;
      padding-top: 20px;
    }
    img {
      max-width: 100%;
      height: auto;
    }
    table {
      border-collapse: collapse;
      width: 100%;
    }
    td, th {
      border: 1px solid #ddd;
      padding: 8px;
      text-align: left;
    }
    th {
      background-color: #f2f2f2;
      font-weight: bold;
    }
  `;

  const outlookStyles = `
    <!--[if mso]>
    <style>
      table { border-collapse: collapse; mso-table-lspace: 0pt; mso-table-rspace: 0pt; }
      .email-container { width: 600px; }
      .email-body { font-family: Arial, sans-serif; }
    </style>
    <![endif]-->
  `;

  const enhancedStyles = `
    <style>
      ${baseStyles}
      @media only screen and (max-width: 600px) {
        .email-container {
          width: 100% !important;
          padding: 20px !important;
          margin: 0 !important;
        }
        body {
          padding: 10px !important;
        }
        table {
          width: 100% !important;
        }
        img {
          max-width: 100% !important;
          height: auto !important;
        }
      }
      @media screen and (max-device-width: 480px) {
        .email-container {
          padding: 15px !important;
        }
      }
    </style>
  `;

  const javascriptContent = javascript ? `
    <script>
      // Simple JavaScript for email clients that support it
      ${javascript}

      // Fallback for email clients that don't support JS
      document.addEventListener('DOMContentLoaded', function() {
        if (window.location.href.indexOf('no-js=true') > -1) {
          document.body.innerHTML = '<div style="padding: 20px; font-family: Arial, sans-serif;">' +
            '<h2>Email View</h2><p>This email contains interactive elements that require JavaScript support.</p>' +
            '<p>Please view this email in a modern email client or web browser.</p></div>';
        }
      });
    </script>
  ` : '';

  // Client compatibility note
  const compatibilityNote = `
    <div style="font-size: 11px; color: #999; margin-top: 20px; padding: 10px; background: #f9f9f9; border-left: 3px solid #ddd;">
      <strong>Nota de compatibilidad:</strong> Este email está optimizado para ${format === 'outlook' ? 'Outlook' : format === 'basic' ? 'clientes básicos' : 'clientes modernos'}.
      Si no se ve correctamente, por favor abre este email en un navegador web.
    </div>
  `;

  switch (format) {
    case 'basic':
      return `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <meta http-equiv="X-UA-Compatible" content="IE=edge">
          <title>Email Message</title>
          <style>
            ${baseStyles}
          </style>
        </head>
        <body>
          ${textFallback}
          <div class="email-container">
            <div class="email-body">
              ${content}
            </div>
            <div class="email-footer">
              Generated by Email System
            </div>
            ${compatibilityNote}
          </div>
          ${javascriptContent}
        </body>
        </html>
      `;

    case 'enhanced':
      return `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <meta http-equiv="X-UA-Compatible" content="IE=edge">
          <title>Email Message</title>
          ${enhancedStyles}
        </head>
        <body>
          ${textFallback}
          <div class="email-container">
            <div class="email-body">
              ${content}
            </div>
            <div class="email-footer">
              Generated by Email System
            </div>
            ${compatibilityNote}
          </div>
          ${javascriptContent}
        </body>
        </html>
      `;

    case 'outlook':
      return `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <meta http-equiv="X-UA-Compatible" content="IE=edge">
          <title>Email Message</title>
          ${outlookStyles}
          <style>
            ${baseStyles}
          </style>
        </head>
        <body>
          ${textFallback}
          <table class="email-container" align="center" border="0" cellpadding="0" cellspacing="0" width="600">
            <tr>
              <td class="email-body">
                ${content}
                ${compatibilityNote}
              </td>
            </tr>
            <tr>
              <td class="email-footer">
                Generated by Email System
              </td>
            </tr>
          </table>
          ${javascriptContent}
        </body>
        </html>
      `;

    default:
      return content;
  }
};

/**
 * Detects if the browser supports rich text clipboard operations
 */
export const supportsRichTextClipboard = (): boolean => {
  try {
    // Check if document.execCommand is available (required for rich text copy)
    return typeof document.execCommand === 'function' &&
           document.queryCommandSupported('copy');
  } catch (e) {
    return false;
  }
};

/**
 * Detects available clipboard formats and capabilities
 */
export const detectClipboardCapabilities = (): {
  supportsRichText: boolean;
  supportsHtml: boolean;
  supportsPlainText: boolean;
  isSecureContext: boolean;
  preferredMethod: 'rich' | 'html' | 'text';
} => {
  const supportsRichText = supportsRichTextClipboard();
  const supportsHtml = !!(navigator.clipboard && window.ClipboardItem);
  const supportsPlainText = !!(navigator.clipboard && navigator.clipboard.writeText);
  const isSecureContext = window.isSecureContext;

  // Determine preferred method based on capabilities
  let preferredMethod: 'rich' | 'html' | 'text' = 'text';
  if (supportsRichText) {
    preferredMethod = 'rich';
  } else if (supportsHtml) {
    preferredMethod = 'html';
  } else if (supportsPlainText) {
    preferredMethod = 'text';
  }

  return {
    supportsRichText,
    supportsHtml,
    supportsPlainText,
    isSecureContext,
    preferredMethod
  };
};

/**
 * Enhanced user feedback messages with detailed format information
 */
export const getFormatSpecificMessage = (format: 'rich' | 'html' | 'text', success: boolean): string => {
  if (!success) {
    return '❌ Error al copiar al portapapeles\n\nPor favor, haz clic en el botón de copiar y mantén el foco en la página durante el proceso.';
  }

  switch (format) {
    case 'rich':
      return '✅ ¡Contenido formateado copiado!\n\nEl contenido incluye:\n• Negritas y cursivas\n• Colores y alineación\n• Listas y tablas\n\nPega en cualquier editor que soporte formato enriquecido.';

    case 'html':
      return '✅ ¡HTML copiado!\n\nEl código HTML está listo para:\n• Editores de correo electrónico\n• Aplicaciones web\n• Sistemas de CMS\n\nEl formato se mantendrá al pegar.';

    case 'text':
      return '✅ ¡Texto copiado!\n\nEl texto plano ha sido copiado.\nIdeal para:\n• Mensajes simples\n• Notas rápidas\n• Aplicaciones que no soportan formato';

    default:
      return '✅ ¡Copiado al portapapeles!';
  }
};

/**
 * Creates a user-friendly fallback method that works without document focus
 */
export const createFallbackCopyMethod = (text: string): Promise<{
  success: boolean;
  format: 'text';
  message: string;
  details: string;
}> => {
  return new Promise((resolve) => {
    try {
      // Create a more user-friendly fallback
      const fallbackDiv = document.createElement('div');
      fallbackDiv.innerHTML = `
        <div style="position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%);
                    background: white; border: 2px solid #007cba; border-radius: 8px;
                    padding: 20px; z-index: 9999; box-shadow: 0 4px 20px rgba(0,0,0,0.3);
                    font-family: Arial, sans-serif; max-width: 400px;">
          <h3 style="margin: 0 0 15px 0; color: #007cba;">📋 Copiar al portapapeles</h3>
          <p style="margin: 0 0 15px 0; color: #333;">
            Selecciona y copia el texto manualmente:
          </p>
          <textarea readonly style="width: 100%; height: 100px; border: 1px solid #ddd;
                                  border-radius: 4px; padding: 8px; font-family: monospace;
                                  resize: vertical;" onclick="this.select()">${text}</textarea>
          <div style="margin-top: 15px; text-align: center;">
            <button onclick="this.closest('div').remove()"
                    style="background: #007cba; color: white; border: none; padding: 8px 16px;
                           border-radius: 4px; cursor: pointer; font-size: 14px;">
              Cerrar
            </button>
          </div>
        </div>
      `;

      document.body.appendChild(fallbackDiv);

      // Auto-select the text
      const textarea = fallbackDiv.querySelector('textarea');
      if (textarea) {
        textarea.focus();
        textarea.select();
      }

      resolve({
        success: true,
        format: 'text',
        message: '📋 Texto listo para copiar manualmente\n\nPor favor, selecciona el texto en el cuadro de diálogo y cópialo con Ctrl+C.',
        details: 'Método: Diálogo manual (foco no requerido)'
      });

      // Auto-remove after 10 seconds
      setTimeout(() => {
        if (document.body.contains(fallbackDiv)) {
          fallbackDiv.remove();
        }
      }, 10000);

    } catch (e) {
      resolve({
        success: false,
        format: 'text',
        message: '❌ No se pudo mostrar el diálogo de copia\n\nPor favor, copia el texto manualmente desde la vista previa.',
        details: `Error en fallback: ${e instanceof Error ? e.message : String(e)}`
      });
    }
  });
};

/**
 * Copies rich text formatted content to clipboard
 * This creates a temporary div with the HTML content, selects it, and copies it with formatting
 */
export const copyRichTextToClipboard = async (html: string): Promise<{
  success: boolean;
  format: 'rich' | 'html' | 'text';
  message: string;
  details?: string;
}> => {
  try {
    // Detect clipboard capabilities first
    const capabilities = detectClipboardCapabilities();
    console.log('Clipboard capabilities:', capabilities);


    // Enhanced error handling with detailed feedback
    const handleError = (error: Error, method: string, fallbackTo?: 'html' | 'text') => {
      console.error(`${method} failed:`, error);
      return {
        success: false,
        format: fallbackTo || 'text',
        message: `Error en ${method}: ${error.message}`,
        details: `Método fallido: ${method}. Capacidad del navegador: ${JSON.stringify(capabilities)}`
      };
    };

    // First, try rich text copy using Selection API
    if (capabilities.supportsRichText) {
      let tempDiv: HTMLDivElement | null = null;
      try {
        // Create a temporary div to hold the HTML content
        tempDiv = document.createElement('div');
        tempDiv.innerHTML = html;
        tempDiv.style.position = 'absolute';
        tempDiv.style.left = '-9999px';
        tempDiv.style.top = '-9999px';
        tempDiv.style.width = '1px';
        tempDiv.style.height = '1px';
        tempDiv.style.overflow = 'hidden';

        document.body.appendChild(tempDiv);

        // Select the content
        const range = document.createRange();
        range.selectNodeContents(tempDiv);

        const selection = window.getSelection();
        if (selection) {
          selection.removeAllRanges();
          selection.addRange(range);

          // Try to copy the selected rich text
          // Note: document.execCommand is deprecated but still needed for rich text copy
          const successful = document.execCommand('copy');

          // Clean up selection
          selection.removeAllRanges();
          document.body.removeChild(tempDiv);

          if (successful) {
            return {
              success: true,
              format: 'rich',
              message: getFormatSpecificMessage('rich', true),
              details: 'Método: Selection API (rich text)'
            };
          }
        }
      } catch (e) {
        if (tempDiv && document.body.contains(tempDiv)) {
          document.body.removeChild(tempDiv);
        }
        const error = e as Error;
        return handleError(error, 'Rich text copy', 'html');
      }
    }

    // Fallback 1: Try HTML clipboard API (if available)
    if (capabilities.supportsHtml && capabilities.isSecureContext) {
      try {
        // Check if document has focus for clipboard API
        if (!document.hasFocus()) {
          console.log('Document not focused, skipping HTML clipboard API');
          throw new Error('Document not focused');
        }

        const htmlBlob = new Blob([html], { type: 'text/html' });
        const plainText = String(html).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
        const textBlob = new Blob([plainText], { type: 'text/plain' });

        const htmlItem = new ClipboardItem({
          'text/html': htmlBlob,
          'text/plain': textBlob
        });

        await navigator.clipboard.write([htmlItem]);
        return {
          success: true,
          format: 'html',
          message: getFormatSpecificMessage('html', true),
          details: 'Método: Clipboard API (HTML)'
        };
      } catch (e) {
        const error = e as Error;
        return handleError(error, 'HTML clipboard API', 'text');
      }
    }

    // Fallback 2: Copy as plain text using modern API
    const plainText = String(html).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();

    if (capabilities.supportsPlainText && capabilities.isSecureContext) {
      try {
        // Check if document has focus for clipboard API
        if (!document.hasFocus()) {
          console.log('Document not focused, skipping plain text clipboard API');
          throw new Error('Document not focused');
        }

        await navigator.clipboard.writeText(plainText);
        return {
          success: true,
          format: 'text',
          message: getFormatSpecificMessage('text', true),
          details: 'Método: Clipboard API (texto plano)'
        };
      } catch (e) {
        const error = e as Error;
        console.log('Plain text clipboard failed, trying legacy method:', error);
      }
    }

    // Fallback 3: User-friendly dialog method when document focus is not available
    return await createFallbackCopyMethod(plainText);

  } catch (error) {
    console.error('Error in copyRichTextToClipboard:', error);
    const errorObj = error as Error;
    return {
      success: false,
      format: 'text',
      message: getFormatSpecificMessage('text', false),
      details: `Error general: ${errorObj.message}`
    };
  }
};

/**
 * Simple HTML beautification function
 */
export const beautifyHtml = (html: string): string => {
  try {
    // Simple HTML beautification function
    let formatted = '';
    let indent = 0;
    const tab = '  ';

    // Remove existing formatting first
    html = html.replace(/>\s+</g, '><').trim();

    for (let i = 0; i < html.length; i++) {
      const char = html[i];

      if (char === '<') {
        // Check if it's a closing tag
        if (html[i + 1] === '/') {
          if (indent > 0) indent--;
          formatted += '\n' + tab.repeat(indent);
        } else if (html[i + 1] !== '!' && html.slice(i, i + 9) !== '<![CDATA[') {
          // It's an opening tag
          formatted += '\n' + tab.repeat(indent);
          indent++;
        }
      }

      formatted += char;

      if (char === '>') {
        // Check if it's a self-closing tag or opening tag without immediate closing
        const nextChar = html[i + 1];
        if (html[i - 1] !== '/' && nextChar !== '<' && nextChar !== undefined) {
          formatted += '\n' + tab.repeat(indent);
        }
      }
    }

    // Clean up excessive newlines and indentation
    formatted = formatted
      .replace(/\n\s*\n/g, '\n')  // Remove empty lines
      .replace(/^\s+|\s+$/g, '')  // Remove leading/trailing whitespace
      .replace(/\n\s*</g, '\n<'); // Fix indentation before tags

    return formatted.trim();
  } catch (error) {
    console.error('Error beautifying HTML:', error);
    return html; // Return original HTML if beautification fails
  }
};