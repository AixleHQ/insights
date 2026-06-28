import { useNavigate } from "react-router-dom";
import { FullPageError } from "@/components/FullPageError";
import illustration from "@/assets/illustrations/404.svg";

export function NotFound() {
  const navigate = useNavigate();

  return (
    <FullPageError
      illustration={illustration}
      title="We couldn't find that page"
      description="The page you're looking for doesn't exist or has been moved."
      actions={[
        { label: "Back to dashboard", href: "/" },
        { label: "Go back", variant: "outline", onClick: () => navigate(-1) },
      ]}
    />
  );
}
