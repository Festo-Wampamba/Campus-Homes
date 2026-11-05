/** Windows file pickers may provide an empty MIME type. Read the image
 * signature rather than rejecting a valid photo or trusting its extension. */
export async function prepareRoomPhoto(file: File): Promise<File> {
  if (file.size > 8 * 1024 * 1024) throw new Error('Each photo must be 8 MB or less. Choose a smaller image.');
  const header = await new Promise<Uint8Array>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(new Uint8Array(reader.result as ArrayBuffer));
    reader.onerror = () => reject(new Error('Could not read this photo. Select it again.'));
    reader.readAsArrayBuffer(file.slice(0, 12));
  });
  const png = [137,80,78,71,13,10,26,10].every((byte,index) => header[index] === byte);
  const jpeg = header[0] === 255 && header[1] === 216 && header[2] === 255;
  const webp = String.fromCharCode(...header.slice(0,4)) === 'RIFF' && String.fromCharCode(...header.slice(8,12)) === 'WEBP';
  const type = png ? 'image/png' : jpeg ? 'image/jpeg' : webp ? 'image/webp' : null;
  if (!type) throw new Error('Choose a JPEG, PNG or WebP photo. Convert HEIC or other formats before uploading.');
  return file.type === type ? file : new File([file], file.name, { type, lastModified: file.lastModified });
}
