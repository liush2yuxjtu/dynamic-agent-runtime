import { Chat } from '@/components/chat';

export default function Page() {
  return (
    <Chat
      sourcePath={process.cwd()}
      sessionId={
        process.env.PI_SESSION_ID ?? '01a056e2-b4e7-72b5-af94-da38c01fca27'
      }
    />
  );
}
