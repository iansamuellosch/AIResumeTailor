import type { ComponentProps } from "react";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function RemoveButton({ children, className, ...props }: ComponentProps<typeof Button>) {
  return <Button {...props} type="button" variant="outline" size="sm" className={cn("cursor-pointer border-destructive/50 text-destructive hover:border-destructive hover:bg-destructive/10 hover:text-destructive focus-visible:ring-destructive/30", className)}>
    <Trash2 aria-hidden="true" />{children}
  </Button>;
}
