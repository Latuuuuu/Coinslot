import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { api, ApiError, type ChatMessage } from '../api';
import { RichText } from './RichText';

const COMMANDS = [
  { usage: '/today', hint: '今天的紀錄' },
  { usage: '/week', hint: '本週；/week 18 -a 看第 18 週每一筆' },
  { usage: '/month', hint: '本月；/month 9 -a 看 9 月每一筆' },
  { usage: '/undo', hint: '撤銷網頁聊天室記的最後一筆' },
  { usage: '/export', hint: '下載全部紀錄 CSV' },
  { usage: '/help', hint: '指令列表' },
];

export function ChatPage({ onChanged }: { onChanged: () => void }) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const stickToBottom = useRef(true);

  useEffect(() => {
    api.chatHistory().then(
      (r) => {
        setMessages(r.messages);
        setHasMore(r.hasMore);
      },
      () => setError('聊天紀錄載入失敗'),
    );
  }, []);

  // Keep the newest message in view unless the user scrolled up to read history.
  useLayoutEffect(() => {
    const el = listRef.current;
    if (el && stickToBottom.current) el.scrollTop = el.scrollHeight;
  }, [messages]);

  const loadEarlier = async () => {
    const el = listRef.current;
    const first = messages[0];
    if (!el || !first) return;
    const previousHeight = el.scrollHeight;
    const r = await api.chatHistory(first.id);
    stickToBottom.current = false;
    setMessages((m) => [...r.messages, ...m]);
    setHasMore(r.hasMore);
    // Keep the reading position after prepending.
    requestAnimationFrame(() => {
      el.scrollTop = el.scrollHeight - previousHeight;
    });
  };

  const send = useCallback(
    async (value: string) => {
      const trimmed = value.trim();
      if (!trimmed || sending) return;
      setSending(true);
      setError(null);
      try {
        const r = await api.sendChat(trimmed);
        stickToBottom.current = true;
        setMessages((m) => [...m, ...r.messages]);
        setText('');
        onChanged();
      } catch (e) {
        setError(e instanceof ApiError ? e.message : '送出失敗，請再試一次');
      } finally {
        setSending(false);
        inputRef.current?.focus();
      }
    },
    [sending, onChanged],
  );

  const suggestions =
    text.startsWith('/') && !text.includes(' ')
      ? COMMANDS.filter((c) => c.usage.startsWith(text.toLowerCase()))
      : [];

  return (
    <div className="page chat-page">
      <div
        className="messages"
        ref={listRef}
        onScroll={(e) => {
          const el = e.currentTarget;
          stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
        }}
      >
        {hasMore && (
          <button className="load-earlier" onClick={() => void loadEarlier()}>
            載入更早的訊息
          </button>
        )}
        {messages.length === 0 && (
          <div className="chat-empty muted">
            <p>
              和 Discord 一樣，直接打 <code>午餐 -120</code> 記帳，或輸入 <code>/</code> 看指令。
            </p>
            <p>
              這裡的 <code>/undo</code> 只會撤銷在網頁聊天室記的紀錄。
            </p>
          </div>
        )}
        {messages.map((m) => (
          <div key={m.id} className={`message ${m.role}`}>
            <div className="bubble">
              <RichText text={m.content} />
              {m.attachment && (
                <a className="attachment" href={m.attachment} download>
                  ⬇ 下載 CSV
                </a>
              )}
            </div>
          </div>
        ))}
      </div>

      {suggestions.length > 0 && (
        <ul className="suggestions" role="listbox">
          {suggestions.map((c) => (
            <li key={c.usage}>
              <button
                type="button"
                onClick={() => {
                  setText(`${c.usage} `);
                  inputRef.current?.focus();
                }}
              >
                <code>{c.usage}</code> <span className="muted">{c.hint}</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {error && <p className="error chat-error">{error}</p>}

      <form
        className="composer"
        onSubmit={(e) => {
          e.preventDefault();
          void send(text);
        }}
      >
        <input
          ref={inputRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="午餐 -120、+500 薪水、/week…"
          maxLength={500}
          enterKeyHint="send"
          aria-label="訊息"
        />
        <button type="submit" className="primary" disabled={sending || !text.trim()}>
          送出
        </button>
      </form>
    </div>
  );
}
