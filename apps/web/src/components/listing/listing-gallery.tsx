"use client";

import { useState } from "react";
import Image from "next/image";
import { Camera, Expand } from "lucide-react";
import { listingPhotoUrl } from "@/lib/cloudinary";
import { PhotoLightbox, type LightboxState } from "@/components/listing/photo-lightbox";

type GalleryPhoto = { id: string; storageKey: string; group?: string };
export function ListingGallery({ photos, propertyName }: { photos: GalleryPhoto[]; propertyName: string }) {
  const [lightbox, setLightbox] = useState<LightboxState | null>(null);
  const [group, setGroup] = useState("All photos");
  const groups = ["All photos", ...new Set(photos.map(photo => photo.group).filter((value): value is string => !!value))];
  const filtered = group === "All photos" ? photos : photos.filter(photo => photo.group === group);
  function open(index: number) { setLightbox({ photos: filtered, index, caption: `${propertyName} · ${group}` }); }
  if (!photos.length) return <div className="flex aspect-[16/9] items-center justify-center rounded-2xl bg-muted text-muted-foreground"><Camera aria-hidden className="mr-2 size-5"/>No property photos available</div>;
  return <>
    <div className="relative"><div className={`flex snap-x snap-mandatory gap-2 overflow-x-auto rounded-2xl sm:grid sm:h-[430px] sm:grid-rows-2 sm:overflow-hidden ${filtered.length === 1 ? "sm:grid-cols-1" : "sm:grid-cols-4"}`}>
      {filtered.map((photo,index) => <button key={photo.id} type="button" onClick={() => open(index)} aria-label={`Open ${photo.group ?? "property"} photo ${index + 1} of ${filtered.length}`} className={`relative aspect-[4/3] w-full shrink-0 snap-center overflow-hidden bg-muted sm:aspect-auto ${index === 0 ? (filtered.length === 1 ? "sm:row-span-2" : "sm:col-span-2 sm:row-span-2") : filtered.length === 2 ? "sm:col-span-2 sm:row-span-2" : filtered.length === 3 ? "sm:col-span-2" : index > 4 ? "sm:hidden" : ""}`}><GalleryImage photo={photo} name={propertyName} priority={index === 0}/><span className="absolute bottom-3 left-3 rounded-full bg-black/65 px-3 py-2 text-xs text-white">{photo.group ?? "Property"} · {index + 1}/{filtered.length}</span></button>)}
    </div><button className="absolute right-3 bottom-3 flex min-h-11 items-center gap-2 rounded-full bg-card px-4 text-sm font-semibold shadow-sm" onClick={() => open(0)}><Expand aria-hidden className="size-4"/>View gallery</button></div>
    {groups.length > 1 && <div className="mt-3 flex flex-wrap gap-2" aria-label="Photo groups">{groups.map(value => <button type="button" key={value} aria-pressed={group === value} className={`min-h-11 rounded-full border border-border px-4 text-sm ${group === value ? "bg-primary text-primary-foreground" : "bg-card"}`} onClick={() => setGroup(value)}>{value}</button>)}</div>}
    <PhotoLightbox state={lightbox} propertyName={propertyName} onClose={() => setLightbox(null)} onNavigate={delta => setLightbox(state => state ? {...state,index:(state.index+delta+state.photos.length)%state.photos.length} : null)}/>
  </>;
}
function GalleryImage({photo,name,priority}:{photo:GalleryPhoto;name:string;priority:boolean}) {
  const [failed,setFailed] = useState(false); const url=listingPhotoUrl(photo.storageKey,priority?1200:600);
  return !failed && url ? <Image src={url} alt={`${name} · ${photo.group ?? "Property"}`} fill sizes={priority ? "(min-width:640px) 50vw, 100vw" : "(min-width:640px) 25vw,100vw"} priority={priority} className="object-cover" onError={() => setFailed(true)}/> : <span className="flex h-full items-center justify-center gap-2 text-sm text-muted-foreground"><Camera aria-hidden className="size-5"/>Photo unavailable</span>;
}
