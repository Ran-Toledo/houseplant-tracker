import Markdown from 'react-markdown';

/** The only elements an answer may use; anything else is unwrapped to its text. */
const ALLOWED = ['p', 'ul', 'ol', 'li', 'strong', 'em', 'code', 'br'];

/**
 * Renders an assistant answer. Raw HTML is dropped and only basic formatting
 * is kept (no links, images or headings), so model output can't inject markup.
 */
export function AssistantMarkdown({ children }: { children: string }) {
  return (
    <div
      dir="auto"
      className="space-y-2 [&_code]:rounded [&_code]:bg-sage [&_code]:px-1 [&_li]:mt-1 [&_ol]:list-decimal [&_ol]:ps-5 [&_ul]:list-disc [&_ul]:ps-5"
    >
      <Markdown skipHtml allowedElements={ALLOWED} unwrapDisallowed>
        {children}
      </Markdown>
    </div>
  );
}
