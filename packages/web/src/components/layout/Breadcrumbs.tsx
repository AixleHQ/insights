import { Fragment } from "react";
import { Link, useLocation, useParams } from "react-router-dom";
import { ChevronRight, Home } from "lucide-react";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";

interface BreadcrumbConfig {
  label: string;
  href?: string;
}

const routeLabels: Record<string, string> = {
  events: "Events",
  projects: "Projects",
  integrations: "Integrations",
  team: "Team",
  settings: "Settings",
  new: "New",
  invite: "Invite",
  policies: "Policies",
  alerts: "Alerts",
  billing: "Billing",
};

function useBreadcrumbs(): BreadcrumbConfig[] {
  const location = useLocation();
  // Note: params available for future use with dynamic breadcrumb labels
  useParams();

  const pathSegments = location.pathname.split("/").filter(Boolean);

  if (pathSegments.length === 0) {
    return [{ label: "Dashboard" }];
  }

  const crumbs: BreadcrumbConfig[] = [{ label: "Dashboard", href: "/" }];

  let currentPath = "";
  pathSegments.forEach((segment, index) => {
    currentPath += `/${segment}`;
    const isLast = index === pathSegments.length - 1;

    // Check if this is an ID parameter (UUID format or numeric)
    const isId = /^[0-9a-f-]{36}$/.test(segment) || /^\d+$/.test(segment);

    if (isId) {
      // For IDs, we'll show a generic label or could fetch the actual name
      crumbs.push({
        label: "Detail",
        href: isLast ? undefined : currentPath,
      });
    } else {
      crumbs.push({
        label: routeLabels[segment] || segment.charAt(0).toUpperCase() + segment.slice(1),
        href: isLast ? undefined : currentPath,
      });
    }
  });

  return crumbs;
}

export function Breadcrumbs() {
  const crumbs = useBreadcrumbs();

  if (crumbs.length <= 1) {
    return null;
  }

  return (
    <Breadcrumb>
      <BreadcrumbList>
        {crumbs.map((crumb, index) => {
          const isLast = index === crumbs.length - 1;

          return (
            <Fragment key={index}>
              {index > 0 && (
                <BreadcrumbSeparator>
                  <ChevronRight className="size-3.5" />
                </BreadcrumbSeparator>
              )}
              <BreadcrumbItem>
                {isLast ? (
                  <BreadcrumbPage>{crumb.label}</BreadcrumbPage>
                ) : (
                  <BreadcrumbLink asChild>
                    <Link to={crumb.href || "/"}>
                      {index === 0 ? (
                        <span className="flex items-center gap-1.5">
                          <Home className="size-3.5" />
                          <span className="sr-only md:not-sr-only">{crumb.label}</span>
                        </span>
                      ) : (
                        crumb.label
                      )}
                    </Link>
                  </BreadcrumbLink>
                )}
              </BreadcrumbItem>
            </Fragment>
          );
        })}
      </BreadcrumbList>
    </Breadcrumb>
  );
}
