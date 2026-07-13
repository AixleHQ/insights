import { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useOrg } from "@/contexts/OrgContext";

export function useOrgNavGuard(redirectTo: string) {
  const { currentOrg } = useOrg();
  const navigate = useNavigate();
  const prevOrgId = useRef(currentOrg?.id);

  useEffect(() => {
    if (prevOrgId.current !== undefined && prevOrgId.current !== currentOrg?.id) {
      navigate(redirectTo);
    }
    prevOrgId.current = currentOrg?.id;
  }, [currentOrg?.id, navigate, redirectTo]);
}
