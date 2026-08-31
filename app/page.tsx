import { Chat } from '@/components/chat';

export default function Page() {
  return <Chat sourcePath={process.cwd()} />;
}
