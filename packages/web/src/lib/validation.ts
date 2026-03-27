/**
 * Validates a cost input value.
 *
 * @param value - The string value to validate.
 * @param options.required - When true, an empty value is treated as an error.
 *   Org-level settings require a value; project-level settings allow empty to
 *   mean "inherit from org".
 */
export function validateCostInput(value: string, options?: { required?: boolean }): string {
  if (value === '' || value === null) {
    return options?.required ? 'Value is required' : '';
  }
  if (!/^\d+(\.\d+)?$/.test(value.trim())) return 'Must be a non-negative number';
  if (Number(value) < 0) return 'Must be non-negative';
  return '';
}
