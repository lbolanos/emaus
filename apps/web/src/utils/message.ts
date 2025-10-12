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
						.map((node) => {
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
						.map((node) => {
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
						.map((node) => {
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
						const spaceCount =
							textAlign === 'center'
								? Math.floor((MAX_LINE_LENGTH - content.length) / 2)
								: MAX_LINE_LENGTH - content.length;
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
						if (
							node.nodeType === Node.ELEMENT_NODE &&
							(node as Element).tagName.toLowerCase() === 'li'
						) {
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
						if (
							node.nodeType === Node.ELEMENT_NODE &&
							(node as Element).tagName.toLowerCase() === 'li'
						) {
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
						const spaceCount =
							textAlign === 'center'
								? Math.floor((MAX_LINE_LENGTH - content.length) / 2)
								: MAX_LINE_LENGTH - content.length;
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

// Email formatting functions are now imported from @repo/utils to avoid duplication

/**
 * Detects if the browser supports rich text clipboard operations
 */
export const supportsRichTextClipboard = (): boolean => {
	try {
		// Check if document.execCommand is available (required for rich text copy)
		return typeof document.execCommand === 'function' && document.queryCommandSupported('copy');
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
		preferredMethod,
	};
};

/**
 * Enhanced user feedback messages with detailed format information
 */
export const getFormatSpecificMessage = (
	format: 'rich' | 'html' | 'text',
	success: boolean,
): string => {
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
export const createFallbackCopyMethod = (
	text: string,
): Promise<{
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
				message:
					'📋 Texto listo para copiar manualmente\n\nPor favor, selecciona el texto en el cuadro de diálogo y cópialo con Ctrl+C.',
				details: 'Método: Diálogo manual (foco no requerido)',
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
				message:
					'❌ No se pudo mostrar el diálogo de copia\n\nPor favor, copia el texto manualmente desde la vista previa.',
				details: `Error en fallback: ${e instanceof Error ? e.message : String(e)}`,
			});
		}
	});
};

/**
 * Copies rich text formatted content to clipboard
 * This creates a temporary div with the HTML content, selects it, and copies it with formatting
 */
export const copyRichTextToClipboard = async (
	html: string,
): Promise<{
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
				details: `Método fallido: ${method}. Capacidad del navegador: ${JSON.stringify(capabilities)}`,
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
							details: 'Método: Selection API (rich text)',
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
				const plainText = String(html)
					.replace(/<[^>]*>/g, ' ')
					.replace(/\s+/g, ' ')
					.trim();
				const textBlob = new Blob([plainText], { type: 'text/plain' });

				const htmlItem = new ClipboardItem({
					'text/html': htmlBlob,
					'text/plain': textBlob,
				});

				await navigator.clipboard.write([htmlItem]);
				return {
					success: true,
					format: 'html',
					message: getFormatSpecificMessage('html', true),
					details: 'Método: Clipboard API (HTML)',
				};
			} catch (e) {
				const error = e as Error;
				return handleError(error, 'HTML clipboard API', 'text');
			}
		}

		// Fallback 2: Copy as plain text using modern API
		const plainText = String(html)
			.replace(/<[^>]*>/g, ' ')
			.replace(/\s+/g, ' ')
			.trim();

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
					details: 'Método: Clipboard API (texto plano)',
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
			details: `Error general: ${errorObj.message}`,
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
			.replace(/\n\s*\n/g, '\n') // Remove empty lines
			.replace(/^\s+|\s+$/g, '') // Remove leading/trailing whitespace
			.replace(/\n\s*</g, '\n<'); // Fix indentation before tags

		return formatted.trim();
	} catch (error) {
		console.error('Error beautifying HTML:', error);
		return html; // Return original HTML if beautification fails
	}
};

/**
 * Interface for participant data structure
 */
// Import shared interfaces and functions from @repo/utils
export type { ParticipantData, RetreatData } from '@repo/utils';
export {
	replaceAllVariables,
	replaceParticipantVariables,
	replaceRetreatVariables,
	convertHtmlToEmail,
	detectEmailClient,
} from '@repo/utils';

// Shared utility functions are now imported from @repo/utils
