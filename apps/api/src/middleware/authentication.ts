// Re-export from the canonical isAuthenticated module to avoid duplicate implementations.
// Both files previously had different isAuthenticated logic — this consolidates them.
export { isAuthenticated } from './isAuthenticated';
