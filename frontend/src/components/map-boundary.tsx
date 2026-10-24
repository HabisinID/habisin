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
      <div role="alert" className="space-y-3 bg-[#fbf7ec] p-5 text-sm">
        <p>Peta belum dapat dimuat. Gunakan daftar makanan atau coba lagi.</p>
        <button
          className="mr-4 min-h-11 font-bold text-[#3e6b26]"
          onClick={() => this.setState({ failed: false })}
        >
          Coba lagi peta
        </button>
        <button
          className="min-h-11 font-bold text-[#3e6b26]"
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
