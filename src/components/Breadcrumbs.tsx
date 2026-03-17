import { Link } from "react-router-dom";
import {
  Breadcrumb,
  BreadcrumbList,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { useBreadcrumbs } from "@/hooks/useBreadcrumbs";
import { cn } from "@/lib/utils";
import { Fragment } from "react";

interface BreadcrumbsProps {
  /** Override the auto-derived crumbs (optional) */
  className?: string;
  /** Compact mode for tight headers */
  compact?: boolean;
}

export function Breadcrumbs({ className, compact }: BreadcrumbsProps) {
  const crumbs = useBreadcrumbs();

  if (crumbs.length <= 1) return null;

  return (
    <Breadcrumb className={cn(compact && "text-xs", className)}>
      <BreadcrumbList>
        {crumbs.map((crumb, i) => (
          <Fragment key={i}>
            {i > 0 && <BreadcrumbSeparator />}
            <BreadcrumbItem>
              {crumb.path ? (
                <BreadcrumbLink asChild>
                  <Link to={crumb.path}>{crumb.label}</Link>
                </BreadcrumbLink>
              ) : (
                <BreadcrumbPage>{crumb.label}</BreadcrumbPage>
              )}
            </BreadcrumbItem>
          </Fragment>
        ))}
      </BreadcrumbList>
    </Breadcrumb>
  );
}
