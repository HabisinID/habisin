"use client";
import { useEffect, useRef, useId } from "react";
import { X } from "lucide-react";
export default function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
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
      className="modal m-auto p-[27px] w-[min(490px,_calc(100%_-_28px))] max-h-[calc(100dvh_-_40px)] overflow-auto bg-cream [border:1px_solid_#dfe6d8] rounded-[18px] text-dark shadow-[0_25px_100px_#10281740] backdrop:bg-[#162c236e] backdrop:[backdrop-filter:blur(5px)] [&_h2]:text-[23px] [&_h2]:font-bold [&_h2]:tracking-[-0.8px] [&_h3]:font-bold mobile:p-[22px] mobile:[&_h2]:text-[21px]"
      aria-labelledby={id}
      onCancel={onClose}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="modal-head flex items-center justify-between gap-[15px] mb-[23px]">
        <h2 id={id}>{title}</h2>
        <button
          className="icon-button inline-grid place-items-center p-[5px] text-[#708168] rounded-[5px] hover:bg-[#edf1e7]"
          aria-label="Tutup"
          onClick={onClose}
        >
          <X size={21} />
        </button>
      </div>
      {children}
    </dialog>
  );
}
