import { ValueTransformer } from 'typeorm';

export class DateTransformer implements ValueTransformer {
  to(value: Date | string | null): string | null {
    if (!value) {
      return null;
    }
    // If it's already a string, assume it's in the correct format or an ISO string.
    if (typeof value === 'string') {
      return value.split('T')[0];
    }
    // If it's a Date object, convert it to an ISO string and take the date part.
    return value.toISOString().split('T')[0];
  }

  from(value: string | null): Date | null {
    if (!value) {
      return null;
    }
    // When reading from the database, it will be a string in 'YYYY-MM-DD' format.
    // new Date() will parse this correctly as a UTC date.
    return new Date(value);
  }
}
