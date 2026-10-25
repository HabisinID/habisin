"use client";
import { Component, type ReactNode } from "react";
export default class MapBoundary extends Component<
  { children: ReactNode; onFallback: () => void },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? (
      <div role="alert" className="space-y-3 bg-[var(--color-cream)] p-5 text-sm">
        <p>Peta belum dapat dimuat. Gunakan daftar makanan atau coba lagi.</p>
        <button
          className="mr-4 min-h-11 font-bold text-[var(--color-brand)]"
          onClick={() => this.setState({ failed: false })}
        >
          Coba lagi peta
        </button>
        <button
          className="min-h-11 font-bold text-[var(--color-brand)]"
          onClick={this.props.onFallback}
        >
          Kembali ke daftar
        </button>
      </div>
    ) : (
      this.props.children
    );
  }
}
