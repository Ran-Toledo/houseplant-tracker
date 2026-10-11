import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Photo } from '@houseplant/shared';
import { api } from '../api';
import { errorMessage } from '../lib/errors';
import { ConfirmDialog } from './ConfirmDialog';
import { Icon } from './Icon';
import { useToast } from './Toast';

/** Full-size photo viewer with cover / delete actions. */
function PhotoViewer({
  photo,
  name,
  onClose,
  onSetCover,
  onDelete,
}: {
  photo: Photo;
  name: string;
  onClose: () => void;
  onSetCover: () => void;
  onDelete: () => void;
}) {
  const { t } = useTranslation();
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    ref.current?.showModal();
  }, []);

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      aria-label={t('photos.alt', { name })}
      className="m-auto max-h-[92dvh] w-[min(calc(100%-1.5rem),56rem)] overflow-hidden rounded-2xl bg-panel p-0 shadow-stage"
    >
      <img src={photo.url} alt={t('photos.alt', { name })} className="max-h-[75dvh] w-full bg-[#1d2a21] object-contain" />
      <div className="flex flex-wrap items-center justify-between gap-2 p-3">
        <div className="flex gap-2">
          {!photo.isCover && (
            <button
              type="button"
              onClick={onSetCover}
              className="flex min-h-11 items-center gap-1.5 rounded-xl border border-line bg-white px-3 text-sm font-bold text-forest hover:bg-sage"
            >
              <Icon name="star" className="size-4" />
              {t('photos.setCover')}
            </button>
          )}
          <button
            type="button"
            onClick={onDelete}
            className="flex min-h-11 items-center gap-1.5 rounded-xl border border-line bg-white px-3 text-sm font-bold text-clay-ink hover:bg-[#fbebe6]"
          >
            <Icon name="trash" className="size-4" />
            {t('photos.delete')}
          </button>
        </div>
        <button
          type="button"
          onClick={() => ref.current?.close()}
          className="min-h-11 rounded-xl bg-forest-2 px-4 text-sm font-extrabold text-white"
        >
          {t('common.close')}
        </button>
      </div>
    </dialog>
  );
}

/** Thumbnail grid of a plant's photos with upload from camera or library. */
export function PhotoGallery({
  plantId,
  plantName,
  photos,
  onChanged,
}: {
  plantId: string;
  plantName: string;
  photos: Photo[];
  onChanged: () => void;
}) {
  const { t } = useTranslation();
  const toast = useToast();
  const fileInput = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [viewing, setViewing] = useState<Photo | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Photo | null>(null);
  const [deleting, setDeleting] = useState(false);

  async function upload(file: File) {
    setUploading(true);
    try {
      await api.uploadPhoto(plantId, file);
      toast(t('photos.uploaded'));
      onChanged();
    } catch (err) {
      toast(errorMessage(t, err));
    } finally {
      setUploading(false);
      if (fileInput.current) fileInput.current.value = '';
    }
  }

  async function setCover(photo: Photo) {
    try {
      await api.setCoverPhoto(photo.id);
      setViewing(null);
      onChanged();
    } catch (err) {
      toast(errorMessage(t, err));
    }
  }

  async function confirmDelete() {
    if (!pendingDelete) return;
    setDeleting(true);
    try {
      await api.deletePhoto(pendingDelete.id);
      toast(t('photos.deleted'));
      setViewing(null);
      onChanged();
    } catch (err) {
      toast(errorMessage(t, err));
    } finally {
      setDeleting(false);
      setPendingDelete(null);
    }
  }

  return (
    <div>
      <div className="grid grid-cols-3 gap-2 min-[600px]:grid-cols-4">
        {photos.map((photo) => (
          <button
            key={photo.id}
            type="button"
            onClick={() => setViewing(photo)}
            aria-label={t('photos.open')}
            className="relative aspect-square overflow-hidden rounded-xl bg-sage"
          >
            <img src={photo.url} alt="" loading="lazy" decoding="async" className="size-full object-cover" />
            {photo.isCover && (
              <span className="absolute start-1.5 top-1.5 flex items-center gap-1 rounded-full bg-[#fffefaee] px-1.5 py-0.5 text-[9px] font-extrabold text-forest-2">
                <Icon name="star" className="size-3" />
                {t('photos.cover')}
              </span>
            )}
          </button>
        ))}
        <label
          className={`flex aspect-square cursor-pointer flex-col items-center justify-center gap-1.5 rounded-xl border-[1.5px] border-dashed border-[#c7d6ca] bg-[#f5f9f3] text-center text-[11px] font-extrabold text-[#356e4d] hover:bg-[#edf5ea] ${
            uploading ? 'pointer-events-none opacity-60' : ''
          }`}
        >
          <Icon name="camera" className="size-6" />
          {uploading ? t('photos.uploading') : t('photos.add')}
          <input
            ref={fileInput}
            type="file"
            accept="image/*"
            className="sr-only"
            disabled={uploading}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void upload(file);
            }}
          />
        </label>
      </div>
      {photos.length === 0 && <p className="mt-3 text-[13px] text-muted">{t('photos.empty')}</p>}

      {viewing && (
        <PhotoViewer
          photo={viewing}
          name={plantName}
          onClose={() => setViewing(null)}
          onSetCover={() => void setCover(viewing)}
          onDelete={() => setPendingDelete(viewing)}
        />
      )}
      <ConfirmDialog
        open={pendingDelete !== null}
        title={t('photos.deleteConfirm')}
        confirmLabel={t('common.delete')}
        busy={deleting}
        onConfirm={() => void confirmDelete()}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  );
}
