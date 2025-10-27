/**
 * Runtime Configuration Manager
 *
 * This service provides dynamic environment configuration at runtime,
 * allowing the same build artifact to work across different environments
 * without requiring rebuilds.
 */
// Simplified type-safe runtime configuration
interface ImportMetaEnv {
	VITE_API_URL: string;
	VITE_GOOGLE_MAPS_API_KEY?: string;
	MODE: 'development' | 'production';
}

// Runtime-safe environment access
declare const import_meta: {
	env: ImportMetaEnv;
};

export interface EnvironmentConfig {
	apiUrl: string;
	googleMapsApiKey?: string;
	environment: 'development' | 'production' | 'staging';
	isDevelopment: boolean;
	isStaging: boolean;
	isProduction: boolean;
}

export interface RuntimeConfigOverrides {
	apiUrl?: string;
	googleMapsApiKey?: string;
	environment?: 'development' | 'production' | 'staging';
}

class RuntimeConfigManager {
	private static instance: RuntimeConfigManager;
	private config: EnvironmentConfig | null = null;

	private constructor() {}

	public static getInstance(): RuntimeConfigManager {
		if (!RuntimeConfigManager.instance) {
			RuntimeConfigManager.instance = new RuntimeConfigManager();
		}
		return RuntimeConfigManager.instance;
	}

	/**
	 * Detect the current environment based on multiple factors
	 */
	private detectEnvironment(): 'development' | 'production' | 'staging' {
		// Priority order:
		// 1. Runtime injected configuration
		// 2. Runtime URL detection (hostname, port)
		// 3. Build-time environment variable
		// 4. URL pattern matching

		// 1. Check runtime injected configuration first
		if (window.EMAUS_RUNTIME_CONFIG?.environment) {
			console.log(
				`[CONFIG] Runtime environment from injection: ${window.EMAUS_RUNTIME_CONFIG.environment}`,
			);
			return window.EMAUS_RUNTIME_CONFIG.environment;
		}

		// 2. Check runtime indicators from URL
		const hostname = window.location.hostname;
		const port = window.location.port;

		console.log(`[CONFIG] Runtime environment detection: hostname=${hostname}, port=${port}`);

		// Staging environment detection
		const isStaging =
			hostname.includes('staging') ||
			hostname.includes('stg') ||
			hostname.includes('staging.') ||
			hostname.includes('-stg.') ||
			(port && ['3001', '3002', '8081'].includes(port));

		// Localhost/development detection
		const isLocalhost =
			hostname === 'localhost' ||
			hostname === '127.0.0.1' ||
			hostname.startsWith('192.168.') ||
			hostname.startsWith('10.') ||
			(port && ['5173', '8080', '3000', '8787'].includes(port));

		// Production detection (default)
		const isProduction = !isStaging && !isLocalhost;

		if (isStaging) {
			console.log('[CONFIG] Runtime environment: staging');
			return 'staging';
		} else if (isLocalhost) {
			console.log('[CONFIG] Runtime environment: development');
			return 'development';
		} else {
			console.log('[CONFIG] Runtime environment: production');
			return 'production';
		}
	}

	/**
	 * Load configuration with validation and error handling
	 */
	private loadConfig(): EnvironmentConfig {
		const environment = this.detectEnvironment();
		const isDevelopment = environment === 'development';
		const isStaging = environment === 'staging';
		const isProduction = environment === 'production';

		let apiUrl: string;
		let googleMapsApiKey: string | undefined;

		// Priority order for configuration loading:
		// 1. Runtime injected configuration (highest priority)
		if (window.EMAUS_RUNTIME_CONFIG) {
			const runtimeConfig = window.EMAUS_RUNTIME_CONFIG;
			apiUrl = runtimeConfig.apiUrl || this.getDefaultApiUrl(environment);
			googleMapsApiKey = runtimeConfig.googleMapsApiKey;
			console.log('[CONFIG] Loaded from runtime configuration:', {
				environment,
				apiUrl,
				googleMapsApiKey,
				source: 'runtime-injected',
			});
		} else {
			// 2. Build-time environment variables (with runtime safety check)
			try {
				// Check if import_meta is available (build environment)
				if (typeof import_meta !== 'undefined' && import_meta.env) {
					apiUrl = import_meta.env.VITE_API_URL || this.getDefaultApiUrl(environment);
					googleMapsApiKey = import_meta.env.VITE_GOOGLE_MAPS_API_KEY;
					console.log('[CONFIG] Loaded from build-time environment:', {
						environment,
						apiUrl,
						googleMapsApiKey,
						source: 'build-time',
					});
				} else {
					// Fallback to environment-based defaults
					apiUrl = this.getDefaultApiUrl(environment);
					googleMapsApiKey = undefined;
					console.log('[CONFIG] Build-time environment not available, using defaults:', {
						environment,
						apiUrl,
						googleMapsApiKey,
						source: 'defaults',
					});
				}
			} catch (error) {
				// Fallback for runtime environments where import_meta is not available
				apiUrl = this.getDefaultApiUrl(environment);
				googleMapsApiKey = undefined;
				console.log('[CONFIG] Build-time environment access failed, using defaults:', {
					environment,
					apiUrl,
					googleMapsApiKey,
					source: 'fallback',
					error: error instanceof Error ? error.message : String(error),
				});
			}
		}

		// Validate configuration
		this.validateConfig({ apiUrl, googleMapsApiKey, environment });

		const config: EnvironmentConfig = {
			apiUrl,
			googleMapsApiKey,
			environment,
			isDevelopment,
			isStaging,
			isProduction,
		};

		console.log('[CONFIG] Final configuration:', config);
		return config;
	}

	/**
	 * Get default API URL based on environment
	 */
	private getDefaultApiUrl(environment: 'development' | 'production' | 'staging'): string {
		switch (environment) {
			case 'development':
				return 'http://localhost:3001/api';
			case 'staging':
				return 'https://staging.emaus.cc/api';
			case 'production':
				return 'https://emaus.cc/api';
			default:
				return 'https://emaus.cc/api';
		}
	}

	/**
	 * Validate configuration for common issues
	 */
	private validateConfig(config: Partial<EnvironmentConfig>): void {
		if (!config.apiUrl) {
			throw new Error('[CONFIG] API URL is required');
		}

		try {
			new URL(config.apiUrl);
		} catch (error) {
			throw new Error(`[CONFIG] Invalid API URL: ${config.apiUrl}`);
		}

		if (config.googleMapsApiKey && !config.googleMapsApiKey.startsWith('AIza')) {
			console.warn('[CONFIG] Google Maps API key may be invalid (should start with "AIza")');
		}
	}

	/**
	 * Get current configuration (lazy loaded with error handling)
	 */
	public getConfig(): EnvironmentConfig {
		try {
			if (!this.config) {
				this.config = this.loadConfig();
			}
			return this.config;
		} catch (error) {
			console.error('[CONFIG] Error loading configuration:', error);
			// Return safe defaults
			return {
				apiUrl: this.getDefaultApiUrl('production'),
				environment: 'production',
				isDevelopment: false,
				isStaging: false,
				isProduction: true,
			};
		}
	}

	/**
	 * Update configuration at runtime (type-safe)
	 */
	public updateConfig(updates: RuntimeConfigOverrides): EnvironmentConfig {
		try {
			const currentConfig = this.getConfig();
			const updatedConfig = { ...currentConfig, ...updates };

			// Validate new configuration
			this.validateConfig(updatedConfig);

			// Update runtime config
			window.EMAUS_RUNTIME_CONFIG = {
				apiUrl: updatedConfig.apiUrl,
				googleMapsApiKey: updatedConfig.googleMapsApiKey,
				environment: updatedConfig.environment,
				isDevelopment: updatedConfig.isDevelopment,
				isProduction: updatedConfig.isProduction,
				isStaging: updatedConfig.isStaging,
			};

			// Clear cache
			this.config = null;

			console.log('[CONFIG] Configuration updated:', updatedConfig);

			// Dispatch event for app updates
			window.dispatchEvent(
				new CustomEvent('emaus-config-updated', {
					detail: updatedConfig,
				}),
			);

			return updatedConfig;
		} catch (error) {
			console.error('[CONFIG] Error updating configuration:', error);
			throw error;
		}
	}

	/**
	 * Reload configuration with error handling
	 */
	public reloadConfig(): void {
		try {
			this.config = null;
			console.log('[CONFIG] Configuration cache cleared');

			// Clear runtime config
			delete window.EMAUS_RUNTIME_CONFIG;

			// Dispatch reload event
			window.dispatchEvent(new CustomEvent('emaus-config-reloaded'));
		} catch (error) {
			console.error('[CONFIG] Error reloading configuration:', error);
		}
	}

	/**
	 * Get API URL with error handling
	 */
	public getApiUrl(): string {
		try {
			return this.getConfig().apiUrl;
		} catch (error) {
			console.error('[CONFIG] Error getting API URL:', error);
			return this.getDefaultApiUrl('production');
		}
	}

	/**
	 * Get Google Maps API Key with error handling
	 */
	public getGoogleMapsApiKey(): string | undefined {
		try {
			return this.getConfig().googleMapsApiKey;
		} catch (error) {
			console.error('[CONFIG] Error getting Google Maps API key:', error);
			return undefined;
		}
	}

	/**
	 * Get current environment
	 */
	public getEnvironment(): 'development' | 'production' | 'staging' {
		try {
			return this.getConfig().environment;
		} catch (error) {
			console.error('[CONFIG] Error getting environment:', error);
			return 'production';
		}
	}

	/**
	 * Environment checking functions
	 */
	public isDevelopment(): boolean {
		return this.getEnvironment() === 'development';
	}

	public isStaging(): boolean {
		return this.getEnvironment() === 'staging';
	}

	public isProduction(): boolean {
		return this.getEnvironment() === 'production';
	}
}

// Export singleton instance
export const runtimeConfig = RuntimeConfigManager.getInstance();

// Export convenient functions with backward compatibility
export const getApiUrl = () => runtimeConfig.getApiUrl();
export const getGoogleMapsApiKey = () => runtimeConfig.getGoogleMapsApiKey();
export const isDevelopment = () => runtimeConfig.isDevelopment();
export const isProduction = () => runtimeConfig.isProduction();

// Extend Window interface for runtime config injection
declare global {
	interface Window {
		EMAUS_RUNTIME_CONFIG?: {
			apiUrl: string;
			googleMapsApiKey?: string;
			environment?: 'development' | 'production' | 'staging';
			isDevelopment?: boolean;
			isProduction?: boolean;
			isStaging?: boolean;
		};
	}
}
