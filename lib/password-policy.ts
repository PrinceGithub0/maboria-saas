export const MIN_PASSWORD_LENGTH = 12;
export const PASSWORD_MIN_LENGTH_HELPER_TEXT =
  `Minimum ${MIN_PASSWORD_LENGTH} characters with uppercase, lowercase, and number.`;
export const PASSWORD_MIN_LENGTH_ERROR =
  `Password must be at least ${MIN_PASSWORD_LENGTH} characters and include uppercase, lowercase, and number.`;

export function validatePasswordPolicy(password: string) {
  const value = String(password || "");
  return (
    value.length >= MIN_PASSWORD_LENGTH &&
    /[A-Z]/.test(value) &&
    /[a-z]/.test(value) &&
    /\d/.test(value)
  );
}
