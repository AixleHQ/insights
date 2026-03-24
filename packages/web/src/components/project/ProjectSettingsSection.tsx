import { useState, useEffect } from 'react';
import { Loader2, Save } from 'lucide-react';
import {
  useProjectSettings,
  useUpdateProjectSetting,
  useDeleteProjectSetting,
} from '@/hooks/useApi';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';

export function ProjectSettingsSection({ projectId }: { projectId: string }) {
  const { data: settings, isLoading } = useProjectSettings(projectId);
  const updateSetting = useUpdateProjectSetting();
  const deleteSetting = useDeleteProjectSetting();

  const [emailDomain, setEmailDomain] = useState('');

  const savedEmailDomain =
    (settings as { data: Array<{ key: string; value: string }> })?.data?.find(
      (s) => s.key === 'allowed_email_domain'
    )?.value ?? '';

  useEffect(() => {
    setEmailDomain(savedEmailDomain);
  }, [savedEmailDomain]);

  const handleSaveEmailDomain = async () => {
    try {
      const trimmed = emailDomain.trim().toLowerCase();
      if (!trimmed && savedEmailDomain) {
        await deleteSetting.mutateAsync({ projectId, key: 'allowed_email_domain' });
      } else if (trimmed) {
        await updateSetting.mutateAsync({
          projectId,
          key: 'allowed_email_domain',
          value: trimmed,
        });
      }
    } catch (error) {
      console.error('Failed to save email domain:', error);
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-5 w-48" />
          <Skeleton className="h-4 w-72" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-9 w-full" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Email Domain Auto-Join</CardTitle>
        <CardDescription>
          Users who register with this email domain will automatically join this project
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="projectEmailDomain">Allowed Email Domain</Label>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">@</span>
              <Input
                id="projectEmailDomain"
                className="pl-7"
                value={emailDomain}
                onChange={(e) => setEmailDomain(e.target.value)}
                placeholder="example.com"
              />
            </div>
            <Button
              onClick={handleSaveEmailDomain}
              disabled={updateSetting.isPending || deleteSetting.isPending || emailDomain.trim().toLowerCase() === savedEmailDomain}
            >
              {updateSetting.isPending && <Loader2 className="mr-2 size-4 animate-spin" />}
              <Save className="mr-2 size-4" />
              Save
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Leave empty to disable auto-join. Only one domain is supported per project.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
