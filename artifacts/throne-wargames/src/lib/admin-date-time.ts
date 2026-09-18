export function instantToLocalDateTime(instant: string) {
  const date = new Date(instant);
  const localMilliseconds = date.getTime() - date.getTimezoneOffset() * 60_000;
  return new Date(localMilliseconds).toISOString().slice(0, 16);
}

export function localDateTimeToInstant(localDateTime: string) {
  return new Date(localDateTime).toISOString();
}