import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import type { AssistantToolName, ChatMessage, Conversation, Photo } from '@houseplant/shared';
import { api, ApiRequestError } from '../api';
import { AiTag } from '../components/AiParts';
import { AssistantMarkdown } from '../components/AssistantMarkdown';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { Icon } from '../components/Icon';
import { ErrorState, LoadingState } from '../components/StatusViews';
import { useToast } from '../components/Toast';
import { useAiAvailable } from '../hooks/useAiAvailable';
import { useAsync } from '../hooks/useAsync';
import { GENERAL_STARTERS, PLANT_STARTERS, type ChatLocationState } from '../lib/assistant';
import { errorMessage, isNotFound } from '../lib/errors';
import { NotFoundPage } from './NotFoundPage';

/** Screen D2 — one conversation: messages, a streamed answer, and the composer. */
export function ChatPage() {
  const { id = '' } = useParams();
  const conversation = useAsync(() => api.getConversation(id), [id]);
  const messages = useAsync(() => api.listMessages(id), [id]);

  const error = conversation.error ?? messages.error;
  if (error) {
    if (isNotFound(error)) return <NotFoundPage />;
    return <ErrorState error={error} onRetry={() => (conversation.reload(), messages.reload())} />;
  }
  if (!conversation.data || !messages.data) return <LoadingState />;
  return <Chat conversation={conversation.data} initialMessages={messages.data} key={id} />;
}

interface Streaming {
  tool: AssistantToolName | null;
  text: string;
}

function Bubble({ message }: { message: ChatMessage }) {
  const { t } = useTranslation();
  if (message.role === 'user') {
    return (
      <div className="flex flex-col items-end gap-1.5">
        {message.photo && (
          <img src={message.photo.thumbnailUrl} alt={t('assistant.photoAlt')} className="h-[110px] w-[150px] rounded-[14px] object-cover" />
        )}
        <p dir="auto" className="max-w-[86%] rounded-[18px] rounded-ee-md bg-forest-2 px-[13px] py-2.5 text-[13.5px] whitespace-pre-wrap text-white">
          {message.content}
        </p>
      </div>
    );
  }
  return (
    <div className="max-w-[86%] self-start rounded-[18px] rounded-es-md border border-line bg-white px-[13px] py-2.5 text-[13.5px] text-[#2f4636]">
      <div className="mb-1.5">
        <AiTag />
      </div>
      <AssistantMarkdown>{message.content}</AssistantMarkdown>
    </div>
  );
}

function Chat({ conversation, initialMessages }: { conversation: Conversation; initialMessages: ChatMessage[] }) {
  const { t, i18n } = useTranslation();
  const lang = i18n.resolvedLanguage === 'he' ? 'he' : 'en';
  const navigate = useNavigate();
  const location = useLocation();
  const toast = useToast();
  const aiAvailable = useAiAvailable();
  const [messages, setMessages] = useState(initialMessages);
  const [draft, setDraft] = useState('');
  const [streaming, setStreaming] = useState<Streaming | null>(null);
  const [failure, setFailure] = useState<string>();
  const [photo, setPhoto] = useState<Photo | null>(null);
  const [uploading, setUploading] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const end = useRef<HTMLDivElement>(null);
  const starterSent = useRef(false);
  const plant = conversation.plant;

  useEffect(() => {
    end.current?.scrollIntoView?.({ block: 'end', behavior: 'smooth' });
  }, [messages.length, streaming?.text, streaming?.tool, failure]);

  async function send(text: string) {
    const question = text.trim();
    if (!question || streaming) return;
    setStreaming({ tool: null, text: '' });
    setFailure(undefined);
    try {
      await api.sendMessage(conversation.id, { text: question, photoId: photo?.id ?? null, lang }, (event) => {
        if (event.type === 'message') {
          setMessages((m) => [...m, event.message]);
          setDraft('');
          setPhoto(null);
        } else if (event.type === 'status') setStreaming((s) => s && { ...s, tool: event.tool });
        else if (event.type === 'delta') setStreaming((s) => s && { ...s, text: s.text + event.text });
        else if (event.type === 'done') {
          setMessages((m) => [...m, event.message]);
          setStreaming(null);
        } else if (event.type === 'error') {
          const reason = errorMessage(t, new ApiRequestError(0, event.error.code, event.error.message));
          setFailure(t('assistant.failed', { reason }));
        }
      });
    } catch (err) {
      setFailure(errorMessage(t, err));
    } finally {
      setStreaming(null);
    }
  }

  // A starter question chosen on the Assistant tab is sent once, when the chat opens.
  useEffect(() => {
    const question = (location.state as ChatLocationState | null)?.question;
    if (!question || starterSent.current || !aiAvailable) return;
    starterSent.current = true;
    navigate(location.pathname, { replace: true, state: null });
    void send(question);
  }, [aiAvailable]);

  async function attach(file: File) {
    if (!plant) return;
    setUploading(true);
    try {
      setPhoto(await api.uploadPhoto(plant.id, file));
    } catch (err) {
      toast(errorMessage(t, err));
    } finally {
      setUploading(false);
    }
  }

  async function deleteConversation() {
    setDeleting(true);
    try {
      await api.deleteConversation(conversation.id);
      toast(t('assistant.deleted'));
      navigate('/assistant', { replace: true });
    } catch (err) {
      toast(errorMessage(t, err));
      setDeleting(false);
      setConfirmDelete(false);
    }
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    void send(draft);
  }

  const starters = plant ? PLANT_STARTERS : GENERAL_STARTERS;
  const busy = streaming !== null;

  return (
    <>
      <div className="-mt-1.5 mb-3 flex items-center gap-2.5 border-b border-line pb-3">
        <Link to="/assistant" aria-label={t('assistant.back')} className="grid size-10 shrink-0 place-items-center rounded-xl text-forest hover:bg-sage">
          <Icon name="back" className="size-[19px]" flipRtl />
        </Link>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-[15px] font-extrabold" dir="auto">
            {conversation.title ?? t('assistant.untitled')}
          </h1>
          {plant ? (
            <Link to={`/plants/${plant.id}`} className="flex items-center gap-2 text-[11px] text-muted hover:underline">
              {plant.coverPhoto && <img src={plant.coverPhoto.thumbnailUrl} alt="" className="size-[22px] rounded-[7px] object-cover" />}
              <span dir="auto">{t('assistant.about', { name: plant.nickname })}</span>
            </Link>
          ) : (
            <p className="text-[11px] text-muted">{t('assistant.aboutAll')}</p>
          )}
        </div>
        <button
          type="button"
          onClick={() => setConfirmDelete(true)}
          aria-label={t('assistant.delete')}
          className="grid size-10 shrink-0 place-items-center rounded-xl text-clay-ink hover:bg-[#fbebe6]"
        >
          <Icon name="trash" className="size-[18px]" />
        </button>
      </div>

      <div className="flex min-h-[40dvh] flex-col gap-3 rounded-2xl bg-[#fbfcf8] py-2" aria-live="polite">
        {messages.map((m) => (
          <Bubble key={m.id} message={m} />
        ))}
        {streaming &&
          (streaming.text ? (
            <div className="max-w-[86%] self-start rounded-[18px] rounded-es-md border border-line bg-white px-[13px] py-2.5 text-[13.5px] text-[#2f4636]">
              <AssistantMarkdown>{streaming.text}</AssistantMarkdown>
            </div>
          ) : (
            <p role="status" className="flex items-center gap-2 self-start rounded-full bg-[#f5f9f3] px-3 py-[7px] text-xs text-[#43584a]">
              <span aria-hidden="true" className="size-3.5 animate-spin rounded-full border-2 border-[#cfe2d2] border-t-forest-2" />
              {streaming.tool ? t(`assistant.tools.${streaming.tool}`) : t('assistant.thinking')}
            </p>
          ))}
        {failure && (
          <p role="alert" className="rounded-xl bg-[#fdf6f3] px-3.5 py-2.5 text-[13px] text-clay-ink">
            {failure}
          </p>
        )}
      </div>

      {aiAvailable ? (
        <form onSubmit={submit} className="mt-3 border-t border-line pt-2.5">
          {messages.length === 0 && !busy && (
            <div className="mb-2.5 flex flex-wrap gap-[7px]">
              {starters.map((key) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => void send(t(`assistant.starters.${key}`))}
                  className="rounded-full border border-[#d7e6d6] bg-[#f2f8ef] px-3 py-2 text-start text-xs font-extrabold text-forest-2 hover:bg-[#e8f2e4]"
                >
                  {t(`assistant.starters.${key}`)}
                </button>
              ))}
            </div>
          )}
          {(photo || uploading) && (
            <div className="mb-2 flex items-center gap-2 text-xs text-muted">
              {photo ? (
                <>
                  <img src={photo.thumbnailUrl} alt={t('assistant.photoAlt')} className="size-12 rounded-lg object-cover" />
                  <button type="button" onClick={() => setPhoto(null)} className="font-bold text-clay-ink hover:underline">
                    {t('assistant.removePhoto')}
                  </button>
                </>
              ) : (
                t('assistant.uploading')
              )}
            </div>
          )}
          <div className="flex items-end gap-2">
            {plant && (
              <>
                <button
                  type="button"
                  onClick={() => fileInput.current?.click()}
                  disabled={busy || uploading}
                  aria-label={t('assistant.attach')}
                  className="grid size-11 shrink-0 place-items-center rounded-xl border border-line bg-white text-forest hover:bg-sage disabled:opacity-60"
                >
                  <Icon name="camera" className="size-5" />
                </button>
                <input
                  ref={fileInput}
                  type="file"
                  accept="image/*"
                  className="sr-only"
                  tabIndex={-1}
                  aria-hidden="true"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    e.target.value = '';
                    if (file) void attach(file);
                  }}
                />
              </>
            )}
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  void send(draft);
                }
              }}
              rows={1}
              maxLength={4000}
              dir="auto"
              aria-label={plant ? t('assistant.placeholderPlant', { name: plant.nickname }) : t('assistant.placeholder')}
              placeholder={plant ? t('assistant.placeholderPlant', { name: plant.nickname }) : t('assistant.placeholder')}
              className="max-h-40 min-h-11 flex-1 resize-y rounded-xl border border-line bg-white px-3 py-2.5 text-ink outline-none placeholder:text-[#a3afa6] focus:border-[#83b998]"
            />
            <button
              type="submit"
              disabled={busy || !draft.trim()}
              aria-label={t('assistant.send')}
              className="grid size-11 shrink-0 place-items-center rounded-xl bg-forest-2 text-white hover:bg-forest disabled:opacity-50"
            >
              <Icon name="send" className="size-5" flipRtl />
            </button>
          </div>
          <p className="mt-[7px] text-center text-[10.5px] text-muted">{t('assistant.composerNote')}</p>
        </form>
      ) : (
        <p className="mt-3 rounded-xl bg-[#f4f3ee] px-3.5 py-3 text-[13px] text-muted">{t('assistant.unavailable')}</p>
      )}
      <div ref={end} />

      <ConfirmDialog
        open={confirmDelete}
        title={t('assistant.deleteConfirm')}
        confirmLabel={t('common.delete')}
        busy={deleting}
        onConfirm={() => void deleteConversation()}
        onCancel={() => setConfirmDelete(false)}
      />
    </>
  );
}
