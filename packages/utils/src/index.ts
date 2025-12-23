/**
 * Shared utility functions for message template variable replacement
 * Used by both API and web applications to avoid code duplication
 */

/**
 * Interface for participant data structure
 */
export interface ParticipantData {
	firstName?: string;
	lastName?: string;
	nickname?: string;
	type?: string;
	birthDate?: string;
	maritalStatus?: string;
	street?: string;
	houseNumber?: string;
	postalCode?: string;
	neighborhood?: string;
	city?: string;
	state?: string;
	country?: string;
	parish?: string;
	homePhone?: string;
	workPhone?: string;
	cellPhone?: string;
	email?: string;
	occupation?: string;
	snores?: boolean;
	hasMedication?: boolean;
	medicationDetails?: string;
	medicationSchedule?: string;
	hasDietaryRestrictions?: boolean;
	dietaryRestrictionsDetails?: string;
	sacraments?: string[];
	emergencyContact1Name?: string;
	emergencyContact1Relation?: string;
	emergencyContact1HomePhone?: string;
	emergencyContact1WorkPhone?: string;
	emergencyContact1CellPhone?: string;
	emergencyContact1Email?: string;
	emergencyContact2Name?: string;
	emergencyContact2Relation?: string;
	emergencyContact2HomePhone?: string;
	emergencyContact2WorkPhone?: string;
	emergencyContact2CellPhone?: string;
	emergencyContact2Email?: string;
	tshirtSize?: string;
	invitedBy?: string;
	isInvitedByEmausMember?: boolean;
	inviterHomePhone?: string;
	inviterWorkPhone?: string;
	inviterCellPhone?: string;
	inviterEmail?: string;
	family_friend_color?: string;
	pickupLocation?: string;
	arrivesOnOwn?: boolean;
	paymentDate?: string;
	paymentAmount?: number;
	isScholarship?: boolean;
	palancasCoordinator?: string;
	palancasRequested?: boolean;
	palancasReceived?: string;
	palancasNotes?: string;
	requestsSingleRoom?: boolean;
	isCancelled?: boolean;
	notes?: string;
	registrationDate?: string;
	lastUpdatedDate?: string;
	tableMesa?: { name: string };
	retreatBed?: { roomNumber: string; bedNumber: string };
}

/**
 * Interface for retreat data structure
 */
export interface RetreatData {
	parish?: string;
	startDate?: string | Date;
	endDate?: string | Date;
	openingNotes?: string;
	closingNotes?: string;
	thingsToBringNotes?: string;
	cost?: string;
	paymentInfo?: string;
	paymentMethods?: string;
	max_walkers?: number;
	max_servers?: number;
	walkerArrivalTime?: string;
	serverArrivalTimeFriday?: string;
	retreat_type?: string;
	retreat_number_version?: string;
}

/**
 * Format date avoiding timezone shifts caused by UTC to local conversion
 * Handles ISO datetime strings (e.g., 2025-12-26T00:00:00.000Z) and YYYY-MM-DD formats
 */
export function formatDate(date: Date | string): string {
	// Handle ISO datetime strings (e.g., 2025-12-26T00:00:00.000Z) or YYYY-MM-DD
	if (typeof date === 'string') {
		const match = date.match(/^(\d{4}-\d{2}-\d{2})/);
		if (match) {
			const [year, month, day] = match[1].split('-').map(Number);
			return new Date(year, month - 1, day).toLocaleDateString();
		}
	}
	// For Date objects - use UTC components to avoid timezone shift
	const d = typeof date === 'string' ? new Date(date) : date;
	return new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()).toLocaleDateString();
}

/**
 * Replaces all participant variables in a message template with actual participant data
 * Uses mock data if participant is undefined or null
 */
export const replaceParticipantVariables = (
	message: string,
	participant: ParticipantData | null | undefined,
): string => {
	// Use mock data if participant is undefined or null
	const mockParticipant: ParticipantData = {
		firstName: 'Juan',
		lastName: 'Pérez',
		nickname: 'Juancho',
		type: 'WALKER',
		birthDate: '1990-05-15',
		maritalStatus: 'Soltero',
		street: 'Calle Principal',
		houseNumber: '123',
		postalCode: '12345',
		neighborhood: 'Centro',
		city: 'Ciudad de México',
		state: 'Ciudad de México',
		country: 'México',
		parish: 'San Judas Tadeo',
		homePhone: '555-123-4567',
		workPhone: '555-987-6543',
		cellPhone: '555-555-5555',
		email: 'juan.perez@email.com',
		occupation: 'Ingeniero',
		snores: false,
		hasMedication: false,
		medicationDetails: '',
		medicationSchedule: '',
		hasDietaryRestrictions: false,
		dietaryRestrictionsDetails: '',
		sacraments: ['Bautismo', 'Primera Comunión', 'Confirmación'],
		emergencyContact1Name: 'María García',
		emergencyContact1Relation: 'Esposa',
		emergencyContact1HomePhone: '555-111-2222',
		emergencyContact1WorkPhone: '555-222-3333',
		emergencyContact1CellPhone: '555-333-4444',
		emergencyContact1Email: 'maria.garcia@email.com',
		emergencyContact2Name: 'Carlos López',
		emergencyContact2Relation: 'Hermano',
		emergencyContact2HomePhone: '555-444-5555',
		emergencyContact2WorkPhone: '555-555-6666',
		emergencyContact2CellPhone: '555-666-7777',
		emergencyContact2Email: 'carlos.lopez@email.com',
		tshirtSize: 'M',
		invitedBy: 'Pedro Martínez',
		isInvitedByEmausMember: true,
		inviterHomePhone: '555-777-8888',
		inviterWorkPhone: '555-888-9999',
		inviterCellPhone: '555-999-0000',
		inviterEmail: 'pedro.martinez@email.com',
		family_friend_color: 'Azul',
		pickupLocation: 'Iglesia San Judas Tadeo',
		arrivesOnOwn: false,
		paymentDate: '2024-01-15',
		paymentAmount: 1500,
		isScholarship: false,
		palancasCoordinator: 'Ana Rodríguez',
		palancasRequested: true,
		palancasReceived: '3 de 5',
		palancasNotes: 'Necesita palancas de apoyo emocional',
		requestsSingleRoom: false,
		isCancelled: false,
		notes: 'Participante entusiasta y comprometido',
		registrationDate: '2024-01-01',
		lastUpdatedDate: '2024-01-10',
		tableMesa: { name: '01' },
		retreatBed: { roomNumber: '101', bedNumber: '1' },
	};

	// Use actual participant data if available, otherwise use mock data
	const participantData = participant || mockParticipant;

	const participantReplacements = {
		'participant.firstName': participantData.firstName || '',
		'participant.lastName': participantData.lastName || '',
		'participant.nickname': participantData.nickname || '',
		'participant.type': participantData.type || '',
		'participant.birthDate': participantData.birthDate || '',
		'participant.maritalStatus': participantData.maritalStatus || '',
		'participant.street': participantData.street || '',
		'participant.houseNumber': participantData.houseNumber || '',
		'participant.postalCode': participantData.postalCode || '',
		'participant.neighborhood': participantData.neighborhood || '',
		'participant.city': participantData.city || '',
		'participant.state': participantData.state || '',
		'participant.country': participantData.country || '',
		'participant.parish': participantData.parish || '',
		'participant.homePhone': participantData.homePhone || '',
		'participant.workPhone': participantData.workPhone || '',
		'participant.cellPhone': participantData.cellPhone || '',
		'participant.email': participantData.email || '',
		'participant.occupation': participantData.occupation || '',
		'participant.snores': participantData.snores ? 'Sí' : 'No',
		'participant.hasMedication': participantData.hasMedication ? 'Sí' : 'No',
		'participant.medicationDetails': participantData.medicationDetails || '',
		'participant.medicationSchedule': participantData.medicationSchedule || '',
		'participant.hasDietaryRestrictions': participantData.hasDietaryRestrictions ? 'Sí' : 'No',
		'participant.dietaryRestrictionsDetails': participantData.dietaryRestrictionsDetails || '',
		'participant.sacraments': Array.isArray(participantData.sacraments)
			? participantData.sacraments.join(', ')
			: '',
		'participant.emergencyContact1Name': participantData.emergencyContact1Name || '',
		'participant.emergencyContact1Relation': participantData.emergencyContact1Relation || '',
		'participant.emergencyContact1HomePhone': participantData.emergencyContact1HomePhone || '',
		'participant.emergencyContact1WorkPhone': participantData.emergencyContact1WorkPhone || '',
		'participant.emergencyContact1CellPhone': participantData.emergencyContact1CellPhone || '',
		'participant.emergencyContact1Email': participantData.emergencyContact1Email || '',
		'participant.emergencyContact2Name': participantData.emergencyContact2Name || '',
		'participant.emergencyContact2Relation': participantData.emergencyContact2Relation || '',
		'participant.emergencyContact2HomePhone': participantData.emergencyContact2HomePhone || '',
		'participant.emergencyContact2WorkPhone': participantData.emergencyContact2WorkPhone || '',
		'participant.emergencyContact2CellPhone': participantData.emergencyContact2CellPhone || '',
		'participant.emergencyContact2Email': participantData.emergencyContact2Email || '',
		'participant.tshirtSize': participantData.tshirtSize || '',
		'participant.invitedBy': participantData.invitedBy || '',
		'participant.isInvitedByEmausMember': participantData.isInvitedByEmausMember ? 'Sí' : 'No',
		'participant.inviterHomePhone': participantData.inviterHomePhone || '',
		'participant.inviterWorkPhone': participantData.inviterWorkPhone || '',
		'participant.inviterCellPhone': participantData.inviterCellPhone || '',
		'participant.inviterEmail': participantData.inviterEmail || '',
		'participant.family_friend_color': participantData.family_friend_color || '',
		'participant.pickupLocation': participantData.pickupLocation || '',
		'participant.arrivesOnOwn': participantData.arrivesOnOwn ? 'Sí' : 'No',
		'participant.paymentDate': participantData.paymentDate || '',
		'participant.paymentAmount': participantData.paymentAmount?.toString() || '',
		'participant.isScholarship': participantData.isScholarship ? 'Sí' : 'No',
		'participant.palancasCoordinator': participantData.palancasCoordinator || '',
		'participant.palancasRequested': participantData.palancasRequested ? 'Sí' : 'No',
		'participant.palancasReceived': participantData.palancasReceived || '',
		'participant.palancasNotes': participantData.palancasNotes || '',
		'participant.requestsSingleRoom': participantData.requestsSingleRoom ? 'Sí' : 'No',
		'participant.isCancelled': participantData.isCancelled ? 'Sí' : 'No',
		'participant.notes': participantData.notes || '',
		'participant.registrationDate': participantData.registrationDate || '',
		'participant.lastUpdatedDate': participantData.lastUpdatedDate || '',
		'participant.table': participantData.tableMesa?.name || '',
		'participant.roomNumber': participantData.retreatBed?.roomNumber || '',
		'participant.bedNumber': participantData.retreatBed?.bedNumber || '',
	};

	// Apply all participant variable replacements
	let processedMessage = message;
	Object.entries(participantReplacements).forEach(([key, value]) => {
		processedMessage = processedMessage.replace(new RegExp(`\\{${key}\\}`, 'g'), value);
	});

	return processedMessage;
};

/**
 * Replaces all retreat variables in a message template with actual retreat data
 * Uses mock data if retreat is undefined or null
 */
export const replaceRetreatVariables = (
	message: string,
	retreat: RetreatData | null | undefined,
): string => {
	// Mock retreat data for when retreat is undefined or null
	const mockRetreat: RetreatData = {
		parish: 'Parroquia San José',
		startDate: '2024-03-15',
		endDate: '2024-03-17',
		openingNotes: 'Bienvenidos al retiro de Emaús',
		closingNotes: 'Gracias por participar en este retiro',
		thingsToBringNotes: 'Ropa cómoda, Biblia, cuaderno, botella de agua',
		cost: '50',
		paymentInfo: 'Transferencia bancaria: ES00 2100 1234 5678 9012 3456',
		paymentMethods: 'Transferencia, efectivo',
		max_walkers: 30,
		max_servers: 15,
		walkerArrivalTime: '18:00',
		serverArrivalTimeFriday: '16:00',
		retreat_type: 'men',
		retreat_number_version: 'I',
	};

	// Use mock data if retreat is undefined or null
	const retreatData = retreat || mockRetreat;

	const retreatReplacements = {
		'retreat.parish': retreatData.parish || '',
		'retreat.startDate': retreatData.startDate
			? new Date(retreatData.startDate).toLocaleDateString('es-ES', {
					year: 'numeric',
					month: 'long',
					day: 'numeric',
				})
			: '',
		'retreat.endDate': retreatData.endDate
			? new Date(retreatData.endDate).toLocaleDateString('es-ES', {
					year: 'numeric',
					month: 'long',
					day: 'numeric',
				})
			: '',
		'retreat.openingNotes': retreatData.openingNotes || '',
		'retreat.closingNotes': retreatData.closingNotes || '',
		'retreat.thingsToBringNotes': retreatData.thingsToBringNotes || '',
		'retreat.cost': retreatData.cost || '',
		'retreat.paymentInfo': retreatData.paymentInfo || '',
		'retreat.paymentMethods': retreatData.paymentMethods || '',
		'retreat.maxWalkers': retreatData.max_walkers?.toString() || '',
		'retreat.maxServers': retreatData.max_servers?.toString() || '',
		'retreat.walkerArrivalTime': retreatData.walkerArrivalTime || '',
		'retreat.serverArrivalTimeFriday': retreatData.serverArrivalTimeFriday || '',
		'retreat.type': retreatData.retreat_type || '',
		'retreat.number': retreatData.retreat_number_version || '',
	};

	// Apply all retreat variable replacements
	let processedMessage = message;
	Object.entries(retreatReplacements).forEach(([key, value]) => {
		processedMessage = processedMessage.replace(new RegExp(`\\{${key}\\}`, 'g'), value);
	});

	return processedMessage;
};

/**
 * Replaces all variables (participant and retreat) in a message template
 * Uses mock data if participant or retreat is undefined or null
 */
export const replaceAllVariables = (
	message: string,
	participant: ParticipantData | null | undefined,
	retreat: RetreatData | null | undefined,
): string => {
	let processedMessage = message;

	// Replace participant variables
	processedMessage = replaceParticipantVariables(processedMessage, participant);

	// Replace retreat variables
	processedMessage = replaceRetreatVariables(processedMessage, retreat);

	return processedMessage;
};

/**
 * Converts HTML content to email-compatible format with inline CSS and JavaScript support
 */
export const convertHtmlToEmail = (
	html: string,
	options: {
		format?: 'basic' | 'enhanced' | 'outlook';
		skipTemplate?: boolean;
	} = {},
): string => {
	const { format = 'enhanced', skipTemplate = false } = options;

	// Create email template based on format
	const emailTemplate = createEmailTemplate(html, {
		format,
		skipTemplate,
		//javascript: includeJavaScript ? javascript : undefined
	});

	return emailTemplate;
};

/**
 * Creates email template with proper structure and fallbacks
 */
const createEmailTemplate = (
	content: string,
	options: {
		format: 'basic' | 'enhanced' | 'outlook';
		javascript?: string;
		skipTemplate?: boolean;
	},
): string => {
	const { format, javascript, skipTemplate = false } = options;

	// Check if content already contains template wrapper
	const hasTemplateWrapper =
		content.includes('class="email-container"') ||
		content.includes('email-header') ||
		content.includes('Generated by Email System');

	// If content already has template or skipTemplate is true, return content as-is
	if (skipTemplate || hasTemplateWrapper) {
		return content;
	}

	// Fallback content for non-HTML email clients
	const textFallback = `
    <!-- Fallback content for text-only email clients -->
    <div style="display:none;font-size:0;color:#ffffff;line-height:0;mso-hide:all">
      ${content
				.replace(/<[^>]*>/g, ' ')
				.replace(/\s+/g, ' ')
				.trim()}
    </div>
  `;

	const baseStyles = `
    body {
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
      line-height: 1.6;
      margin: 0;
      padding: 0;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      min-height: 100vh;
      -webkit-text-size-adjust: 100%;
      -ms-text-size-adjust: 100%;
    }
    blockquote {
      border-left: 3px solid hsl(var(--border));
      padding-left: 12px;
      margin: 8px 0;
      color: hsl(var(--muted-foreground));
      background-color: hsl(var(--muted) / 0.5);
    }
    .email-container {
      max-width: 650px;
      margin: 40px auto;
      background: linear-gradient(145deg, #ffffff 0%, #f8f9fa 100%);
      border-radius: 20px;
      box-shadow:
        0 20px 40px rgba(0,0,0,0.1),
        0 0 0 1px rgba(255,255,255,0.1),
        inset 0 1px 0 rgba(255,255,255,0.6);
      overflow: hidden;
    }
    .email-header {
      background: linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%);
      color: white;
      text-align: center;
      padding: 35px 30px;
      position: relative;
      overflow: hidden;
    }
    .email-header::before {
      content: '';
      position: absolute;
      top: -50%;
      right: -50%;
      width: 200%;
      height: 200%;
      background: radial-gradient(circle, rgba(255,255,255,0.1) 0%, transparent 70%);
      animation: shimmer 3s infinite;
    }
    .email-body {
      padding: 40px 0px;
      background: white;
      position: relative;
    }
    .email-body::before {
      content: '';
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      height: 4px;
      background: linear-gradient(90deg, #4f46e5, #7c3aed, #4f46e5);
      background-size: 200% 100%;
      animation: gradient 3s ease infinite;
    }
    .message-box {
      background: linear-gradient(145deg, #f8fafc 0%, #f1f5f9 100%);
      border: 2px solid #e2e8f0;
      border-radius: 16px;
      padding: 30px;
      margin: 25px 0;
      position: relative;
      box-shadow:
        0 10px 25px rgba(0,0,0,0.05),
        inset 0 1px 0 rgba(255,255,255,0.8);
    }
    .message-box::before {
      content: '';
      position: absolute;
      top: -2px;
      left: -2px;
      right: -2px;
      bottom: -2px;
      background: linear-gradient(45deg, #4f46e5, #7c3aed, #06b6d4, #4f46e5);
      border-radius: 16px;
      z-index: -1;
      opacity: 0.7;
    }
    .email-footer {
      background: linear-gradient(145deg, #f8fafc 0%, #e2e8f0 100%);
      color: #64748b;
      font-size: 13px;
      text-align: center;
      padding: 25px 30px;
      border-top: 1px solid rgba(226, 232, 240, 0.5);
    }
    img {
      max-width: 100%;
      height: auto;
      border-radius: 8px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.1);
    }
    table {
      border-collapse: collapse;
      width: 100%;
      margin: 20px 0;
      border-radius: 8px;
      overflow: hidden;
      box-shadow: 0 4px 12px rgba(0,0,0,0.05);
    }
    td, th {
      border: 1px solid #e2e8f0;
      padding: 12px 15px;
      text-align: left;
    }
    th {
      background: linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%);
      color: white;
      font-weight: 600;
    }
    td {
      background-color: #ffffff;
    }
    tr:nth-child(even) td {
      background-color: #f8fafc;
    }
    @keyframes shimmer {
      0% { transform: rotate(0deg); }
      100% { transform: rotate(360deg); }
    }
    @keyframes gradient {
      0% { background-position: 0% 50%; }
      50% { background-position: 100% 50%; }
      100% { background-position: 0% 50%; }
    }
    p {
        margin: 0 0 16px 0;
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

	const javascriptContent = javascript
		? `
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
  `
		: '';

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
            ${
							skipTemplate
								? ''
								: `
            <div class="email-header">
              <h1 style="margin: 0; font-size: 28px; font-weight: 700; text-shadow: 0 2px 4px rgba(0,0,0,0.1); position: relative; z-index: 1;">
                Mensaje de Emaús
              </h1>
              <p style="margin: 10px 0 0 0; font-size: 16px; opacity: 0.9; position: relative; z-index: 1;">
                Mensaje personalizado para ti
              </p>
            </div>
            `
						}
            <div class="email-body">
              <div class="message-box">
                ${content}
              </div>
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
            ${
							skipTemplate
								? ''
								: `
            <div class="email-header">
              <h1 style="margin: 0; font-size: 28px; font-weight: 700; text-shadow: 0 2px 4px rgba(0,0,0,0.1); position: relative; z-index: 1;">
                Mensaje de Emaús
              </h1>
              <p style="margin: 10px 0 0 0; font-size: 16px; opacity: 0.9; position: relative; z-index: 1;">
                Mensaje personalizado para ti
              </p>
            </div>
            `
						}
            <div class="email-body">
              <div class="message-box">
                ${content}
              </div>
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
            ${
							skipTemplate
								? ''
								: `
            <tr>
              <td class="email-header" style="background: linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%); color: white; text-align: center; padding: 35px 30px; position: relative;">
                <h1 style="margin: 0; font-size: 28px; font-weight: 700; text-shadow: 0 2px 4px rgba(0,0,0,0.1); position: relative; z-index: 1;">
                  Mensaje de Emaús
                </h1>
                <p style="margin: 10px 0 0 0; font-size: 16px; opacity: 0.9; position: relative; z-index: 1;">
                  Mensaje personalizado para ti
                </p>
              </td>
            </tr>
            `
						}
            <tr>
              <td class="email-body">
                <div class="message-box">
                  ${content}
                </div>
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
 * Detects email client and suggests appropriate format (server-safe version)
 */
export const detectEmailClient = (): string => {
	// Server-safe version - always return enhanced as default
	// In a real implementation, this could be enhanced with email domain detection
	return 'enhanced';
};
