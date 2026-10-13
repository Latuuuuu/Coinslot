import { Fragment, type ReactNode } from 'react';

// Renders the bot's Discord-style text: **bold**, `code` and line breaks.
// Built from React elements only (no innerHTML), so notes cannot inject markup.
function inline(line: string): ReactNode[] {
  return line.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**') && part.length > 4) {
      return <strong key={i}>{part.slice(2, -2)}</strong>;
    }
    if (part.startsWith('`') && part.endsWith('`') && part.length > 2) {
      return <code key={i}>{part.slice(1, -1)}</code>;
    }
    return <Fragment key={i}>{part}</Fragment>;
  });
}

export function RichText({ text }: { text: string }) {
  return (
    <>
      {text.split('\n').map((line, i) => (
        <Fragment key={i}>
          {i > 0 && <br />}
          {inline(line)}
        </Fragment>
      ))}
    </>
  );
}
