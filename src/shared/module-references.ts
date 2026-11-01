import { parse } from 'es-module-lexer/js';

/** A negative lexical result avoids building an AST for ordinary script bundles. */
export function hasModuleReferences(source: string): boolean {
  try {
    return parse(source)[0].length !== 0;
  } catch {
    // Unsupported or malformed syntax still goes through the existing relocator.
    return true;
  }
}
