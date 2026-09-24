import { ChatArea } from "./ui/chat-area";

export const AiChatbox = ({ SENTENCES, category, topic }) => {
  return (
    <div>
      <ChatArea SENTENCES={SENTENCES} category={category} topic={topic} />
    </div>
  );
};
