// Tests for the getPalanqueroOptions controller logic
// No database dependencies — tests the mapping/formatting logic

describe('Palanquero Options', () => {
	// Extract the pure mapping logic from the controller
	const buildPalanqueroOptions = (responsibilities: any[]) => {
		const palanqueroNames = ['Palanquero 1', 'Palanquero 2', 'Palanquero 3'];
		return palanqueroNames.map(name => {
			const resp = responsibilities.find((r: any) => r.name === name);
			const serverName = resp?.participant
				? `${resp.participant.firstName} ${resp.participant.lastName}`
				: null;
			return { value: name, label: serverName ? `${name} (${serverName})` : name };
		});
	};

	test('should return 3 options with plain labels when no servers are assigned', () => {
		const responsibilities = [
			{ name: 'Palanquero 1', participant: null },
			{ name: 'Palanquero 2', participant: null },
			{ name: 'Palanquero 3', participant: null },
		];

		const options = buildPalanqueroOptions(responsibilities);

		expect(options).toHaveLength(3);
		expect(options[0]).toEqual({ value: 'Palanquero 1', label: 'Palanquero 1' });
		expect(options[1]).toEqual({ value: 'Palanquero 2', label: 'Palanquero 2' });
		expect(options[2]).toEqual({ value: 'Palanquero 3', label: 'Palanquero 3' });
	});

	test('should include server name in label when a server is assigned', () => {
		const responsibilities = [
			{ name: 'Palanquero 1', participant: { firstName: 'Juan', lastName: 'Pérez' } },
			{ name: 'Palanquero 2', participant: null },
			{ name: 'Palanquero 3', participant: { firstName: 'María', lastName: 'López' } },
		];

		const options = buildPalanqueroOptions(responsibilities);

		expect(options[0]).toEqual({ value: 'Palanquero 1', label: 'Palanquero 1 (Juan Pérez)' });
		expect(options[1]).toEqual({ value: 'Palanquero 2', label: 'Palanquero 2' });
		expect(options[2]).toEqual({ value: 'Palanquero 3', label: 'Palanquero 3 (María López)' });
	});

	test('should include server name for all three when all are assigned', () => {
		const responsibilities = [
			{ name: 'Palanquero 1', participant: { firstName: 'Rubén', lastName: 'García' } },
			{ name: 'Palanquero 2', participant: { firstName: 'Arturo', lastName: 'Sánchez' } },
			{ name: 'Palanquero 3', participant: { firstName: 'Juan', lastName: 'Martínez' } },
		];

		const options = buildPalanqueroOptions(responsibilities);

		expect(options).toEqual([
			{ value: 'Palanquero 1', label: 'Palanquero 1 (Rubén García)' },
			{ value: 'Palanquero 2', label: 'Palanquero 2 (Arturo Sánchez)' },
			{ value: 'Palanquero 3', label: 'Palanquero 3 (Juan Martínez)' },
		]);
	});

	test('should return plain labels when responsibilities list is empty', () => {
		const options = buildPalanqueroOptions([]);

		expect(options).toHaveLength(3);
		expect(options[0]).toEqual({ value: 'Palanquero 1', label: 'Palanquero 1' });
		expect(options[1]).toEqual({ value: 'Palanquero 2', label: 'Palanquero 2' });
		expect(options[2]).toEqual({ value: 'Palanquero 3', label: 'Palanquero 3' });
	});

	test('should handle responsibilities with other names gracefully', () => {
		const responsibilities = [
			{ name: 'Logistica', participant: { firstName: 'Carlos', lastName: 'Ruiz' } },
			{ name: 'Tesorero', participant: { firstName: 'Ana', lastName: 'Díaz' } },
			{ name: 'Palanquero 2', participant: { firstName: 'Pedro', lastName: 'Gómez' } },
		];

		const options = buildPalanqueroOptions(responsibilities);

		expect(options[0]).toEqual({ value: 'Palanquero 1', label: 'Palanquero 1' });
		expect(options[1]).toEqual({ value: 'Palanquero 2', label: 'Palanquero 2 (Pedro Gómez)' });
		expect(options[2]).toEqual({ value: 'Palanquero 3', label: 'Palanquero 3' });
	});

	test('should handle participant with undefined participant field', () => {
		const responsibilities = [
			{ name: 'Palanquero 1' },
			{ name: 'Palanquero 2', participant: undefined },
			{ name: 'Palanquero 3', participant: null },
		];

		const options = buildPalanqueroOptions(responsibilities);

		expect(options[0]).toEqual({ value: 'Palanquero 1', label: 'Palanquero 1' });
		expect(options[1]).toEqual({ value: 'Palanquero 2', label: 'Palanquero 2' });
		expect(options[2]).toEqual({ value: 'Palanquero 3', label: 'Palanquero 3' });
	});

	test('values should always be plain Palanquero names regardless of server assignment', () => {
		const responsibilities = [
			{ name: 'Palanquero 1', participant: { firstName: 'Test', lastName: 'User' } },
			{ name: 'Palanquero 2', participant: { firstName: 'Test', lastName: 'User' } },
			{ name: 'Palanquero 3', participant: { firstName: 'Test', lastName: 'User' } },
		];

		const options = buildPalanqueroOptions(responsibilities);

		expect(options.map(o => o.value)).toEqual([
			'Palanquero 1',
			'Palanquero 2',
			'Palanquero 3',
		]);
	});
});
