import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import type { MessageTemplate, CreateMessageTemplate, UpdateMessageTemplate } from '@repo/types';
import { api } from '../services/api';

export const useMessageTemplateStore = defineStore('message-template', () => {
  const templates = ref<MessageTemplate[]>([]);

  const loading = ref(false);
  const error = ref<string | null>(null);

  const fetchTemplates = async (retreatId: string) => {
    loading.value = true;
    error.value = null;
    try {
      const url = `/message-templates?retreatId=${retreatId}`;
      const response = await api.get(url);
      templates.value = response.data;
    } catch (e: any) {
      error.value = e.message || 'Failed to fetch templates';
    } finally {
      loading.value = false;
    }
  };

  const createTemplate = async (templateData: CreateMessageTemplate['body']) => {
    loading.value = true;
    error.value = null;
    try {
      const response = await api.post('/message-templates', templateData);
      templates.value.push(response.data);
    } catch (e: any) {
      error.value = e.message || 'Failed to create template';
      throw e; // Re-throw to be caught in the component
    }
    finally {
      loading.value = false;
    }
  };

  const updateTemplate = async (id: string, templateData: UpdateMessageTemplate['body']) => {
    loading.value = true;
    error.value = null;
    try {
      const response = await api.put(`/message-templates/${id}`, templateData);
      const index = templates.value.findIndex((t) => t.id === id);
      if (index !== -1) {
        templates.value[index] = response.data;
      }
    } catch (e: any) {
      error.value = e.message || 'Failed to update template';
      throw e; // Re-throw to be caught in the component
    }
    finally {
      loading.value = false;
    }
  };

  const deleteTemplate = async (id: string) => {
    loading.value = true;
    error.value = null;
    try {
      await api.delete(`/message-templates/${id}`);
      templates.value = templates.value.filter((t) => t.id !== id);
    } catch (e: any) {
      error.value = e.message || 'Failed to delete template';
    } finally {
      loading.value = false;
    }
  };

  return {
    templates,
    loading,
    error,
    fetchTemplates,
    createTemplate,
    updateTemplate,
    deleteTemplate,
  };
});
