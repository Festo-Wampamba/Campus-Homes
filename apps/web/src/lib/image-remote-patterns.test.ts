import { hasRemoteMatch } from "next/dist/shared/lib/match-remote-pattern";

import { imageRemotePatterns } from "./image-remote-patterns";

const PINNED = {
  NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME: "campushomes",
  B2_S3_ENDPOINT: "https://s3.eu-central-003.backblazeb2.com",
  B2_BUCKET: "campushomes-media-production",
};

function allowed(env: Record<string, string | undefined>, url: string): boolean {
  return hasRemoteMatch([], imageRemotePatterns(env), new URL(url));
}

describe("imageRemotePatterns", () => {
  test.each([
    "https://res.cloudinary.com/campushomes/image/upload/v1/photo.jpg",
    "https://s3.eu-central-003.backblazeb2.com/campushomes-media-production/uploads/u1/a",
  ])("allows our own storage: %s", (url) => {
    expect(allowed(PINNED, url)).toBe(true);
  });

  test.each([
    "https://res.cloudinary.com/attacker/image/upload/v1/evil.avif",
    "https://s3.eu-central-003.backblazeb2.com/attacker-bucket/evil.avif",
    "https://s3.eu-central-003.backblazeb2.com/campushomes-media-staging/uploads/u1/a",
    "https://attacker.s3.eu-central-003.backblazeb2.com/campushomes-media-production/evil.avif",
    "https://f003.backblazeb2.com/file/attacker-bucket/evil.avif",
  ])("refuses storage we do not own when pinned: %s", (url) => {
    expect(allowed(PINNED, url)).toBe(false);
  });

  test.each([
    "https://s3.eu-central-003.backblazeb2.com/campushomes-media-production/uploads/u1/a",
    "https://s3.us-west-004.backblazeb2.com/campushomes-media-staging/uploads/u1/a",
  ])("allows our own buckets when the build has no B2 config: %s", (url) => {
    expect(allowed({}, url)).toBe(true);
  });

  test.each([
    "https://s3.eu-central-003.backblazeb2.com/attacker-bucket/evil.avif",
    "https://attacker.s3.eu-central-003.backblazeb2.com/campushomes-media-production/evil.avif",
    "https://res.cloudinary.com/attacker/image/upload/v1/evil.avif",
  ])("refuses foreign storage when the build has no B2 or Cloudinary config: %s", (url) => {
    expect(allowed({}, url)).toBe(false);
  });
});
