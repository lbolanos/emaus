// Global test setup for Jest
import { expect } from '@jest/globals';

// Add custom matchers for field mapping validation
expect.extend({
	toBeValidDateString(received: string) {
		const pass = !isNaN(Date.parse(received));
		return {
			message: () =>
				pass
					? `expected ${received} not to be a valid date string`
					: `expected ${received} to be a valid date string`,
			pass,
		};
	},

	toBeValidEmail(received: string) {
		const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
		const pass = emailRegex.test(received);
		return {
			message: () =>
				pass
					? `expected ${received} not to be a valid email`
					: `expected ${received} to be a valid email`,
			pass,
		};
	},

	toBeValidPhone(received: string) {
		// Basic phone validation - can be extended based on requirements
		const phoneRegex = /^[\d\s\-\+\(\)]+$/;
		const pass = phoneRegex.test(received) && received.replace(/\D/g, '').length >= 10;
		return {
			message: () =>
				pass
					? `expected ${received} not to be a valid phone number`
					: `expected ${received} to be a valid phone number`,
			pass,
		};
	},

	toBeInEnum<T>(received: T, enumObject: T) {
		const pass = Object.values(enumObject as any).includes(received);
		return {
			message: () =>
				pass ? `expected ${received} not to be in enum` : `expected ${received} to be in enum`,
			pass,
		};
	},
});

// Extend Jest matchers type
declare global {
	namespace jest {
		interface Matchers<R> {
			toBeValidDateString(): R;
			toBeValidEmail(): R;
			toBeValidPhone(): R;
			toBeInEnum<T>(enumObject: T): R;
		}
	}
}

// Set test environment variables
process.env.NODE_ENV = 'test';
process.env.DB_TYPE = 'sqlite';
process.env.DB_DATABASE = ':memory:';
process.env.JWT_SECRET = 'test-secret-key';

// Mock console methods in tests to reduce noise
global.console = {
	...console,
	// Uncomment to ignore specific console methods in tests
	// log: jest.fn(),
	// debug: jest.fn(),
	// info: jest.fn(),
	// warn: jest.fn(),
	// error: jest.fn(),
};

// Cleanup after tests
afterAll(() => {
	// Cleanup performance optimization service to prevent open handles
	try {
		const {
			performanceOptimizationService,
		} = require('../services/performanceOptimizationService');
		performanceOptimizationService.cleanup();
	} catch (error) {
		// Ignore cleanup errors
	}
});
