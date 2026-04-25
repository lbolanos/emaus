import { io, type Socket } from 'socket.io-client';
import { getApiUrl } from '@/config/runtimeConfig';

let socket: Socket | null = null;

function deriveBase(): { url: string; path: string } {
	const apiUrl = getApiUrl();
	// apiUrl can be "/api" (proxied) or "http://host:port/api"
	if (apiUrl.startsWith('/')) {
		return { url: window.location.origin, path: '/api/socket.io' };
	}
	try {
		const u = new URL(apiUrl);
		return { url: `${u.protocol}//${u.host}`, path: '/api/socket.io' };
	} catch {
		return { url: window.location.origin, path: '/api/socket.io' };
	}
}

export function getSocket(): Socket {
	if (socket && socket.connected) return socket;
	if (socket) return socket;
	const { url, path } = deriveBase();
	socket = io(url, {
		path,
		withCredentials: true,
		transports: ['websocket', 'polling'],
		autoConnect: true,
	});
	return socket;
}

export function disconnectSocket(): void {
	if (socket) {
		socket.disconnect();
		socket = null;
	}
}
