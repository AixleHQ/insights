import projectsUrl from "@/assets/illustrations/projects.svg?url";
import notificationUrl from "@/assets/illustrations/notification.svg?url";
import eventsListUrl from "@/assets/illustrations/events-list.svg?url";
import membersUrl from "@/assets/illustrations/members.svg?url";
import alertHistoryUrl from "@/assets/illustrations/alert-history.svg?url";
import dashboardUrl from "@/assets/illustrations/dashboard.svg?url";
import unattributedEventsUrl from "@/assets/illustrations/unattributed-events.svg?url";
import connectorsUrl from "@/assets/illustrations/connectors.svg?url";
import projectAlertsUrl from "@/assets/illustrations/project-alerts.svg?url";
import projectIssuesUrl from "@/assets/illustrations/project-issues.svg?url";

export function ProjectsIllustration() {
  return <img src={projectsUrl} alt="" className="w-full h-auto" />;
}

export function NotificationIllustration() {
  return <img src={notificationUrl} alt="" className="w-full h-auto" />;
}

export function EventsIllustration() {
  return <img src={eventsListUrl} alt="" className="w-full h-auto" />;
}

export function MembersIllustration() {
  return <img src={membersUrl} alt="" className="w-full h-auto" />;
}

export function AlertHistoryIllustration() {
  return <img src={alertHistoryUrl} alt="" className="w-full h-auto" />;
}

export function DashboardIllustration() {
  return <img src={dashboardUrl} alt="" className="w-full h-auto" />;
}

export function UnattributedEventsIllustration() {
  return <img src={unattributedEventsUrl} alt="" className="w-full h-auto" />;
}

export function ConnectorsIllustration() {
  return <img src={connectorsUrl} alt="" className="w-full h-auto" />;
}

export function ProjectAlertsIllustration() {
  return <img src={projectAlertsUrl} alt="" className="w-full h-auto" />;
}

export function ProjectIssuesIllustration() {
  return <img src={projectIssuesUrl} alt="" className="w-full h-auto" />;
}
