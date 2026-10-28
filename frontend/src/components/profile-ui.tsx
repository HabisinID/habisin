import type { ReactNode } from "react";
import { ShieldCheck } from "lucide-react";
import { Avatar } from "./profile-picture";
import type { User } from "@/lib/api";

export const profileField =
  "w-full min-w-0 min-h-11 rounded-lg border border-border bg-surface px-3.5 py-3 text-sm text-dark transition-colors placeholder:text-muted/70 focus:border-brand focus:outline-2 focus:outline-brand/30 disabled:bg-surface-2 disabled:text-muted";
export const profileLabel =
  "flex min-w-0 flex-col gap-2 text-sm font-semibold [&_small]:text-xs [&_small]:font-normal [&_small]:leading-relaxed [&_small]:text-muted";
export const profileSection =
  "grid min-w-0 grid-cols-1 gap-5 border-b border-line pb-8 last:border-0";
export const profilePrimary =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-brand px-5 py-3 text-sm font-bold text-on-brand transition-colors hover:bg-brand-hover disabled:opacity-50";
export const profileSecondary =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-border bg-surface px-4 py-3 text-sm font-semibold transition-colors hover:bg-surface-2";
export const profileTabs =
  "flex flex-wrap gap-1 border-b border-line pb-3 [&_button]:min-h-11 [&_button]:rounded-lg [&_button]:px-4 [&_button]:py-2 [&_button]:text-sm [&_button]:font-semibold [&_button]:text-muted [&_button:hover]:bg-light [&_button[aria-pressed=true]]:bg-light [&_button[aria-pressed=true]]:text-brand";

export function ProfileSectionHeading({
  letter,
  children,
  description,
  numbered = false,
}: {
  letter: string;
  children: ReactNode;
  description?: string;
  numbered?: boolean;
}) {
  return (
    <div className="mb-1 flex items-start gap-3">
      <span
        aria-hidden="true"
        className="grid size-8 shrink-0 place-items-center rounded-lg border border-line bg-light font-mono text-xs font-bold text-brand"
      >
        {letter}
      </span>
      <div className="min-w-0">
        <h2
          aria-label={numbered ? `${letter} · ${children}` : undefined}
          className="text-lg font-extrabold tracking-tight text-dark"
        >
          {children}
        </h2>
        {description && (
          <p className="mt-1 max-w-xl text-xs leading-relaxed text-muted">
            {description}
          </p>
        )}
      </div>
    </div>
  );
}

export function ProfileIdentity({ user }: { user: User }) {
  return (
    <div className="flex items-center gap-4 rounded-xl border border-line bg-surface p-5">
      <span className="grid size-16 shrink-0 place-items-center overflow-hidden rounded-full bg-light text-xl font-bold text-brand ring-4 ring-cream">
        <Avatar src={user.profile_picture} name={user.name || user.username} />
      </span>
      <div className="min-w-0">
        <p className="break-words text-lg font-extrabold tracking-tight">
          {user.name || user.username}
        </p>
        <p className="mt-1 break-all text-xs text-muted">@{user.username}</p>
        <span className="mt-2 inline-flex items-center gap-1.5 text-xs font-semibold text-brand">
          <ShieldCheck size={13} />
          {user.role === "buyer"
            ? "Pembeli"
            : user.role === "partner"
              ? "Mitra Habisin"
              : "Admin"}
        </span>
      </div>
    </div>
  );
}
