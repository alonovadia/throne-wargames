import assert from 'node:assert/strict';
import test from 'node:test';
import { instantToLocalDateTime, localDateTimeToInstant } from './admin-date-time';

test('an unchanged archive timestamp survives a datetime-local round trip', () => {
  const storedInstant = '2026-09-18T12:34:00.000Z';
  const localValue = instantToLocalDateTime(storedInstant);

  assert.equal(localValue, '2026-09-18T15:34');
  assert.equal(localDateTimeToInstant(localValue), storedInstant);
});