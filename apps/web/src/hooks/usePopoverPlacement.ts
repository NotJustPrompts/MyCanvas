import { type CSSProperties, type RefObject, useLayoutEffect, useRef, useState } from "react";

interface PopoverPlacement {
  ref: RefObject<HTMLDivElement | null>;
  style: CSSProperties;
}

/**
 * Viewport-aware popover placement. The popover is absolutely positioned
 * below its anchor by default (via CSS); after mount this hook measures it
 * and flips it above the anchor when there is not enough room below, and
 * clamps it horizontally to the viewport with an 8px margin.
 *
 * The popover element's offset parent must be the anchor container
 * (position: relative), which is the convention for our inputs.
 */
export function usePopoverPlacement(open: boolean): PopoverPlacement {
  const ref = useRef<HTMLDivElement | null>(null);
  const [style, setStyle] = useState<CSSProperties>({});

  useLayoutEffect(() => {
    if (!open) {
      setStyle({});
      return;
    }
    const popover = ref.current;
    const anchor = popover?.offsetParent instanceof HTMLElement ? popover.offsetParent : null;
    if (!popover || !anchor) {
      return;
    }
    const anchorRect = anchor.getBoundingClientRect();
    const rect = popover.getBoundingClientRect();
    const next: CSSProperties = {};
    const fitsBelow = anchorRect.bottom + 6 + rect.height <= window.innerHeight - 8;
    if (!fitsBelow && anchorRect.top - 6 - rect.height > 8) {
      next.top = "auto";
      next.bottom = "calc(100% + 6px)";
    }
    const overflowRight = anchorRect.left + rect.width - (window.innerWidth - 8);
    if (overflowRight > 0) {
      next.left = Math.max(8 - anchorRect.left, -overflowRight);
    }
    setStyle(next);
  }, [open]);

  return { ref, style };
}
