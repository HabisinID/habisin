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
      className="modal mt-auto mr-auto mb-auto ml-auto pt-[27px] pr-[27px] pb-[27px] pl-[27px] w-[min(490px,_calc(100%_-_28px))] max-h-[calc(100dvh_-_40px)] overflow-auto bg-[var(--cream)] [border:1px_solid_#dfe6d8] rounded-[18px] text-[var(--dark)] shadow-[0_25px_100px_#10281740] [&::backdrop]:bg-[#162c236e] [&::backdrop]:[backdrop-filter:blur(5px)] [&_h2]:text-[23px] [&_h2]:font-bold [&_h2]:tracking-[-0.8px] [&_h3]:font-bold [@media(width<=480px)]:pt-[22px] [@media(width<=480px)]:pr-[22px] [@media(width<=480px)]:pb-[22px] [@media(width<=480px)]:pl-[22px] [@media(width<=480px)]:[&_h2]:text-[21px]"
      aria-labelledby={id}
      onCancel={onClose}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="modal-head flex items-center justify-between gap-[15px] mb-[23px]">
        <h2 id={id}>{title}</h2>
        <button
          className="icon-button [display:inline-grid] place-items-center pt-[5px] pr-[5px] pb-[5px] pl-[5px] text-[#708168] rounded-[5px] [&:hover]:bg-[#edf1e7]"
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
