import { format, formatDistanceToNow } from 'date-fns';
import { de } from 'date-fns/locale';

export function toDate(value) {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function formatDateTime(value) {
  const d = toDate(value);
  return d ? format(d, 'dd.MM.yyyy, HH:mm', { locale: de }) : '–';
}

export function formatDateShort(value) {
  const d = toDate(value);
  return d ? format(d, 'dd.MM.yyyy', { locale: de }) : '–';
}

export function formatTime(value) {
  const d = toDate(value);
  return d ? format(d, 'HH:mm', { locale: de }) : '–';
}

export function formatHour(value) {
  const d = toDate(value);
  return d ? format(d, 'HH:mm', { locale: de }) : '';
}

export function relativeTime(value) {
  const d = toDate(value);
  return d ? formatDistanceToNow(d, { addSuffix: true, locale: de }) : '–';
}

export function isToday(value) {
  const d = toDate(value);
  if (!d) return false;
  const now = new Date();
  return d.getDate() === now.getDate() && d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
}
