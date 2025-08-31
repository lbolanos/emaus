import { createI18n } from 'vue-i18n';
import en from './locales/en.json';
import es from './locales/es.json';

const getBrowserLocale = () => {
  const navigatorLocale = navigator.language.split('-')[0];
  if ([ 'en', 'es' ].includes(navigatorLocale)) {
    return navigatorLocale;
  }
  return 'en';
};

const i18n = createI18n({
  legacy: false,
  locale: getBrowserLocale(),
  fallbackLocale: 'en',
  messages: {
    en,
    es,
  },
  messageCompiler: 'runtime',
});

export default i18n;
