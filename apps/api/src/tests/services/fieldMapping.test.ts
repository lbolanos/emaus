import { setupTestDatabase, teardownTestDatabase, clearTestData } from '../test-setup';

// Mock the mapToEnglishKeys function by extracting it from participantService
const mapToEnglishKeys = (participant: any): any => {
	const userType = participant.tipousuario?.trim();
	let mappedType: string;

	if (userType === '3') {
		mappedType = 'walker';
	} else if (userType === '4') {
		mappedType = 'waiting';
	} else if (userType === '5') {
		mappedType = 'partial_server';
	} else {
		mappedType = 'server'; // Default for '0', '1', '2', or any other value
	}

	return {
		id_on_retreat: participant.id?.trim(),
		type: mappedType,
		firstName: participant.nombre?.trim() || '',
		lastName: participant.apellidos?.trim(),
		nickname: participant.apodo?.trim(),
		birthDate: new Date(
			participant.anio?.trim(),
			participant.mes?.trim() - 1,
			participant.dia?.trim(),
		),
		maritalStatus: participant.estadocivil?.trim(),
		street: participant.dircalle?.trim(),
		houseNumber: participant.dirnumero?.trim(),
		postalCode: participant.dircp?.trim(),
		neighborhood: participant.dircolonia?.trim(),
		city: participant.dirmunicipio?.trim(),
		state: participant.direstado?.trim(),
		country: participant.dirpais?.trim(),
		parish: participant.parroquia?.trim(),
		homePhone: participant.telcasa?.trim(),
		workPhone: participant.teltrabajo?.trim(),
		cellPhone: participant.telcelular?.trim(),
		email: participant.email?.trim() || '',
		occupation: participant.ocupacion?.trim(),
		snores: participant.ronca?.trim() === 'S',
		hasMedication: participant.medicinaespecial?.trim() === 'S',
		medicationDetails: participant.medicinacual?.trim(),
		medicationSchedule: participant.medicinahora?.trim(),
		hasDietaryRestrictions: participant.alimentosrestringidos?.trim() === 'S',
		dietaryRestrictionsDetails: participant.alimentoscual?.trim(),
		sacraments: ['baptism', 'communion', 'confirmation', 'marriage'].filter(
			(s) => participant[`sacramento${s}`]?.trim() === 'S',
		),
		emergencyContact1Name: participant.emerg1nombre?.trim(),
		emergencyContact1Relation: participant.emerg1relacion?.trim(),
		emergencyContact1HomePhone: participant.emerg1telcasa?.trim(),
		emergencyContact1WorkPhone: participant.emerg1teltrabajo?.trim(),
		emergencyContact1CellPhone: participant.emerg1telcelular?.trim(),
		emergencyContact1Email: participant.emerg1email?.trim(),
		emergencyContact2Name: participant.emerg2nombre?.trim(),
		emergencyContact2Relation: participant.emerg2relacion?.trim(),
		emergencyContact2HomePhone: participant.emerg2telcasa?.trim(),
		emergencyContact2WorkPhone: participant.emerg2teltrabajo?.trim(),
		emergencyContact2CellPhone: participant.emerg2telcelular?.trim(),
		emergencyContact2Email: participant.emerg2email?.trim(),
		tshirtSize: (() => {
			const size = participant.camiseta?.trim()?.toUpperCase();
			const validSizes = ['S', 'M', 'G', 'X', '2'];
			return validSizes.includes(size) ? size : null;
		})(),
		invitedBy: participant.invitadopor?.trim(),
		isInvitedByEmausMember: participant.invitadaporemaus?.trim() === 'S' ? true : undefined,
		inviterHomePhone: participant.invtelcasa?.trim(),
		inviterWorkPhone: participant.invteltrabajo?.trim(),
		inviterCellPhone: participant.invtelcelular?.trim(),
		inviterEmail: participant.invemail?.trim(),
		pickupLocation: participant.puntoencuentro?.trim(),
		isScholarship: participant.becado?.trim() === 'S',
		palancasCoordinator: participant.palancasencargado?.trim(),
		palancasRequested: participant.palancaspedidas?.trim() === 'S',
		palancasReceived: participant.palancas?.trim(),
		palancasNotes: participant.notaspalancas?.trim(),
		requestsSingleRoom: participant.habitacionindividual?.trim() === 'S',
		isCancelled: participant.cancelado?.trim() === 'S',
		notes: participant.notas?.trim(),
	};
};

describe('Field Mapping - Excel to Database', () => {
	beforeAll(async () => {
		await setupTestDatabase();
	});

	afterAll(async () => {
		await teardownTestDatabase();
	});

	describe('Basic Field Mapping', () => {
		test('should map basic personal information correctly', () => {
			const spanishData = {
				nombre: 'Juan Carlos',
				apellidos: 'Pérez García',
				apodo: 'Juancar',
				email: 'juan.perez@example.com',
				telcelular: '5551234567',
			};

			const mappedData = mapToEnglishKeys(spanishData);

			expect(mappedData.firstName).toBe('Juan Carlos');
			expect(mappedData.lastName).toBe('Pérez García');
			expect(mappedData.nickname).toBe('Juancar');
			expect(mappedData.email).toBe('juan.perez@example.com');
			expect(mappedData.cellPhone).toBe('5551234567');
		});

		test('should handle empty and null values gracefully', () => {
			const spanishData = {
				nombre: '',
				apellidos: null,
				apodo: undefined,
				email: 'test@example.com',
				telcelular: '   ',
			};

			const mappedData = mapToEnglishKeys(spanishData);

			expect(mappedData.firstName).toBe('');
			expect(mappedData.lastName).toBe(null);
			expect(mappedData.nickname).toBe(undefined);
			expect(mappedData.email).toBe('test@example.com');
			expect(mappedData.cellPhone).toBe('');
		});

		test('should trim whitespace from string fields', () => {
			const spanishData = {
				nombre: '  Juan  ',
				apellidos: ' Pérez ',
				email: '  test@example.com  ',
				ciudad: '  México  ',
			};

			const mappedData = mapToEnglishKeys(spanishData);

			expect(mappedData.firstName).toBe('Juan');
			expect(mappedData.lastName).toBe('Pérez');
			expect(mappedData.email).toBe('test@example.com');
			expect(mappedData.city).toBe('México');
		});
	});

	describe('Address Field Mapping', () => {
		test('should map address fields correctly', () => {
			const spanishData = {
				dircalle: 'Calle Principal',
				dirnumero: '123',
				dircp: '06000',
				dircolonia: 'Centro',
				dirmunicipio: 'Mérida',
				direstado: 'Yucatán',
				dirpais: 'México',
			};

			const mappedData = mapToEnglishKeys(spanishData);

			expect(mappedData.street).toBe('Calle Principal');
			expect(mappedData.houseNumber).toBe('123');
			expect(mappedData.postalCode).toBe('06000');
			expect(mappedData.neighborhood).toBe('Centro');
			expect(mappedData.city).toBe('Mérida');
			expect(mappedData.state).toBe('Yucatán');
			expect(mappedData.country).toBe('México');
		});
	});

	describe('Phone Number Mapping', () => {
		test('should map all phone number fields', () => {
			const spanishData = {
				telcasa: '9991234567',
				teltrabajo: '9999876543',
				telcelular: '9995551111',
				emerg1telcasa: '1112223333',
				emerg1teltrabajo: '1114445555',
				emerg1telcelular: '1116667777',
				emerg2telcasa: '2223334444',
				emerg2teltrabajo: '2225556666',
				emerg2telcelular: '2227778888',
			};

			const mappedData = mapToEnglishKeys(spanishData);

			expect(mappedData.homePhone).toBe('9991234567');
			expect(mappedData.workPhone).toBe('9999876543');
			expect(mappedData.cellPhone).toBe('9995551111');
			expect(mappedData.emergencyContact1HomePhone).toBe('1112223333');
			expect(mappedData.emergencyContact1WorkPhone).toBe('1114445555');
			expect(mappedData.emergencyContact1CellPhone).toBe('1116667777');
			expect(mappedData.emergencyContact2HomePhone).toBe('2223334444');
			expect(mappedData.emergencyContact2WorkPhone).toBe('2225556666');
			expect(mappedData.emergencyContact2CellPhone).toBe('2227778888');
		});
	});

	describe('Date Mapping', () => {
		test('should map birth date components correctly', () => {
			const spanishData = {
				anio: '1990',
				mes: '5',
				dia: '15',
			};

			const mappedData = mapToEnglishKeys(spanishData);

			expect(mappedData.birthDate).toBeInstanceOf(Date);
			expect(mappedData.birthDate.getFullYear()).toBe(1990);
			expect(mappedData.birthDate.getMonth()).toBe(4); // Zero-indexed month
			expect(mappedData.birthDate.getDate()).toBe(15);
		});

		test('should handle invalid date components', () => {
			const spanishData = {
				anio: 'invalid',
				mes: '13',
				dia: '32',
			};

			const mappedData = mapToEnglishKeys(spanishData);

			expect(mappedData.birthDate).toBeInstanceOf(Date);
			expect(isNaN(mappedData.birthDate.getTime())).toBe(true);
		});

		test('should handle missing date components', () => {
			const spanishData = {
				anio: '1990',
				// mes missing
				dia: '15',
			};

			const mappedData = mapToEnglishKeys(spanishData);

			expect(mappedData.birthDate).toBeInstanceOf(Date);
			expect(isNaN(mappedData.birthDate.getTime())).toBe(true);
		});
	});

	describe('Type Mapping (tipousuario)', () => {
		test('should map tipousuario values correctly', () => {
			const testCases = [
				{ tipousuario: '0', expectedType: 'server' },
				{ tipousuario: '1', expectedType: 'server' },
				{ tipousuario: '2', expectedType: 'server' },
				{ tipousuario: '3', expectedType: 'walker' },
				{ tipousuario: '4', expectedType: 'waiting' },
				{ tipousuario: '5', expectedType: 'partial_server' },
				{ tipousuario: 'invalid', expectedType: 'server' },
				{ tipousuario: '', expectedType: 'server' },
				{ tipousuario: undefined, expectedType: 'server' },
			];

			testCases.forEach(({ tipousuario, expectedType }) => {
				const spanishData = { tipousuario };
				const mappedData = mapToEnglishKeys(spanishData);
				expect(mappedData.type).toBe(expectedType);
			});
		});
	});

	describe('Boolean Field Mapping', () => {
		test('should map Spanish boolean fields correctly', () => {
			const spanishData = {
				ronca: 'S',
				medicinaespecial: 'N',
				alimentosrestringidos: 'S',
				invitadaporemaus: 'N',
				becado: 'S',
				palancaspedidas: 'N',
				habitacionindividual: 'S',
				cancelado: 'N',
				sacramentobaptism: 'S',
				sacramentocommunion: 'S',
				sacramentconfirmation: 'N',
				sacramentmarriage: 'S',
			};

			const mappedData = mapToEnglishKeys(spanishData);

			expect(mappedData.snores).toBe(true);
			expect(mappedData.hasMedication).toBe(false);
			expect(mappedData.hasDietaryRestrictions).toBe(true);
			expect(mappedData.isInvitedByEmausMember).toBe(false);
			expect(mappedData.isScholarship).toBe(true);
			expect(mappedData.palancasRequested).toBe(false);
			expect(mappedData.requestsSingleRoom).toBe(true);
			expect(mappedData.isCancelled).toBe(false);
			expect(mappedData.sacraments).toContain('baptism');
			expect(mappedData.sacraments).toContain('communion');
			expect(mappedData.sacraments).toContain('marriage');
			expect(mappedData.sacraments).not.toContain('confirmation');
		});

		test('should handle various boolean input formats', () => {
			const testCases = [
				{ input: 'S', expected: true },
				{ input: 'N', expected: false },
				{ input: 's', expected: false }, // Only uppercase 'S' is true
				{ input: 'n', expected: false },
				{ input: 'YES', expected: false },
				{ input: 'NO', expected: false },
				{ input: 'true', expected: false },
				{ input: 'false', expected: false },
				{ input: '', expected: false },
				{ input: undefined, expected: false },
				{ input: null, expected: false },
			];

			testCases.forEach(({ input, expected }) => {
				const spanishData = { ronca: input };
				const mappedData = mapToEnglishKeys(spanishData);
				expect(mappedData.snores).toBe(expected);
			});
		});
	});

	describe('T-Shirt Size Mapping', () => {
		test('should map t-shirt sizes correctly', () => {
			const testCases = [
				{ input: 'S', expected: 'S' },
				{ input: 'M', expected: 'M' },
				{ input: 'G', expected: 'G' },
				{ input: 'X', expected: 'X' },
				{ input: '2', expected: '2' },
				{ input: 'L', expected: null }, // L is not in valid sizes
				{ input: 'XL', expected: null },
				{ input: '3', expected: null },
				{ input: '', expected: null },
				{ input: undefined, expected: null },
			];

			testCases.forEach(({ input, expected }) => {
				const spanishData = { camiseta: input };
				const mappedData = mapToEnglishKeys(spanishData);
				expect(mappedData.tshirtSize).toBe(expected);
			});
		});

		test('should handle case insensitivity for t-shirt sizes', () => {
			const testCases = [
				{ input: 's', expected: 'S' },
				{ input: 'm', expected: 'M' },
				{ input: 'g', expected: 'G' },
				{ input: 'x', expected: 'X' },
				{ input: '2', expected: '2' },
			];

			testCases.forEach(({ input, expected }) => {
				const spanishData = { camiseta: input };
				const mappedData = mapToEnglishKeys(spanishData);
				expect(mappedData.tshirtSize).toBe(expected);
			});
		});
	});

	describe('Emergency Contact Mapping', () => {
		test('should map emergency contact information', () => {
			const spanishData = {
				emerg1nombre: 'María García',
				emerg1relacion: 'Esposa',
				emerg1telcasa: '9991112222',
				emerg1teltrabajo: '9993334444',
				emerg1telcelular: '9995556666',
				emerg1email: 'maria.garcia@example.com',
				emerg2nombre: 'Carlos Pérez',
				emerg2relacion: 'Hermano',
				emerg2telcasa: '8887779999',
				emerg2teltrabajo: '8885551111',
				emerg2telcelular: '8883332222',
				emerg2email: 'carlos.perez@example.com',
			};

			const mappedData = mapToEnglishKeys(spanishData);

			expect(mappedData.emergencyContact1Name).toBe('María García');
			expect(mappedData.emergencyContact1Relation).toBe('Esposa');
			expect(mappedData.emergencyContact1HomePhone).toBe('9991112222');
			expect(mappedData.emergencyContact1WorkPhone).toBe('9993334444');
			expect(mappedData.emergencyContact1CellPhone).toBe('9995556666');
			expect(mappedData.emergencyContact1Email).toBe('maria.garcia@example.com');

			expect(mappedData.emergencyContact2Name).toBe('Carlos Pérez');
			expect(mappedData.emergencyContact2Relation).toBe('Hermano');
			expect(mappedData.emergencyContact2HomePhone).toBe('8887779999');
			expect(mappedData.emergencyContact2WorkPhone).toBe('8885551111');
			expect(mappedData.emergencyContact2CellPhone).toBe('8883332222');
			expect(mappedData.emergencyContact2Email).toBe('carlos.perez@example.com');
		});
	});

	describe('Inviter Information Mapping', () => {
		test('should map inviter information correctly', () => {
			const spanishData = {
				invitadopor: 'Juan Pérez',
				invitadaporemaus: 'S',
				invtelcasa: '7771112222',
				invteltrabajo: '7773334444',
				invtelcelular: '7775556666',
				invemail: 'juan.perez@example.com',
			};

			const mappedData = mapToEnglishKeys(spanishData);

			expect(mappedData.invitedBy).toBe('Juan Pérez');
			expect(mappedData.isInvitedByEmausMember).toBe(true);
			expect(mappedData.inviterHomePhone).toBe('7771112222');
			expect(mappedData.inviterWorkPhone).toBe('7773334444');
			expect(mappedData.inviterCellPhone).toBe('7775556666');
			expect(mappedData.inviterEmail).toBe('juan.perez@example.com');
		});
	});

	describe('Medical and Dietary Information Mapping', () => {
		test('should map medical information correctly', () => {
			const spanishData = {
				medicinaespecial: 'S',
				medicinacual: 'Insulina, Pastillas para presión',
				medicinahora: 'Antes de cada comida y antes de dormir',
				alimentosrestringidos: 'S',
				alimentoscual: 'Sin lactosa, bajo en sodio, sin glutén',
			};

			const mappedData = mapToEnglishKeys(spanishData);

			expect(mappedData.hasMedication).toBe(true);
			expect(mappedData.medicationDetails).toBe('Insulina, Pastillas para presión');
			expect(mappedData.medicationSchedule).toBe('Antes de cada comida y antes de dormir');
			expect(mappedData.hasDietaryRestrictions).toBe(true);
			expect(mappedData.dietaryRestrictionsDetails).toBe('Sin lactosa, bajo en sodio, sin glutén');
		});
	});

	describe('Financial Information Mapping', () => {
		test('should map financial information correctly', () => {
			const spanishData = {
				becado: 'S',
				palancasencargado: 'Juan Rodríguez',
				palancaspedidas: 'S',
				palancas: '10',
				notaspalancas: 'Entregar al inicio del retiro',
			};

			const mappedData = mapToEnglishKeys(spanishData);

			expect(mappedData.isScholarship).toBe(true);
			expect(mappedData.palancasCoordinator).toBe('Juan Rodríguez');
			expect(mappedData.palancasRequested).toBe(true);
			expect(mappedData.palancasReceived).toBe('10');
			expect(mappedData.palancasNotes).toBe('Entregar al inicio del retiro');
		});
	});

	describe('Complex Participant Mapping', () => {
		test('should handle a complete participant record', () => {
			const completeSpanishData = {
				id: '123',
				tipousuario: '3',
				nombre: 'Ana María',
				apellidos: 'López Martínez',
				apodo: 'Anita',
				email: 'ana.lopez@example.com',
				telcelular: '5559876543',
				anio: '1985',
				mes: '8',
				dia: '22',
				estadocivil: 'casada',
				dircalle: 'Av. Principal',
				dirnumero: '456',
				dircp: '06000',
				dircolonia: 'Centro Histórico',
				dirmunicipio: 'Mérida',
				direstado: 'Yucatán',
				dirpais: 'México',
				parroquia: 'San Juan Bautista',
				telcasa: '9991234567',
				teltrabajo: '9999876543',
				ocupacion: 'Ingeniera',
				ronca: 'S',
				medicinaespecial: 'S',
				medicinacual: 'Vitamina D',
				medicinahora: 'Con el desayuno',
				alimentosrestringidos: 'S',
				alimentoscual: 'Sin picante',
				sacramentobaptism: 'S',
				sacramentocommunion: 'S',
				sacramentconfirmation: 'S',
				sacramentmarriage: 'S',
				emerg1nombre: 'Carlos López',
				emerg1relacion: 'Esposo',
				emerg1telcasa: '9991112222',
				emerg1teltrabajo: '9993334444',
				emerg1telcelular: '9995556666',
				emerg1email: 'carlos.lopez@example.com',
				camiseta: 'M',
				invitadopor: 'María González',
				invitadaporemaus: 'N',
				pickupLocation: 'Iglesia Central',
				becado: 'N',
				palancaspedidas: 'S',
				palancas: '5',
				habitacionindividual: 'N',
				mesa: 'Mesa 3',
				habitacion: '201',
				montopago: '100',
				fechapago: '2024-01-15',
				cancelado: 'N',
				notas: 'Alergica al marisco',
			};

			const mappedData = mapToEnglishKeys(completeSpanishData);

			// Verify all key mappings
			expect(mappedData.id_on_retreat).toBe('123');
			expect(mappedData.type).toBe('walker');
			expect(mappedData.firstName).toBe('Ana María');
			expect(mappedData.lastName).toBe('López Martínez');
			expect(mappedData.nickname).toBe('Anita');
			expect(mappedData.email).toBe('ana.lopez@example.com');
			expect(mappedData.cellPhone).toBe('5559876543');
			expect(mappedData.birthDate.getFullYear()).toBe(1985);
			expect(mappedData.birthDate.getMonth()).toBe(7);
			expect(mappedData.birthDate.getDate()).toBe(22);
			expect(mappedData.maritalStatus).toBe('casada');
			expect(mappedData.occupation).toBe('Ingeniera');
			expect(mappedData.snores).toBe(true);
			expect(mappedData.hasMedication).toBe(true);
			expect(mappedData.medicationDetails).toBe('Vitamina D');
			expect(mappedData.hasDietaryRestrictions).toBe(true);
			expect(mappedData.tshirtSize).toBe('M');
			expect(mappedData.isInvitedByEmausMember).toBe(false);
			expect(mappedData.isScholarship).toBe(false);
			expect(mappedData.palancasRequested).toBe(true);
			expect(mappedData.requestsSingleRoom).toBe(false);
			expect(mappedData.isCancelled).toBe(false);
			expect(mappedData.notes).toBe('Alergica al marisco');

			// Verify sacraments
			expect(mappedData.sacraments).toContain('baptism');
			expect(mappedData.sacraments).toContain('communion');
			expect(mappedData.sacraments).toContain('confirmation');
			expect(mappedData.sacraments).toContain('marriage');
			expect(mappedData.sacraments).toHaveLength(4);
		});
	});

	describe('Edge Cases and Error Handling', () => {
		test('should handle completely empty participant data', () => {
			const emptyData = {};
			const mappedData = mapToEnglishKeys(emptyData);

			// All fields should have reasonable defaults
			expect(mappedData.type).toBe('server'); // Default type
			expect(mappedData.firstName).toBe('');
			expect(mappedData.lastName).toBe(undefined);
			expect(mappedData.email).toBe('');
			expect(mappedData.snores).toBe(false);
			expect(mappedData.hasMedication).toBe(false);
			expect(mappedData.hasDietaryRestrictions).toBe(false);
			expect(mappedData.isCancelled).toBe(false);
			expect(mappedData.sacraments).toEqual([]);
		});

		test('should handle data with special characters and accents', () => {
			const spanishData = {
				nombre: 'José María',
				apellidos: 'Niño de Álvarez',
				ciudad: 'Mérida',
				estado: 'Yucatán',
				notas: 'Participante con carácter especial ñoño',
			};

			const mappedData = mapToEnglishKeys(spanishData);

			expect(mappedData.firstName).toBe('José María');
			expect(mappedData.lastName).toBe('Niño de Álvarez');
			expect(mappedData.city).toBe('Mérida');
			expect(mappedData.state).toBe('Yucatán');
			expect(mappedData.notes).toBe('Participante con carácter especial ñoño');
		});

		test('should handle extremely long string values', () => {
			const longString = 'A'.repeat(1000);
			const spanishData = {
				nombre: longString,
				notas: longString,
				email: `${longString}@example.com`,
			};

			const mappedData = mapToEnglishKeys(spanishData);

			expect(mappedData.firstName).toBe(longString);
			expect(mappedData.notes).toBe(longString);
			expect(mappedData.email).toBe(`${longString}@example.com`);
		});
	});
});
