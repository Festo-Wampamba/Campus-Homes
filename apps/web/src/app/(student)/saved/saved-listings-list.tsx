"use client";
import { useState } from "react";
import Link from "next/link";
import type { ListingSearchResult } from "@campushomes/shared";
import { HostelCard } from "@/components/hostel-card";
import { api } from "@/lib/api";
export function SavedListingsList({initial}:{initial:ListingSearchResult[]}) {
  const [listings,setListings] = useState(initial);
  async function remove(id:string) {
    await api(`/students/saved-listings/${id}`, {method:"DELETE"});
    setListings(rows => rows.filter(row => row.id !== id));
  }
  return listings.length ? <ul className="mt-8 grid gap-6 sm:grid-cols-2 xl:grid-cols-3">{listings.map(row => <li key={row.id}><HostelCard listing={row} onRemove={remove}/></li>)}</ul> : <div className="mt-8 rounded-2xl border border-dashed border-border p-8"><h2 className="text-xl">Find a place you love</h2><p className="mt-2 text-muted-foreground">Saved hostels stay in your student account.</p><Link href="/search" className="mt-4 inline-flex min-h-11 items-center font-semibold text-primary">Explore Makerere hostels</Link></div>;
}
