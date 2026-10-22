import { t } from '../i18n';

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : t('common.error');
}
