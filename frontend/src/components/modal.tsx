"use client";
import { useEffect, useRef, useId } from "react";
import { X } from "lucide-react";
export default function Modal({
  title,
  onClose,
  children,
  wide = false,
  fullscreen = false,
  sheet = false,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  wide?: boolean;
  fullscreen?: boolean;
  sheet?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const id = useId();
  useEffect(() => {
    const dialog = ref.current;
    const previous = document.activeElement as HTMLElement;
    dialog?.showModal();
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      dialog?.close();
      document.body.style.overflow = overflow;
      previous?.focus();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      className={
        fullscreen
          ? "modal fixed inset-0 m-0 h-dvh w-screen max-h-none max-w-none overflow-hidden border-0 bg-[var(--color-cream)] p-0 text-[var(--color-dark)]"
          : `modal m-auto ${sheet ? "w-[min(490px,100%)] rounded-xl p-4 max-[760px]:fixed max-[760px]:inset-x-0 max-[760px]:bottom-0 max-[760px]:mb-0 max-[760px]:rounded-b-none" : `p-[27px] ${wide ? "w-[min(1040px,_calc(100%_-_28px))] rounded-xl tablet:p-5" : "w-[min(490px,_calc(100%_-_28px))] rounded-[18px] mobile:p-[22px]"}`} max-h-[calc(100dvh_-_40px)] overflow-auto bg-cream [border:1px_solid_var(--color-line)] text-dark shadow-[0_25px_100px_#10281740] backdrop:bg-black/45 backdrop:[backdrop-filter:blur(5px)] [&_h2]:text-[23px] [&_h2]:font-bold [&_h2]:tracking-[-0.8px] [&_h3]:font-bold mobile:[&_h2]:text-[21px]`
      }
      aria-label={fullscreen ? title : undefined}
      aria-labelledby={fullscreen ? undefined : id}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      {!fullscreen && (
        <div className="modal-head flex items-center justify-between gap-[15px] mb-[23px]">
          <h2 id={id}>{title}</h2>
          <button
            className="icon-button inline-grid place-items-center p-[5px] text-[var(--color-muted)] rounded-[5px] hover:bg-[var(--color-light)]"
            aria-label="Tutup"
            onClick={onClose}
          >
            <X size={21} />
          </button>
        </div>
      )}
      {children}
    </dialog>
  );
}
