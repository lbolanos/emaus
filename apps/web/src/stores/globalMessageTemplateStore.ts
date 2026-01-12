import { defineStore } from 'pinia';
import { api } from '@/services/api';

export interface GlobalMessageTemplate {
	id: string;
	name: string;
	type: string;
	message: string;
	isActive: boolean;
	createdAt: string;
	updatedAt: string;
}

export const useGlobalMessageTemplateStore = defineStore('globalMessageTemplate', {
	state: () => ({
		templates: [] as GlobalMessageTemplate[],
		loading: false,
		error: null as string | null,
	}),

	getters: {
		activeTemplates: (state) => state.templates.filter((template) => !!template.isActive),
		getTemplateById: (state) => (id: string) =>
			state.templates.find((template) => template.id === id),
		getTemplatesByType: (state) => (type: string) =>
			state.templates.filter((template) => template.type === type),
	},

	actions: {
		async fetchAll() {
			this.loading = true;
			this.error = null;

			try {
				const response = await api.get('/global-message-templates');
				this.templates = response.data;
				return response.data;
			} catch (error) {
				this.error = 'Error al cargar las plantillas de mensaje globales';
				console.error('Error fetching global message templates:', error);
				throw error;
			} finally {
				this.loading = false;
			}
		},

		async fetchById(id: string) {
			this.loading = true;
			this.error = null;

			try {
				const response = await api.get(`/global-message-templates/${id}`);
				return response.data;
			} catch (error) {
				this.error = 'Error al cargar la plantilla de mensaje global';
				console.error('Error fetching global message template:', error);
				throw error;
			} finally {
				this.loading = false;
			}
		},

		async create(templateData: Omit<GlobalMessageTemplate, 'id' | 'createdAt' | 'updatedAt'>) {
			this.loading = true;
			this.error = null;

			try {
				const response = await api.post('/global-message-templates', templateData);
				this.templates.push(response.data.template);
				return response.data.template;
			} catch (error) {
				this.error = 'Error al crear la plantilla de mensaje global';
				console.error('Error creating global message template:', error);
				throw error;
			} finally {
				this.loading = false;
			}
		},

		async update(id: string, templateData: Partial<GlobalMessageTemplate>) {
			this.loading = true;
			this.error = null;

			try {
				const response = await api.put(`/global-message-templates/${id}`, templateData);
				const index = this.templates.findIndex((template) => template.id === id);
				if (index !== -1) {
					this.templates[index] = response.data.template;
				}
				return response.data.template;
			} catch (error) {
				this.error = 'Error al actualizar la plantilla de mensaje global';
				console.error('Error updating global message template:', error);
				throw error;
			} finally {
				this.loading = false;
			}
		},

		async delete(id: string) {
			this.loading = true;
			this.error = null;

			try {
				await api.delete(`/global-message-templates/${id}`);
				this.templates = this.templates.filter((template) => template.id !== id);
				return true;
			} catch (error) {
				this.error = 'Error al eliminar la plantilla de mensaje global';
				console.error('Error deleting global message template:', error);
				throw error;
			} finally {
				this.loading = false;
			}
		},

		async toggleActive(id: string) {
			this.loading = true;
			this.error = null;

			try {
				const response = await api.post(`/global-message-templates/${id}/toggle-active`);
				const index = this.templates.findIndex((template) => template.id === id);
				if (index !== -1) {
					this.templates[index] = response.data.template;
				}
				return response.data.template;
			} catch (error) {
				this.error = 'Error al cambiar el estado de la plantilla de mensaje global';
				console.error('Error toggling global message template active status:', error);
				throw error;
			} finally {
				this.loading = false;
			}
		},

		async copyToRetreat(templateId: string, retreatId: string) {
			this.loading = true;
			this.error = null;

			try {
				const response = await api.post(`/global-message-templates/${templateId}/copy-to-retreat`, {
					retreatId,
				});
				return response.data.template;
			} catch (error) {
				this.error = 'Error al copiar la plantilla de mensaje global al retiro';
				console.error('Error copying global message template to retreat:', error);
				throw error;
			} finally {
				this.loading = false;
			}
		},

		async copyAllActiveTemplatesToRetreat(retreatId: string) {
			this.loading = true;
			this.error = null;

			try {
				const activeTemplates = this.activeTemplates;
				const copiedTemplates = [];

				for (const template of activeTemplates) {
					try {
						const copiedTemplate = await this.copyToRetreat(template.id, retreatId);
						copiedTemplates.push(copiedTemplate);
					} catch (error) {
						console.error(`Error copying template ${template.name}:`, error);
					}
				}

				return copiedTemplates;
			} catch (error) {
				this.error = 'Error al copiar las plantillas de mensaje globales al retiro';
				console.error('Error copying all global message templates to retreat:', error);
				throw error;
			} finally {
				this.loading = false;
			}
		},

		async copyToCommunity(templateId: string, communityId: string) {
			this.loading = true;
			this.error = null;

			try {
				const response = await api.post(
					`/global-message-templates/${templateId}/copy-to-community`,
					{
						communityId,
					},
				);
				return response.data.template;
			} catch (error) {
				this.error = 'Error al copiar la plantilla de mensaje global a la comunidad';
				console.error('Error copying global message template to community:', error);
				throw error;
			} finally {
				this.loading = false;
			}
		},

		async copyAllToCommunity(communityId: string) {
			this.loading = true;
			this.error = null;

			try {
				const response = await api.post(
					`/global-message-templates/copy-all-to-community/${communityId}`,
				);
				return response.data.templates;
			} catch (error) {
				this.error = 'Error al copiar las plantillas de mensaje globales a la comunidad';
				console.error('Error copying all global message templates to community:', error);
				throw error;
			} finally {
				this.loading = false;
			}
		},
	},
});
