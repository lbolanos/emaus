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
  let cleanedText = whatsappText.trim();

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