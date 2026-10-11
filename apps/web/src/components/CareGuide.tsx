import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { Language, Species, ToxicityLevel } from '@houseplant/shared';
import { formatDate } from '../lib/format';
import { Icon, type IconName } from './Icon';

export function SectionHeading({ icon, id, children }: { icon: IconName; id?: string; children: ReactNode }) {
  return (
    <div className="flex items-center gap-[9px]">
      <span className="grid size-[34px] shrink-0 place-items-center rounded-[10px] bg-[#eff4e9] text-[#478259]">
        <Icon name={icon} className="size-[23px]" />
      </span>
      <h2 id={id} className="text-lg font-bold tracking-tight">
        {children}
      </h2>
    </div>
  );
}

function CareTile({ icon, label, value }: { icon: IconName; label: string; value: ReactNode }) {
  return (
    <div className="min-h-[110px] rounded-[15px] border border-[#e8ede5] bg-[#fbfcf8] px-[13px] py-[15px] max-[390px]:px-[11px] max-[390px]:py-3">
      <span className="mb-2 grid size-[29px] place-items-center rounded-[10px] bg-[#eaf1e7] text-[#528262]">
        <Icon name={icon} />
      </span>
      <div className="mb-1 text-[10px] font-extrabold text-[#8a9a8a] uppercase rtl:normal-case">{label}</div>
      <div className="text-xs leading-[1.4] font-extrabold">{value}</div>
    </div>
  );
}

function Topic({ icon, title, children }: { icon: IconName; title: string; children: ReactNode }) {
  return (
    <details className="group border-b border-line-soft last:border-b-0">
      <summary className="flex min-h-12 cursor-pointer list-none items-center gap-2.5 py-2 text-sm font-extrabold [&::-webkit-details-marker]:hidden">
        <Icon name={icon} className="size-[18px] text-[#528262]" />
        <span className="flex-1">{title}</span>
        <Icon name="chevron" className="size-4 text-muted transition group-open:rotate-90" flipRtl />
      </summary>
      <div className="space-y-3 pb-4 text-[13px] leading-relaxed text-[#43584a]">{children}</div>
    </details>
  );
}

function Labeled({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <div className="mb-0.5 text-[11px] font-extrabold text-forest-2">{label}</div>
      {children}
    </div>
  );
}

function Bullets({ items }: { items: string[] }) {
  return (
    <ul className="list-disc space-y-0.5 ps-5 marker:text-[#9bb7a2]">
      {items.map((item) => (
        <li key={item}>{item}</li>
      ))}
    </ul>
  );
}

const TOXICITY_STYLE: Record<ToxicityLevel, string> = {
  'non-toxic': 'bg-[#eaf4e7] text-forest-2 border-[#d5e6d3]',
  'mildly-toxic': 'bg-[#fbf3e3] text-ochre-ink border-[#efe0c0]',
  toxic: 'bg-[#fbebe6] text-clay-ink border-[#f0d3ca]',
  unknown: 'bg-[#f3f4f0] text-muted border-line',
};

/** Full bilingual care guide for one catalog species, rendered in the active language. */
export function CareGuide({ species }: { species: Species }) {
  const { t, i18n } = useTranslation();
  const lang: Language = i18n.resolvedLanguage === 'he' ? 'he' : 'en';
  const loc = species.localizations[lang];
  const care = loc.care;
  const temp = species.temperatureCelsius;
  const tempRange = (
    <span dir="ltr">
      {temp.idealMin}–{temp.idealMax}°C
    </span>
  );

  return (
    <div>
      <div className="grid grid-cols-2 gap-2.5 min-[600px]:grid-cols-3">
        <CareTile icon="sun" label={t('careGuide.topics.light')} value={care.light.summary} />
        <CareTile icon="droplet" label={t('careGuide.topics.watering')} value={care.watering.summary} />
        <CareTile icon="thermometer" label={t('careGuide.topics.temperature')} value={tempRange} />
        <CareTile icon="humidity" label={t('careGuide.topics.humidity')} value={care.humidity.summary} />
        <CareTile icon="flower" label={t('careGuide.topics.soil')} value={care.soil.summary} />
        <CareTile icon="sparkle" label={t('careGuide.topics.fertilizing')} value={care.fertilizing.summary} />
      </div>

      <div className="mt-2.5 flex flex-wrap items-center gap-2 rounded-[15px] border border-[#e8ede5] bg-[#fbfcf8] px-[13px] py-3">
        <Icon name="paw" className="size-[18px] text-[#528262]" />
        <span className="me-1 text-[10px] font-extrabold text-[#8a9a8a] uppercase rtl:normal-case">
          {t('careGuide.topics.safety')}
        </span>
        {(['cats', 'dogs', 'humans'] as const).map((who) => (
          <span
            key={who}
            className={`rounded-full border px-2.5 py-1 text-[11px] font-extrabold ${TOXICITY_STYLE[species.toxicity[who]]}`}
          >
            {t(`careGuide.toxicity.${who}`)}: {t(`careGuide.toxicity.levels.${species.toxicity[who]}`)}
          </span>
        ))}
      </div>

      <div className="mt-4 rounded-2xl border border-line bg-white px-3.5">
        <Topic icon="sun" title={t('careGuide.topics.light')}>
          <p>{care.light.details}</p>
          <Labeled label={t('careGuide.labels.directSun')}>
            <p>{care.light.directSun}</p>
          </Labeled>
          <Labeled label={t('careGuide.labels.lowLight')}>
            <p>{care.light.lowLight}</p>
          </Labeled>
          <Labeled label={t('careGuide.labels.warningSigns')}>
            <Bullets items={care.light.warningSigns} />
          </Labeled>
        </Topic>
        <Topic icon="droplet" title={t('careGuide.topics.watering')}>
          <p>{care.watering.details}</p>
          <Labeled label={t('careGuide.labels.howToCheck')}>
            <p>{care.watering.howToCheck}</p>
          </Labeled>
          <Labeled label={t('careGuide.labels.seasonal')}>
            <p>{care.watering.seasonal}</p>
          </Labeled>
          <Labeled label={t('careGuide.labels.overwatering')}>
            <Bullets items={care.watering.overwateringSigns} />
          </Labeled>
          <Labeled label={t('careGuide.labels.underwatering')}>
            <Bullets items={care.watering.underwateringSigns} />
          </Labeled>
        </Topic>
        <Topic icon="thermometer" title={t('careGuide.topics.temperature')}>
          <p>
            {tempRange} · {care.temperature.details}
          </p>
          <Labeled label={t('careGuide.labels.extremes')}>
            <p>{care.temperature.extremes}</p>
            <p className="mt-1 text-xs text-muted">
              {t('careGuide.labels.minimum', { value: `${temp.minimum}°C` })}
            </p>
          </Labeled>
        </Topic>
        <Topic icon="humidity" title={t('careGuide.topics.humidity')}>
          <p>{care.humidity.details}</p>
        </Topic>
        <Topic icon="flower" title={t('careGuide.topics.soil')}>
          <p>{care.soil.details}</p>
          <Labeled label={t('careGuide.labels.drainage')}>
            <p>{care.soil.drainage}</p>
          </Labeled>
          {care.soil.additives.length > 0 && (
            <Labeled label={t('careGuide.labels.additives')}>
              <Bullets items={care.soil.additives} />
            </Labeled>
          )}
        </Topic>
        <Topic icon="sparkle" title={t('careGuide.topics.fertilizing')}>
          <p>{care.fertilizing.details}</p>
          <Labeled label={t('careGuide.labels.seasonal')}>
            <p>{care.fertilizing.seasonal}</p>
          </Labeled>
        </Topic>
        <Topic icon="pot" title={t('careGuide.topics.repotting')}>
          <p>
            <strong>{care.repotting.summary}.</strong> {care.repotting.details}
          </p>
          <Labeled label={t('careGuide.labels.rootBound')}>
            <Bullets items={care.repotting.rootBoundSigns} />
          </Labeled>
          <Labeled label={t('careGuide.labels.potSizing')}>
            <p>{care.repotting.potSizing}</p>
          </Labeled>
        </Topic>
        <Topic icon="scissors" title={t('careGuide.topics.pruning')}>
          <p>
            <strong>{care.pruning.summary}.</strong> {care.pruning.details}
          </p>
        </Topic>
        <Topic icon="leaf" title={t('careGuide.topics.propagation')}>
          <p>{care.propagation.summary}</p>
          {care.propagation.methods.map((m) => (
            <Labeled key={m.name} label={m.name}>
              <p>{m.instructions}</p>
            </Labeled>
          ))}
        </Topic>
        <Topic icon="check" title={t('careGuide.topics.health')}>
          <p>{loc.healthyAppearance}</p>
        </Topic>
        <Topic icon="alert" title={t('careGuide.topics.warningSigns')}>
          <Bullets items={loc.warningSigns} />
        </Topic>
        <Topic icon="info" title={t('careGuide.topics.problems')}>
          {loc.commonProblems.map((p) => (
            <div key={p.problem} className="rounded-xl bg-[#f7f8f3] p-3">
              <div className="mb-1 font-extrabold text-ink">{p.problem}</div>
              <Labeled label={t('careGuide.labels.causes')}>
                <Bullets items={p.possibleCauses} />
              </Labeled>
              <div className="mt-2">
                <Labeled label={t('careGuide.labels.whatToDo')}>
                  <p>{p.whatToDo}</p>
                </Labeled>
              </div>
            </div>
          ))}
        </Topic>
        <Topic icon="paw" title={t('careGuide.topics.safety')}>
          <p>{loc.safety.toxicity}</p>
          <Labeled label={t('careGuide.labels.handling')}>
            <p>{loc.safety.handling}</p>
          </Labeled>
        </Topic>
        {loc.additionalNotes.length > 0 && (
          <Topic icon="book" title={t('careGuide.topics.notes')}>
            <Bullets items={loc.additionalNotes} />
          </Topic>
        )}
        <Topic icon="globe" title={t('careGuide.topics.sources')}>
          <p className="font-extrabold">
            {species.researchMetadata.status === 'reviewed' && species.researchMetadata.reviewedAt
              ? t('careGuide.reviewed', { date: formatDate(species.researchMetadata.reviewedAt, i18n.language) })
              : t('careGuide.draft')}
          </p>
          <Labeled label={t('careGuide.labels.method')}>
            <p dir="ltr" className="text-start">
              {species.researchMetadata.method}
            </p>
          </Labeled>
          <ul className="space-y-1.5" dir="ltr">
            {species.researchMetadata.sources.map((s) => (
              <li key={s.url} className="text-start">
                <a href={s.url} target="_blank" rel="noreferrer noopener" className="font-bold text-forest-2 underline">
                  {s.title}
                </a>
                <span className="block text-xs text-muted">{s.publisher}</span>
              </li>
            ))}
          </ul>
          {species.image && (
            <p className="text-xs text-muted">
              <a href={species.image.sourceUrl} target="_blank" rel="noreferrer noopener" className="underline">
                {t('careGuide.photoCredit', { author: species.image.author, license: species.image.license })}
              </a>
            </p>
          )}
        </Topic>
      </div>

      <div className="mt-[11px] flex gap-[9px] rounded-[13px] border border-[#ecede7] bg-[#f7f8f3] px-[13px] py-3 text-[11px] leading-normal text-[#637568]">
        <Icon name="info" className="mt-px size-[15px] text-[#70957d]" />
        <span>{t('careGuide.note')}</span>
      </div>
    </div>
  );
}
