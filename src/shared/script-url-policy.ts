/** Reserved in every prepared Window and worker before application execution. */
export const SCRIPT_URL_POLICY_NAME = 'privacy-frames-runtime';

export const SCRIPT_URL_CSP =
  "require-trusted-types-for 'script'; trusted-types " +
  SCRIPT_URL_POLICY_NAME +
  ' default';
