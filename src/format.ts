import { locale } from './i18n';
export const date = (value: string | Date) => new Date(typeof value === 'string' ? value + 'T12:00:00' : value).toLocaleDateString(locale());
export const number = (n: number, decimals = 0) => n.toLocaleString(locale(), { maximumFractionDigits: decimals, minimumFractionDigits: decimals });
export const percent = (n: number) => `${number(n * 100, 1)}%`;
