type VerificationPhoto = {
  storageKey: string;
  category?: string | null;
  roomCategory?: string | null;
  selfContained: boolean | null;
};

/** The verification photos that belong to one room type (e.g. "single,
 * self-contained"). A photo linked to a room type (0060) matches on that link,
 * so its en-suite bathroom counts; an older, unlinked photo matches only if it
 * shows that bedroom type. A photo with no self-contained flag fits both the
 * self-contained and the shared-bathroom version of its room type. */
export function photosForRoomType<T extends VerificationPhoto>(
  photos: T[],
  roomType: { category: string; selfContained: boolean },
): T[] {
  return photos.filter((photo) => {
    const belongs = photo.roomCategory
      ? photo.roomCategory === roomType.category
      : photo.category === `${roomType.category}_bedroom`;
    return belongs && (photo.selfContained == null || photo.selfContained === roomType.selfContained);
  });
}
