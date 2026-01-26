import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { useOrg } from '@/contexts/OrgContext';
import { EventDetail, type EventDetailData } from '@/components/events';

// Mock data for demonstration
const mockEventDetail: EventDetailData = {
  id: '1',
  tool_name: 'Claude Code',
  event_type: 'prompt',
  risk_level: 'high',
  cost_usd: 0.0456,
  token_count: 1234,
  created_at: new Date(Date.now() - 1000 * 60 * 30).toISOString(),
  sanitized_at: new Date(Date.now() - 1000 * 60 * 29).toISOString(),
  classified_at: new Date(Date.now() - 1000 * 60 * 28).toISOString(),
  user: {
    id: 'user-1',
    email: 'developer@example.com',
    name: 'Jane Developer',
  },
  project: {
    id: 'proj-1',
    name: 'backend-services',
  },
  raw_content: `You are helping me debug an issue with our API.

Here's the relevant code:

\`\`\`python
def authenticate(request):
    api_key = os.environ.get('OPENAI_API_KEY')
    secret = 'sk-1234567890abcdef...'  # TODO: remove hardcoded key

    if request.headers.get('Authorization') == f'Bearer {api_key}':
        return True
    return False
\`\`\`

Why isn't this working in production?`,
  sanitized_content: `You are helping me debug an issue with our API.

Here's the relevant code:

\`\`\`python
def authenticate(request):
    api_key = os.environ.get('[REDACTED_ENV_VAR]')
    secret = '[REDACTED_API_KEY]'  # TODO: remove hardcoded key

    if request.headers.get('Authorization') == f'Bearer {api_key}':
        return True
    return False
\`\`\`

Why isn't this working in production?`,
  metadata: {
    model: 'claude-3-opus-20240229',
    temperature: 0.7,
    max_tokens: 4096,
    client_version: '1.2.3',
    session_id: 'sess_abc123',
    file_context: ['src/auth.py', 'src/config.py'],
  },
  findings: [
    {
      type: 'api_key',
      severity: 'critical',
      description: 'Hardcoded API key detected in code snippet',
      location: 'Line 3: secret = \'sk-1234567890abcdef...\'',
    },
    {
      type: 'env_variable',
      severity: 'medium',
      description: 'Environment variable name exposed',
      location: 'Line 2: OPENAI_API_KEY',
    },
  ],
};

export function EventDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { currentOrg } = useOrg();
  const [isLoading, setIsLoading] = useState(true);
  const [event, setEvent] = useState<EventDetailData | null>(null);

  useEffect(() => {
    if (!currentOrg || !id) return;

    const fetchEvent = async () => {
      setIsLoading(true);
      try {
        // In production, this would be a real API call
        // const response = await api.get(`/organizations/${currentOrg.id}/events/${id}`);
        await new Promise((resolve) => setTimeout(resolve, 500));
        setEvent({ ...mockEventDetail, id });
      } catch (error) {
        console.error('Failed to fetch event:', error);
        setEvent(null);
      } finally {
        setIsLoading(false);
      }
    };

    fetchEvent();
  }, [currentOrg, id]);

  return <EventDetail event={event} isLoading={isLoading} />;
}
