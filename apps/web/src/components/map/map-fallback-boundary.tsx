"use client";
import { Component, type ReactNode } from "react";
export class MapFallbackBoundary extends Component<{children:ReactNode},{failed:boolean}> {
  state = {failed:false};
  static getDerivedStateFromError() { return {failed:true}; }
  render() { return this.state.failed ? <div role="status" className="flex h-full items-center justify-center bg-muted p-8 text-center"><p>The map is unavailable on this device. Use the hostel list to explore every result.</p></div> : this.props.children; }
}
