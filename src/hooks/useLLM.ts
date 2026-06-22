/**
 * useLLM — read the LLM context from anywhere in the app.
 *
 * Thin re-export of useLLMContext from LLMBridge. Lives in hooks/ so
 * screens import it consistently with the project's other hooks. Also
 * acts as the insulation point if we ever swap the WebView implementation
 * for a native runtime — screens won't need to change their imports.
 */

export { useLLMContext as useLLM } from '../components/LLMBridge';
export type { LLMStatus, LLMContextValue } from '../components/LLMBridge';