import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { beforeEach, describe, expect, it } from 'vitest';
import { createTestApp } from './helpers';

let t: ReturnType<typeof createTestApp>;
let plantId: string;

beforeEach(async () => {
  t = createTestApp({ maxUploadBytes: 1024 * 1024 });
  plantId = (await t.json('POST', '/api/plants', { nickname: 'Photo subject' })).body.plant.id;
});

const png = (width = 64, height = 48) =>
  sharp({ create: { width, height, channels: 3, background: { r: 40, g: 120, b: 60 } } }).png().toBuffer();

async function upload(file: Blob | string, fields: Record<string, string> = {}, id = plantId) {
  const form = new FormData();
  form.set('photo', file instanceof Blob ? file : new Blob([file]), 'photo.png');
  for (const [k, v] of Object.entries(fields)) form.set(k, v);
  const res = await t.app.request(`/api/plants/${id}/photos`, { method: 'POST', body: form });
  return { status: res.status, body: await res.json() };
}

const photoFiles = () => {
  const dir = path.join(t.photosDir, plantId);
  return fs.existsSync(dir) ? fs.readdirSync(dir) : [];
};

describe('photos API', () => {
  it('uploads, converts to JPEG, and serves the file', async () => {
    const res = await upload(new Blob([new Uint8Array(await png())], { type: 'image/png' }));
    expect(res.status).toBe(201);
    const photo = res.body.photo;
    expect(photo).toMatchObject({
      plantId,
      isCover: true,
      url: `/api/photos/${photo.id}/file`,
      thumbnailUrl: `/api/photos/${photo.id}/thumb`,
    });
    expect(photoFiles().sort()).toEqual([`${photo.id}.jpg`, `${photo.id}.thumb.jpg`]);

    const file = await t.app.request(photo.url);
    expect(file.status).toBe(200);
    expect(file.headers.get('content-type')).toBe('image/jpeg');
    const meta = await sharp(Buffer.from(await file.arrayBuffer())).metadata();
    expect(meta).toMatchObject({ format: 'jpeg', width: 64, height: 48 });

    // The plant now reports it as its cover.
    expect((await t.json('GET', `/api/plants/${plantId}`)).body.plant.coverPhoto.id).toBe(photo.id);
  });

  it('downsizes very large images', async () => {
    const res = await upload(new Blob([new Uint8Array(await png(3000, 1500))]));
    const file = await t.app.request(res.body.photo.url);
    const meta = await sharp(Buffer.from(await file.arrayBuffer())).metadata();
    expect(meta.width).toBe(2048);
    expect(meta.height).toBe(1024);
  });

  it('serves a small thumbnail, regenerating it when the file is missing', async () => {
    const photo = (await upload(new Blob([new Uint8Array(await png(3000, 1500))]))).body.photo;
    const thumbSize = async () => {
      const res = await t.app.request(photo.thumbnailUrl);
      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toBe('image/jpeg');
      const meta = await sharp(Buffer.from(await res.arrayBuffer())).metadata();
      return [meta.width, meta.height];
    };
    expect(await thumbSize()).toEqual([512, 256]);

    // Photos uploaded before thumbnails existed (or restored from a backup) have none on disk.
    const thumbFile = path.join(t.photosDir, plantId, `${photo.id}.thumb.jpg`);
    fs.rmSync(thumbFile);
    expect(await thumbSize()).toEqual([512, 256]);
    expect(fs.existsSync(thumbFile)).toBe(true);
  });

  it('does not enlarge thumbnails of small photos', async () => {
    const photo = (await upload(new Blob([new Uint8Array(await png())]))).body.photo;
    const res = await t.app.request(photo.thumbnailUrl);
    const meta = await sharp(Buffer.from(await res.arrayBuffer())).metadata();
    expect([meta.width, meta.height]).toEqual([64, 48]);
  });

  it('keeps one cover per plant and promotes another photo when the cover is deleted', async () => {
    const first = (await upload(new Blob([new Uint8Array(await png())]))).body.photo;
    const second = (await upload(new Blob([new Uint8Array(await png())]))).body.photo;
    expect(second.isCover).toBe(false);

    const third = (await upload(new Blob([new Uint8Array(await png())]), { isCover: 'true' })).body.photo;
    expect(third.isCover).toBe(true);
    let list = (await t.json('GET', `/api/plants/${plantId}/photos`)).body.photos;
    expect(list.filter((p: { isCover: boolean }) => p.isCover).map((p: { id: string }) => p.id)).toEqual([third.id]);

    expect((await t.json('PATCH', `/api/photos/${first.id}`, { isCover: true })).status).toBe(200);
    expect((await t.json('DELETE', `/api/photos/${first.id}`)).status).toBe(204);
    list = (await t.json('GET', `/api/plants/${plantId}/photos`)).body.photos;
    expect(list).toHaveLength(2);
    expect(list.filter((p: { isCover: boolean }) => p.isCover)).toHaveLength(1);
    expect(photoFiles().sort()).toEqual(
      [second, third].flatMap((p) => [`${p.id}.jpg`, `${p.id}.thumb.jpg`]).sort(),
    );
    expect((await t.app.request(first.url)).status).toBe(404);
    expect((await t.app.request(first.thumbnailUrl)).status).toBe(404);
  });

  it('rejects non-images, HEIC files and missing files with clear errors', async () => {
    const text = await upload('definitely not an image');
    expect(text.status).toBe(415);
    expect(text.body.error.code).toBe('unsupported_image_format');

    // Minimal ISO-BMFF header with the "heic" brand, as produced by iPhone cameras.
    const heicHeader = Buffer.concat([Buffer.from([0, 0, 0, 24]), Buffer.from('ftypheic'), Buffer.alloc(12)]);
    const heic = await upload(new Blob([new Uint8Array(heicHeader)]));
    expect(heic.status).toBe(415);
    expect(heic.body.error.message).toMatch(/HEIC/);

    const form = new FormData();
    form.set('notAPhoto', 'x');
    const missing = await t.app.request(`/api/plants/${plantId}/photos`, { method: 'POST', body: form });
    expect(missing.status).toBe(400);
    expect(photoFiles()).toEqual([]);
  });

  it('rejects files over the size limit', async () => {
    const res = await upload(new Blob([new Uint8Array(2 * 1024 * 1024)]));
    expect(res.status).toBe(413);
    expect(res.body.error.code).toBe('payload_too_large');
  });

  it('returns 404 for photos of unknown plants and unknown photo ids', async () => {
    const missing = '00000000-0000-4000-8000-000000000000';
    expect((await upload(new Blob([new Uint8Array(await png())]), {}, missing)).status).toBe(404);
    expect((await t.app.request(`/api/photos/${missing}/file`)).status).toBe(404);
    expect((await t.json('DELETE', `/api/photos/${missing}`)).status).toBe(404);
    // Path-traversal attempts never reach the filesystem: they're just unknown ids.
    expect((await t.app.request('/api/photos/..%2F..%2Fplants.sqlite/file')).status).toBe(404);
  });

  it('deleting a plant removes its photo records and files', async () => {
    await upload(new Blob([new Uint8Array(await png())]));
    await upload(new Blob([new Uint8Array(await png())]));
    expect(photoFiles()).toHaveLength(4);

    expect((await t.json('DELETE', `/api/plants/${plantId}`)).status).toBe(204);
    expect(fs.existsSync(path.join(t.photosDir, plantId))).toBe(false);
    expect(t.db.$client.prepare('select count(*) as n from photos').get()).toEqual({ n: 0 });
  });
});
