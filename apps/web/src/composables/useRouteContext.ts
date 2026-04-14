import { computed } from 'vue';
import { useRoute } from 'vue-router';
import { useI18n } from 'vue-i18n';

const routeSectionMap: Record<string, string> = {
	// Main / Retreat
	'retreat-dashboard': 'sidebar.sections.main',
	'retreat-flyer': 'sidebar.sections.main',
	// People
	walkers: 'sidebar.sections.people',
	servers: 'sidebar.sections.people',
	angelitos: 'sidebar.sections.people',
	'waiting-list': 'sidebar.sections.people',
	canceled: 'sidebar.sections.people',
	// Assignments
	tables: 'sidebar.sections.assignments',
	rooms: 'sidebar.sections.assignments',
	'user-type-and-table': 'sidebar.sections.assignments',
	'bed-assignments': 'sidebar.sections.assignments',
	responsibilities: 'sidebar.sections.assignments',
	// Financial
	payments: 'sidebar.sections.financial',
	// Reports
	'bags-report': 'sidebar.sections.reports',
	'medicines-report': 'sidebar.sections.reports',
	'walker-badges': 'sidebar.sections.reports',
	// Services
	palancas: 'sidebar.sections.services',
	'notes-and-meeting-points': 'sidebar.sections.services',
	food: 'sidebar.sections.services',
	'cancellation-and-notes': 'sidebar.sections.services',
	inventory: 'sidebar.sections.services',
	'message-templates': 'sidebar.sections.services',
	// Administration
	'role-management': 'sidebar.sections.administration',
	// Community
	communities: 'sidebar.sections.community',
	'community-dashboard': 'sidebar.sections.community',
	'community-members': 'sidebar.sections.community',
	'community-meetings': 'sidebar.sections.community',
	'community-meeting-flyer': 'sidebar.sections.community',
	'community-attendance': 'sidebar.sections.community',
	'community-admins': 'sidebar.sections.community',
	'community-templates': 'sidebar.sections.community',
	// Social
	profile: 'sidebar.sections.social',
	'public-profile': 'sidebar.sections.social',
	'search-users': 'sidebar.sections.social',
	friends: 'sidebar.sections.social',
	followers: 'sidebar.sections.social',
	testimonials: 'sidebar.sections.social',
	'my-retreats': 'sidebar.sections.social',
	// Settings
	houses: 'sidebar.sections.settings',
	telemetry: 'sidebar.sections.settings',
	'global-message-templates': 'sidebar.sections.settings',
	'inventory-items': 'sidebar.sections.settings',
	'change-password': 'sidebar.sections.settings',
	help: 'sidebar.sections.settings',
	'help-section': 'sidebar.sections.settings',
};

export function useRouteContext() {
	const route = useRoute();
	const { t } = useI18n();

	const isRetreatSection = computed(() => {
		return route.meta.requiresRetreat === true;
	});

	const currentSectionTitle = computed(() => {
		const routeName = route.name as string;
		const i18nKey = routeSectionMap[routeName];
		if (i18nKey) {
			return t(i18nKey);
		}
		return '';
	});

	return {
		isRetreatSection,
		currentSectionTitle,
	};
}
