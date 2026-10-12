/** Blob URLs don't inherit API response headers. Only normalized PNG/JPEG enter an img. */
export function isPreviewImage(type: string | null | undefined): boolean {
  return type === 'image/png' || type === 'image/jpeg';
}

export function requireSnapshotImage(blob: Blob): Blob {
  if (!isPreviewImage(blob.type)) throw new Error('La captura no es una imagen PNG/JPG validada.');
  return blob;
}

/** Stale metadata must not give an authenticated response a dangerous download extension. */
export function fileDownloadName(rawName: string, type: string): string {
  const extensions: Record<string, string> = {
    'image/png': 'png', 'image/jpeg': 'jpg', 'application/pdf': 'pdf',
    'application/vnd.ms-powerpoint': 'ppt',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'pptx',
  };
  const name = rawName.replace(/\\/g, '/').split('/').pop() || 'archivo';
  const stem = name.replace(/\.[^.]*$/, '').replace(/[^\p{L}\p{N} ._()-]/gu, '_').replace(/\.\./g, '').trim() || 'archivo';
  return `${stem.slice(0, 180)}.${extensions[type] || 'bin'}`;
}
