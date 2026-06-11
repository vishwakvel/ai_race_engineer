import type { ButtonHTMLAttributes } from "react";
import clsx from "clsx";

type Variant = "control" | "primary" | "hero" | "ghost";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
}

const BASE =
  "font-display uppercase cursor-pointer transition-colors duration-150 " +
  "disabled:cursor-not-allowed disabled:opacity-45";

const VARIANTS: Record<Variant, string> = {
  /** Neutral bordered control (lap prev/next, pause). */
  control:
    "bg-transparent border border-dash-border text-dash-text-primary " +
    "text-[11px] tracking-[0.06em] rounded-sm px-3.5 py-3 " +
    "enabled:hover:border-dash-border-bright",
  /** Red-accent action (LOAD RACE). */
  primary:
    "bg-transparent border border-ferrari-red text-ferrari-red font-bold " +
    "text-[13px] tracking-[0.08em] rounded-sm px-[18px] py-2.5 " +
    "enabled:hover:bg-ferrari-red enabled:hover:text-white",
  /** Marketing CTA (OPEN PIT WALL). */
  hero:
    "bg-transparent border border-ferrari-red text-white font-bold " +
    "text-[15px] tracking-[0.15em] rounded-sm px-8 py-3.5 " +
    "enabled:hover:bg-ferrari-red",
  /** Borderless inline action (Close, PRE-RACE BRIEF). */
  ghost:
    "bg-transparent border-none text-dash-text-secondary text-[12px] " +
    "enabled:hover:text-dash-text-primary p-0",
};

export function Button({
  variant = "control",
  className,
  type = "button",
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      className={clsx(BASE, VARIANTS[variant], className)}
      {...rest}
    />
  );
}
