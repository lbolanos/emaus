// Sandbox de datos FICTICIOS para el demo de "Familia Emaús" (capa social). Se comparte entre
// la grabación (record-social.mjs) y la verificación headless (verify-social.mjs). 100% datos
// personales → todo se fabrica; nada se muta. Red de seguridad: cualquier GET no fabricado pasa
// por maskNode (enmascara nombres/correos/teléfonos, blanquea fotos http, incluido avatarUrl).

import { maskNode } from './demo-lib.mjs';

// "Yo" (el dueño de la sesión): identidad ficticia fija para el sidebar y Mi Perfil.
export const ME = {
  displayName: 'Andrés Ramírez',
  email: 'andres.ramirez@correo.com',
  bio: 'Servidor en Emaús. Me encanta la música y acompañar a los nuevos hermanos en su primer retiro. Cada Emaús me deja el corazón lleno.',
  location: 'Celaya, Guanajuato',
  website: 'https://emaus.cc',
  interests: ['Oración', 'Música', 'Senderismo', 'Lectura'],
  skills: ['Guitarra', 'Logística', 'Cocina para grupos'],
};
let realUserId = null; // capturado de /api/auth/status para los testimonios "míos"

const BROS = [
  { id: 'b01', name: 'María Gómez', loc: 'León, Gto.', bio: 'Coro y liturgia.', interests: ['Canto', 'Oración'], skills: ['Coro'], server: true },
  { id: 'b02', name: 'José Martínez', loc: 'Querétaro, Qro.', bio: 'Servidor de cocina.', interests: ['Cocina', 'Comunidad'], skills: ['Cocina'], server: true },
  { id: 'b03', name: 'Lucía Torres', loc: 'Celaya, Gto.', bio: 'Me gusta acompañar a los caminantes.', interests: ['Acompañamiento'], skills: ['Escucha'], server: false },
  { id: 'b04', name: 'Miguel Flores', loc: 'Irapuato, Gto.', bio: 'Logística y transporte.', interests: ['Deportes'], skills: ['Logística'], server: true },
  { id: 'b05', name: 'Ana Hernández', loc: 'Salamanca, Gto.', bio: 'Palanquera de corazón.', interests: ['Manualidades', 'Oración'], skills: ['Palancas'], server: false },
  { id: 'b06', name: 'Carlos Jiménez', loc: 'Guanajuato, Gto.', bio: 'Música en vivo.', interests: ['Guitarra', 'Música'], skills: ['Guitarra'], server: true },
  { id: 'b07', name: 'Sofía Vargas', loc: 'Morelia, Mich.', bio: 'Primera vez de servidora.', interests: ['Lectura'], skills: ['Registro'], server: false },
  { id: 'b08', name: 'Diego Castro', loc: 'Silao, Gto.', bio: 'Recepción y gafetes.', interests: ['Fotografía'], skills: ['Recepción'], server: true },
];
const mkUser = (b) => ({ id: b.id, displayName: b.name, email: `${b.id}@correo.com`, photo: '', isPending: false, createdAt: '2025-11-01T12:00:00Z' });
const mkProfile = (b) => ({ userId: b.id, bio: b.bio, location: b.loc, website: '', interests: b.interests, skills: b.skills, showEmail: false, showPhone: false, showRetreats: true });
const mkPart = (b) => (b.server ? { id: `p-${b.id}`, type: 'server' } : null);
const en = (b, extra = {}) => ({ user: mkUser(b), profile: mkProfile(b), participant: mkPart(b), ...extra });

const MY_PROFILE = {
  userId: 'me', bio: ME.bio, location: ME.location, website: ME.website,
  showEmail: true, showPhone: false, showRetreats: true,
  interests: ME.interests, skills: ME.skills, avatarUrl: '',
  testimonialVisibilityDefault: 'friends', createdAt: '2025-01-01T00:00:00Z', updatedAt: '2026-05-01T00:00:00Z',
};
const SEARCH = [
  en(BROS[0], { friendship: { status: 'none' }, isFriend: false, isFollowing: false, mutualFriendsCount: 3 }),
  en(BROS[5], { friendship: { status: 'none' }, isFriend: false, isFollowing: true, mutualFriendsCount: 1 }),
  en(BROS[2], { friendship: { status: 'accepted' }, isFriend: true, isFollowing: false, mutualFriendsCount: 5 }),
  en(BROS[6], { friendship: { status: 'none' }, isFriend: false, isFollowing: false, mutualFriendsCount: 0 }),
  en(BROS[3], { friendship: { status: 'pending' }, isFriend: false, isFollowing: false, mutualFriendsCount: 2 }),
  en(BROS[7], { friendship: { status: 'none' }, isFriend: false, isFollowing: false, mutualFriendsCount: 1 }),
];
const FRIENDS = [
  en(BROS[0], { isFriend: true, friendship: { status: 'accepted', respondedAt: '2026-03-10T00:00:00Z', createdAt: '2026-03-08T00:00:00Z' } }),
  en(BROS[2], { isFriend: true, friendship: { status: 'accepted', respondedAt: '2026-02-20T00:00:00Z', createdAt: '2026-02-18T00:00:00Z' } }),
  en(BROS[5], { isFriend: true, friendship: { status: 'accepted', respondedAt: '2026-01-15T00:00:00Z', createdAt: '2026-01-14T00:00:00Z' } }),
  en(BROS[7], { isFriend: true, friendship: { status: 'accepted', respondedAt: '2025-12-01T00:00:00Z', createdAt: '2025-11-29T00:00:00Z' } }),
];
const PENDING = [
  en(BROS[1], { friendship: { status: 'pending', createdAt: '2026-06-20T00:00:00Z' }, isFollowing: false }),
  en(BROS[4], { friendship: { status: 'pending', createdAt: '2026-06-18T00:00:00Z' }, isFollowing: true }),
];
const SENT = [en(BROS[6], { friendship: { status: 'sent', createdAt: '2026-06-25T00:00:00Z' } })];
const FOLLOWERS = [
  en(BROS[0], { isFollowing: true, follow: { createdAt: '2026-04-01T00:00:00Z' } }),
  en(BROS[3], { isFollowing: false, follow: { createdAt: '2026-04-05T00:00:00Z' } }),
  en(BROS[6], { isFollowing: false, follow: { createdAt: '2026-05-02T00:00:00Z' } }),
];
const FOLLOWING = [
  en(BROS[0], { isFollowing: true, follow: { createdAt: '2026-04-01T00:00:00Z' } }),
  en(BROS[5], { isFollowing: true, follow: { createdAt: '2026-03-20T00:00:00Z' } }),
  en(BROS[4], { isFollowing: true, follow: { createdAt: '2026-05-10T00:00:00Z' } }),
];
function testimonials() {
  const t = (id, uid, name, content, visibility, parish, allowLanding, approved, createdAt) => ({
    id, userId: uid, retreatId: parish ? 'r1' : null, content, visibility,
    allowLandingPage: allowLanding, approvedForLanding: approved, createdAt, updatedAt: createdAt,
    user: { id: uid, displayName: name, photo: '' },
    retreat: parish ? { id: 'r1', parish } : undefined,
  });
  const me = realUserId || 'me';
  return [
    t(101, me, ME.displayName, 'Este retiro cambió mi manera de ver la vida. Volví a casa con el corazón lleno y con muchas ganas de servir. Gracias a los servidores por su entrega.', 'public', 'Parroquia San José', true, true, '2026-05-12T00:00:00Z'),
    t(102, me, ME.displayName, 'Fue un fin de semana de mucha paz. Reencontrarme con Dios y con hermanos que hoy son familia.', 'friends', null, false, false, '2026-03-02T00:00:00Z'),
    t(103, 'b03', BROS[2].name, 'Nunca imaginé cuánto me iba a marcar. Salí con una mirada nueva y con amigos para toda la vida.', 'retreat_participants', 'Parroquia San José', false, false, '2026-02-25T00:00:00Z'),
    t(104, 'b06', BROS[5].name, 'Servir en la música fue una bendición. Ver a los caminantes emocionarse no tiene precio.', 'public', 'Parroquia del Carmen', true, true, '2026-01-30T00:00:00Z'),
  ];
}

// ── Enmascarado (red de seguridad): maskNode canónico de demo-lib.mjs ─────────
// (una sola copia para todos los demos; las lecciones nuevas se agregan allá).

function fulfillJson(route, data) {
  return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(data) });
}

async function handleApi(route) {
  const req = route.request();
  const p = new URL(req.url()).pathname;
  if (req.method() !== 'GET') {
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true }) }).catch(() => route.continue().catch(() => {}));
  }
  try {
    if (p.endsWith('/api/auth/status')) {
      const resp = await route.fetch();
      const d = await resp.json();
      realUserId = d.id || realUserId;
      maskNode(d);
      d.displayName = ME.displayName; d.email = ME.email; d.photo = '';
      return route.fulfill({ response: resp, body: JSON.stringify(d) });
    }
    if (p.endsWith('/api/social/profile')) return fulfillJson(route, MY_PROFILE);
    if (p.endsWith('/api/social/search')) return fulfillJson(route, SEARCH);
    if (p.endsWith('/api/social/friends/pending')) return fulfillJson(route, PENDING);
    if (p.endsWith('/api/social/friends/sent')) return fulfillJson(route, SENT);
    if (p.endsWith('/api/social/friends')) return fulfillJson(route, FRIENDS);
    if (p.endsWith('/api/social/followers')) return fulfillJson(route, FOLLOWERS);
    if (p.endsWith('/api/social/following')) return fulfillJson(route, FOLLOWING);
    if (p.endsWith('/api/testimonials')) return fulfillJson(route, testimonials());
    // Red de seguridad: cualquier otro GET real → enmascarar.
    const resp = await route.fetch();
    const ct = resp.headers()['content-type'] || '';
    if (!ct.includes('json')) return route.fulfill({ response: resp }).catch(() => {});
    const d = await resp.json();
    maskNode(d);
    return route.fulfill({ response: resp, body: JSON.stringify(d) });
  } catch {
    return route.continue().catch(() => {});
  }
}

// Instala el interceptor sobre todas las llamadas /api/.
export async function installSocialSandbox(page) {
  await page.route('**/api/**', handleApi);
}
