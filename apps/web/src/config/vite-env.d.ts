/* eslint-disable */
/* ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~ */
/* Type definitions for Vite environment variables */
/* This file provides type-safe access to environment variables */
/* ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~ */

/// <reference types="vite/client" />

interface ImportMetaEnv {
	/**
	 * Indicates the mode the app is running in.
	 * Development: 'development', Production: 'production'
	 */
	readonly MODE: 'development' | 'production';

	/**
	 * Base URL for the application
	 */
	readonly BASE_URL: string;

	/**
	 * API endpoint URL
	 */
	readonly VITE_API_URL: string;

	/**
	 * Google Maps API key
	 */
	readonly VITE_GOOGLE_MAPS_API_KEY: string;

	/**
	 * Whether this is a dev build
	 */
	readonly DEV: boolean;

	/**
	 * Whether this is a production build
	 */
	readonly PROD: boolean;
}

interface ImportMeta {
	readonly env: ImportMetaEnv;
}

declare const import_meta: ImportMeta;

// Extend the Window interface for runtime configuration
interface Window {
	/**
	 * Runtime configuration that can be modified at runtime
	 */
	EMAUS_RUNTIME_CONFIG?: {
		apiUrl: string;
		googleMapsApiKey?: string;
		isDevelopment?: boolean;
		isProduction?: boolean;
		environment?: 'development' | 'production' | 'staging';
	};
}

// Export types for external use
export type { ImportMetaEnv, ImportMeta };