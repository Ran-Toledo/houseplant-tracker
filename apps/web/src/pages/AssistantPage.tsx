import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { useTranslation } from 'react-i18next';
import { api } from '../api';
import { Icon } from '../components/Icon';
import { ErrorState, LoadingState } from '../components/StatusViews';
import { useToast } from '../components/Toast';
import { useAiAvailable } from '../hooks/useAiAvailable';
import { useAsync } from '../hooks/useAsync';
import { GENERAL_STARTERS, type ChatLocationState } from '../lib/assistant';
import { errorMessage } from '../lib/errors';
import { formatRelativeDay } from '../lib/format';

/** Screen D1 — the Assistant tab: conversations, newest first, and "New chat". */
export function AssistantPage() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const toast = useToast();
  const aiAvailable = useAiAvailable();
  const conversations = useAsync(() => api.listConversations(), []);
  const [creating, setCreating] = useState(false);

  async function start(question?: string) {
    setCreating(true);
    try {
      const conversation = await api.createConversation(null);
      navigate(`/assistant/${conversation.id}`, { state: { question } satisfies ChatLocationState });
    } catch (err) {
      toast(errorMessage(t, err));
      setCreating(false);
    }
  }

  const list = conversations.data ?? [];
  return (
    <>
      <h1 className="text-[30px] leading-[1.08] font-extrabold tracking-[-.02em]">{t('assistant.title')}</h1>
      <p className="mt-1.5 text-[13px] text-muted">{t('assistant.subtitle')}</p>

      {aiAvailable ? (
        <button
          type="button"
          onClick={() => void start()}
          disabled={creating}
          className="mt-[18px] mb-3.5 flex min-h-12 w-full items-center justify-center gap-2 rounded-[14px] bg-forest-2 text-sm font-extrabold text-white hover:bg-forest disabled:opacity-70"
        >
          <Icon name="plus" className="size-[18px]" />
          {t('assistant.newChat')}
        </button>
      ) : (
        <p className="mt-4 mb-3.5 rounded-xl bg-[#f4f3ee] px-3.5 py-3 text-[13px] text-muted">{t('assistant.unavailable')}</p>
      )}

      {conversations.error ? (
        <ErrorState error={conversations.error} onRetry={conversations.reload} />
      ) : !conversations.data ? (
        <LoadingState />
      ) : list.length === 0 ? (
        aiAvailable && (
          <div>
            <p className="mb-2.5 text-[13px] text-[#43584a]">{t('assistant.empty')}</p>
            <div className="flex flex-wrap gap-[7px]">
              {GENERAL_STARTERS.map((key) => (
                <button
                  key={key}
                  type="button"
                  disabled={creating}
                  onClick={() => void start(t(`assistant.starters.${key}`))}
                  className="rounded-full border border-[#d7e6d6] bg-[#f2f8ef] px-3 py-2 text-start text-xs font-extrabold text-forest-2 hover:bg-[#e8f2e4]"
                >
                  {t(`assistant.starters.${key}`)}
                </button>
              ))}
            </div>
          </div>
        )
      ) : (
        <ul className="space-y-[9px]">
          {list.map((c) => (
            <li key={c.id}>
              <Link
                to={`/assistant/${c.id}`}
                className="flex items-center gap-[11px] rounded-2xl border border-line bg-white p-3 hover:bg-[#fbfcf8]"
              >
                <span className="grid size-11 shrink-0 place-items-center overflow-hidden rounded-xl bg-[#eef3fb] text-[#3d5a87]">
                  {c.plant?.coverPhoto ? (
                    <img src={c.plant.coverPhoto.thumbnailUrl} alt="" className="size-full object-cover" />
                  ) : (
                    <Icon name={c.plant ? 'leaf' : 'sparkle'} className="size-[22px]" />
                  )}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-extrabold" dir="auto">
                    {c.title ?? t('assistant.untitled')}
                  </span>
                  <span className="mt-0.5 flex items-center gap-1.5 text-[11px] text-muted">
                    {c.plant ? (
                      <span className="rounded-full bg-[#eff4eb] px-2 py-0.5 text-[10px] font-extrabold text-[#52775b]" dir="auto">
                        {c.plant.nickname}
                      </span>
                    ) : (
                      <span>{t('assistant.general')} ·</span>
                    )}
                    {formatRelativeDay(c.updatedAt, i18n.language)}
                  </span>
                </span>
                <Icon name="chevron" className="size-4 text-subtle" flipRtl />
              </Link>
            </li>
          ))}
        </ul>
      )}

      <p className="mt-3.5 flex items-start gap-1.5 text-[11px] text-muted">
        <Icon name="info" className="mt-px size-3.5" />
        {t('assistant.listNote')}
      </p>
    </>
  );
}
